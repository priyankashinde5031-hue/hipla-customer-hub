"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { formatPaise } from "@/lib/currency";
import { formatMonthYear } from "@/lib/date";
import {
  summarizeSchedule,
  type RecognitionMethod,
} from "@/lib/revenue-engine";
import { setLineItemRecognition, setRenewalCoverage } from "./revenue-actions";

// One PO line item, plus the aggregates read from its materialised schedule rows.
export type RevenueLineItem = {
  id: string;
  description: string;
  amountPaise: number; // net line value (qty × unit price)
  method: RecognitionMethod | null;
  coverageMonths: number;
  revenueExcluded: boolean;
  isScopeChange: boolean; // derived_from_line_item_id is set
  recognisedPaise: number; // sum of recognised schedule rows
  scheduledTotalPaise: number; // sum of all schedule rows
};

// One renewal cycle, shown as a synthetic auto-SaaS line item (spec §8). The
// method is locked to SaaS; only the coverage (number of months) is editable.
export type RevenueRenewalItem = {
  id: string;
  yearNumber: number;
  valuePaise: number; // actual renewal value if done, else expected
  coverageMonths: number; // the cycle's term_months
  anchorMonth: string | null; // "YYYY-MM" (override → go-live+offset → expected+offset)
  anchorSource: "actual_go_live" | "expected_delivery" | null;
  done: boolean; // renewal marked done → recognised
  recognisedPaise: number;
  scheduledTotalPaise: number;
};

export type RevenueForPoProps = {
  poId: string;
  siteId: string;
  canEdit: boolean;
  anchorMonth: string | null; // "YYYY-MM" resolved (actual go-live else expected)
  anchorSource: "actual_go_live" | "expected_delivery" | null;
  contractTermLabel: string | null;
  poValuePaise: number; // net PO value (sum of line nets)
  lineItems: RevenueLineItem[];
  renewalLines: RevenueRenewalItem[];
};

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— no method —" },
  { value: "saas", label: "SaaS — Renewal" },
  { value: "capex", label: "Capex — 80/20" },
  { value: "opex", label: "Opex — Spread" },
  { value: "one_time", label: "One-Time — Full" },
];

const inputClass =
  "rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export function RevenueForPo(props: RevenueForPoProps) {
  const recognised = props.lineItems.reduce((t, li) => t + li.recognisedPaise, 0);
  const remaining = Math.max(0, props.poValuePaise - recognised);

  const anchorText =
    props.anchorMonth === null
      ? "No anchor date"
      : `${formatMonthYear(`${props.anchorMonth}-01`)} · ${
          props.anchorSource === "actual_go_live"
            ? "actual go-live"
            : "expected delivery"
        }`;

  return (
    <section className="mt-6">
      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
        Revenue recognition
      </h3>

      {/* Header strip (spec §8) */}
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-5">
        <Metric label="PO value" value={formatPaise(props.poValuePaise)} />
        <Metric label="Recognised to date" value={formatPaise(recognised)} tone="good" />
        <Metric label="Remaining" value={formatPaise(remaining)} />
        <Metric label="Contract term" value={props.contractTermLabel || "—"} />
        <Metric
          label="Anchor"
          value={anchorText}
          tone={props.anchorSource === "expected_delivery" ? "warn" : undefined}
        />
      </dl>

      {props.lineItems.length === 0 && props.renewalLines.length === 0 ? (
        <p className="mt-3 text-sm text-slate-400">No line items to recognise.</p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="py-1 text-left font-medium">Line item</th>
                <th className="py-1 text-right font-medium">Value</th>
                <th className="py-1 text-left font-medium">Method</th>
                <th className="py-1 text-right font-medium">Coverage</th>
                <th className="py-1 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {props.lineItems.map((li) => (
                <RevenueLineRow
                  key={li.id}
                  line={li}
                  siteId={props.siteId}
                  canEdit={props.canEdit}
                  anchorMonth={props.anchorMonth}
                  anchorSource={props.anchorSource}
                />
              ))}

              {props.renewalLines.length > 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-slate-400"
                  >
                    Renewals — recognise automatically as SaaS
                  </td>
                </tr>
              )}
              {props.renewalLines.map((rn) => (
                <RevenueRenewalRow
                  key={rn.id}
                  renewal={rn}
                  siteId={props.siteId}
                  canEdit={props.canEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "warn";
}) {
  const color =
    tone === "good"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : "text-gray-900";
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`mt-0.5 text-sm font-medium tabular-nums ${color}`}>{value}</dd>
    </div>
  );
}

function RevenueLineRow({
  line,
  siteId,
  canEdit,
  anchorMonth,
  anchorSource,
}: {
  line: RevenueLineItem;
  siteId: string;
  canEdit: boolean;
  anchorMonth: string | null;
  anchorSource: "actual_go_live" | "expected_delivery" | null;
}) {
  const [method, setMethod] = useState<RecognitionMethod | null>(line.method);
  const [coverage, setCoverage] = useState<number>(line.coverageMonths ?? 12);
  const [pending, startTransition] = useTransition();

  function save(nextMethod: RecognitionMethod | null, nextCoverage: number) {
    startTransition(async () => {
      const res = await setLineItemRecognition({
        lineItemId: line.id,
        siteId,
        method: nextMethod,
        coverageMonths: nextCoverage,
      });
      if (res.error) {
        toast.error(res.error);
        // revert to the server-known values
        setMethod(line.method);
        setCoverage(line.coverageMonths ?? 12);
      } else {
        toast.success("Revenue recognition updated.");
      }
    });
  }

  // Live plain-English summary (spec §8) — from the same pure engine as the
  // stored numbers, so it can never disagree.
  const summary = buildSummary(line, method, coverage, anchorMonth, anchorSource);

  return (
    <tr>
      <td className="py-2 align-top">
        <div className="text-slate-700">
          {line.description}
          {line.isScopeChange && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
              scope change
            </span>
          )}
        </div>
        <div className={`mt-0.5 text-xs ${summary.tone}`}>{summary.text}</div>
      </td>
      <td className="py-2 text-right align-top tabular-nums text-slate-700">
        {formatPaise(line.amountPaise)}
      </td>
      <td className="py-2 align-top">
        <select
          className={inputClass}
          value={method ?? ""}
          disabled={!canEdit || pending}
          onChange={(e) => {
            const next = (e.target.value || null) as RecognitionMethod | null;
            setMethod(next);
            save(next, coverage);
          }}
        >
          {METHOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </td>
      <td className="py-2 text-right align-top">
        <input
          type="number"
          min={1}
          className={`${inputClass} w-16 text-right`}
          value={coverage}
          disabled={!canEdit || pending || method === "one_time"}
          onChange={(e) => setCoverage(Math.max(1, Number(e.target.value) || 1))}
          onBlur={() => {
            if (coverage !== (line.coverageMonths ?? 12)) save(method, coverage);
          }}
        />
      </td>
      <td className="py-2 align-top">
        <StatusBadge line={line} method={method} anchorMonth={anchorMonth} anchorSource={anchorSource} />
      </td>
    </tr>
  );
}

function RevenueRenewalRow({
  renewal,
  siteId,
  canEdit,
}: {
  renewal: RevenueRenewalItem;
  siteId: string;
  canEdit: boolean;
}) {
  const [coverage, setCoverage] = useState<number>(renewal.coverageMonths ?? 12);
  const [pending, startTransition] = useTransition();

  function save(nextCoverage: number) {
    startTransition(async () => {
      const res = await setRenewalCoverage({
        renewalId: renewal.id,
        siteId,
        coverageMonths: nextCoverage,
      });
      if (res.error) {
        toast.error(res.error);
        setCoverage(renewal.coverageMonths ?? 12);
      } else {
        toast.success("Renewal coverage updated.");
      }
    });
  }

  // Summary from the same engine, method locked to SaaS (spec §8).
  const summary =
    renewal.anchorMonth === null
      ? { text: `${formatPaise(renewal.valuePaise)} · No date — not recognised`, tone: "text-amber-600" }
      : {
          text: `${summarizeSchedule(renewal.valuePaise, "saas", renewal.anchorMonth, coverage)}${
            renewal.done
              ? " · ✓ Renewal done"
              : renewal.anchorSource === "expected_delivery"
                ? " · projected on expected delivery"
                : ""
          }`,
          tone: renewal.done ? "text-emerald-600" : "text-slate-500",
        };

  return (
    <tr>
      <td className="py-2 align-top">
        <div className="text-slate-700">
          Renewal · Year {renewal.yearNumber}
        </div>
        <div className={`mt-0.5 text-xs ${summary.tone}`}>{summary.text}</div>
      </td>
      <td className="py-2 text-right align-top tabular-nums text-slate-700">
        {formatPaise(renewal.valuePaise)}
      </td>
      <td className="py-2 align-top">
        {/* Method is fixed to SaaS for renewals — shown, disabled, with a hint. */}
        <select
          className={inputClass}
          value="saas"
          disabled
          title="Renewals always recognise as SaaS"
        >
          <option value="saas">SaaS — Renewal</option>
        </select>
      </td>
      <td className="py-2 text-right align-top">
        <input
          type="number"
          min={1}
          className={`${inputClass} w-16 text-right`}
          value={coverage}
          disabled={!canEdit || pending}
          onChange={(e) => setCoverage(Math.max(1, Number(e.target.value) || 1))}
          onBlur={() => {
            if (coverage !== (renewal.coverageMonths ?? 12)) save(coverage);
          }}
        />
      </td>
      <td className="py-2 align-top">
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            renewal.anchorMonth === null
              ? "bg-amber-50 text-amber-700"
              : renewal.done
                ? "bg-emerald-50 text-emerald-700"
                : "bg-indigo-50 text-indigo-700"
          }`}
        >
          {renewal.anchorMonth === null ? "No date" : renewal.done ? "Recognising" : "Projected"}
        </span>
      </td>
    </tr>
  );
}

function buildSummary(
  line: RevenueLineItem,
  method: RecognitionMethod | null,
  coverage: number,
  anchorMonth: string | null,
  anchorSource: "actual_go_live" | "expected_delivery" | null,
): { text: string; tone: string } {
  if (line.revenueExcluded) {
    return { text: `${formatPaise(line.amountPaise)} · excluded from revenue`, tone: "text-slate-400" };
  }
  if (method === null) {
    return { text: "No method selected — not recognised", tone: "text-amber-600" };
  }
  if (anchorMonth === null) {
    return { text: `${formatPaise(line.amountPaise)} · No date — not recognised`, tone: "text-amber-600" };
  }
  const base = summarizeSchedule(line.amountPaise, method, anchorMonth, coverage);
  if (anchorSource === "expected_delivery") {
    return { text: `${base} · projected on expected delivery`, tone: "text-indigo-600" };
  }
  return { text: base, tone: "text-slate-500" };
}

function StatusBadge({
  line,
  method,
  anchorMonth,
  anchorSource,
}: {
  line: RevenueLineItem;
  method: RecognitionMethod | null;
  anchorMonth: string | null;
  anchorSource: "actual_go_live" | "expected_delivery" | null;
}) {
  let label = "—";
  let cls = "bg-slate-100 text-slate-500";
  if (line.revenueExcluded) {
    label = "Excluded";
  } else if (method === null) {
    label = "No method";
    cls = "bg-amber-50 text-amber-700";
  } else if (anchorMonth === null) {
    label = "No date";
    cls = "bg-amber-50 text-amber-700";
  } else if (anchorSource === "expected_delivery") {
    label = "Projected";
    cls = "bg-indigo-50 text-indigo-700";
  } else if (line.recognisedPaise > 0) {
    label = "Recognising";
    cls = "bg-emerald-50 text-emerald-700";
  } else {
    label = "Upcoming";
    cls = "bg-slate-100 text-slate-600";
  }
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
