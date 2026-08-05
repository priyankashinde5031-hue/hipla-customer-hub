import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPaise, formatPaiseShort } from "@/lib/currency";
import { formatMonthYear } from "@/lib/date";
import { renewalDate } from "@/lib/renewals";
import { toYearMonth, type RecognitionMethod } from "@/lib/revenue-engine";
import { currentYearMonth } from "@/lib/revenue-schedule";
import {
  classifyLineItem,
  isRenewalOverdue,
  REASON_LABEL,
  type WorklistReason,
} from "@/lib/revenue-worklist";
import { WorklistLineEditor } from "./worklist-editor";

// /revenue/unrecognised — the data-quality worklist (spec §9). Every line item
// producing no schedule (or on a shaky anchor), grouped by reason, with the ₹ at
// risk up top and inline editing so the whole backfill runs from one screen.
export default async function UnrecognisedRevenuePage() {
  const supabase = await createClient();

  // 1. Every line item, with its PO / org / contract term / covered sites.
  const { data: lineItemsRaw } = await supabase.from("po_line_items").select(
    `id, description, amount_paise, recognition_method, coverage_months, revenue_excluded,
     po:purchase_orders!inner (
       id, po_number, organization_id,
       contract_time:contract_times!contract_time_id ( months ),
       organization:organizations!organization_id ( legal_name, brand_name ),
       po_sites ( site_id )
     )`,
  );

  // 2. Implementation anchors per PO: stage 4 = actual go-live, stage 1 = expected.
  const { data: implProjects } = await supabase
    .from("implementation_projects")
    .select("po_id, stages:implementation_project_stages ( stage_number, data )");

  const poGoLive = new Map<string, string>();
  const poExpected = new Map<string, string>();
  for (const p of implProjects ?? []) {
    if (!p.po_id) continue;
    const s4 = (p.stages ?? []).find((s) => s.stage_number === 4);
    const s1 = (p.stages ?? []).find((s) => s.stage_number === 1);
    const gl = (s4?.data as { goLiveDate?: string } | null)?.goLiveDate;
    const ex = (s1?.data as { expectedDeliveryDate?: string } | null)?.expectedDeliveryDate;
    if (gl && !poGoLive.has(p.po_id)) poGoLive.set(p.po_id, gl);
    if (ex && !poExpected.has(p.po_id)) poExpected.set(p.po_id, ex);
  }

  // 3. Classify every line item into a reason (or null = fine / excluded).
  type Row = {
    id: string;
    description: string;
    amountPaise: number;
    method: RecognitionMethod | null;
    coverageMonths: number;
    orgName: string;
    poNumber: string;
    siteId: string | null;
    reason: WorklistReason;
  };
  const groups: Record<WorklistReason, Row[]> = {
    no_anchor: [],
    no_method: [],
    coverage_review: [],
  };

  for (const li of lineItemsRaw ?? []) {
    const po = Array.isArray(li.po) ? li.po[0] : li.po;
    if (!po) continue;
    const ct = Array.isArray(po.contract_time) ? po.contract_time[0] : po.contract_time;
    const org = Array.isArray(po.organization) ? po.organization[0] : po.organization;
    const reason = classifyLineItem({
      recognitionMethod: li.recognition_method,
      coverageMonths: li.coverage_months ?? 12,
      revenueExcluded: !!li.revenue_excluded,
      hasGoLive: poGoLive.has(po.id),
      hasExpected: poExpected.has(po.id),
      contractTermMonths: ct?.months ?? null,
    });
    if (!reason) continue;
    groups[reason].push({
      id: li.id,
      description: li.description,
      amountPaise: li.amount_paise,
      method: (li.recognition_method as RecognitionMethod | null) ?? null,
      coverageMonths: li.coverage_months ?? 12,
      orgName: org?.brand_name || org?.legal_name || "—",
      poNumber: po.po_number,
      siteId: (po.po_sites ?? [])[0]?.site_id ?? null,
      reason,
    });
  }

  const atRisk =
    groups.no_anchor.reduce((t, r) => t + r.amountPaise, 0) +
    groups.no_method.reduce((t, r) => t + r.amountPaise, 0) +
    groups.coverage_review.reduce((t, r) => t + r.amountPaise, 0);
  const flaggedCount =
    groups.no_anchor.length + groups.no_method.length + groups.coverage_review.length;

  // 4. Overdue renewals: past their start month but not marked done.
  const { data: renewalsRaw } = await supabase
    .from("renewals")
    .select(
      `id, po_id, year_number, offset_months, expected_value_paise, renewal_value_paise,
       renewal_date_override, status, anchor_site_id,
       organization:organizations!organization_id ( legal_name, brand_name ),
       po:purchase_orders!inner ( po_number )`,
    )
    .neq("status", "renewed");

  const nowYm = currentYearMonth();
  const overdueRenewals = (renewalsRaw ?? [])
    .map((r) => {
      const goLive = poGoLive.get(r.po_id) ?? null;
      const expected = poExpected.get(r.po_id) ?? null;
      const base = goLive ?? expected;
      const eff = r.renewal_date_override ?? (base ? renewalDate(base, r.offset_months) : null);
      const startYm = toYearMonth(eff);
      const org = Array.isArray(r.organization) ? r.organization[0] : r.organization;
      const po = Array.isArray(r.po) ? r.po[0] : r.po;
      return {
        id: r.id,
        yearNumber: r.year_number,
        startYm,
        startDate: eff,
        valuePaise: r.expected_value_paise ?? 0,
        orgName: org?.brand_name || org?.legal_name || "—",
        poNumber: po?.po_number ?? "—",
        siteId: r.anchor_site_id as string | null,
        overdue: isRenewalOverdue(startYm, r.status, nowYm),
      };
    })
    .filter((r) => r.overdue)
    .sort((a, b) => (a.startYm ?? "").localeCompare(b.startYm ?? ""));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
          Unrecognised revenue
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Line items that aren’t producing a revenue schedule yet — fix them here and
          the numbers flow through to the MRR view.
        </p>
      </div>

      {/* ₹ at risk banner (spec §9) */}
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-amber-700">Value at risk</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-amber-800">
            {formatPaise(atRisk)}
          </div>
        </div>
        <div className="text-sm text-amber-700">
          {flaggedCount} line item{flaggedCount === 1 ? "" : "s"} unrecognised ·{" "}
          {overdueRenewals.length} overdue renewal{overdueRenewals.length === 1 ? "" : "s"}
        </div>
      </div>

      {flaggedCount === 0 && overdueRenewals.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          Nothing to fix — every line item is recognised.
        </p>
      ) : null}

      {/* No method — the primary inline-backfill group */}
      <ReasonSection
        reason="no_method"
        rows={groups.no_method}
        editable
      />
      {/* Coverage review — inline-editable too */}
      <ReasonSection
        reason="coverage_review"
        rows={groups.coverage_review}
        editable
      />
      {/* No anchor — the fix lives in Implementation, so link out */}
      <ReasonSection reason="no_anchor" rows={groups.no_anchor} editable={false} />

      {/* Overdue renewals */}
      {overdueRenewals.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-gray-900">
            Overdue renewals ({overdueRenewals.length})
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Past their start month but not marked done — mark them done to recognise, or
            update the date.
          </p>
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Customer</th>
                  <th className="px-3 py-2 text-left font-medium">PO</th>
                  <th className="px-3 py-2 text-left font-medium">Cycle</th>
                  <th className="px-3 py-2 text-left font-medium">Start</th>
                  <th className="px-3 py-2 text-right font-medium">Expected value</th>
                  <th className="px-3 py-2 text-right font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overdueRenewals.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-slate-700">{r.orgName}</td>
                    <td className="px-3 py-2 text-slate-600">{r.poNumber}</td>
                    <td className="px-3 py-2 text-slate-600">Year {r.yearNumber}</td>
                    <td className="px-3 py-2 text-slate-600">{formatMonthYear(r.startDate)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                      {formatPaise(r.valuePaise)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.siteId && (
                        <Link
                          href={`/sites/${r.siteId}`}
                          className="text-xs font-medium text-indigo-600 hover:underline"
                        >
                          Open →
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function ReasonSection({
  reason,
  rows,
  editable,
}: {
  reason: WorklistReason;
  rows: {
    id: string;
    description: string;
    amountPaise: number;
    method: RecognitionMethod | null;
    coverageMonths: number;
    orgName: string;
    poNumber: string;
    siteId: string | null;
  }[];
  editable: boolean;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce((t, r) => t + r.amountPaise, 0);

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium text-gray-900">
          {REASON_LABEL[reason]} ({rows.length})
        </h2>
        <span className="text-xs text-slate-500">
          {formatPaiseShort(total)} at risk
        </span>
      </div>
      <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Customer</th>
              <th className="px-3 py-2 text-left font-medium">PO</th>
              <th className="px-3 py-2 text-left font-medium">Line item</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 text-left font-medium">
                {editable ? "Set recognition" : "Fix"}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-3 py-2 text-slate-700">{r.orgName}</td>
                <td className="px-3 py-2 text-slate-600">{r.poNumber}</td>
                <td className="px-3 py-2 text-slate-600">{r.description}</td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {formatPaise(r.amountPaise)}
                </td>
                <td className="px-3 py-2">
                  {editable && r.siteId ? (
                    <WorklistLineEditor
                      lineItemId={r.id}
                      siteId={r.siteId}
                      initialMethod={r.method}
                      initialCoverage={r.coverageMonths}
                    />
                  ) : r.siteId ? (
                    <Link
                      href={`/sites/${r.siteId}/implementation`}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Add a date in Implementation →
                    </Link>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
