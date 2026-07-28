import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatPaiseShort, formatPaiseHero, formatPaiseFull } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import {
  getDashboardData,
  getFilterOptions,
  parseFilterParams,
  type DashboardFilter,
} from "@/lib/dashboard-metrics";
import { getHealthMetrics } from "@/lib/health-metrics";
import { FilterBar } from "./_dashboard/filter-bar";
import { KpiTile } from "./_dashboard/kpi-tile";
import { HeroTile } from "./_dashboard/hero-tile";
import { MonthlyBars } from "./_dashboard/trend-chart";
import { Panel, PanelRow } from "./_dashboard/panel";
import { RenewalAgingTag, InvoiceAgingTag, Sparkline } from "./_dashboard/tags";
import { KpiSkeleton, PanelSkeleton } from "./_dashboard/skeletons";

type SearchParams = Record<string, string | string[] | undefined>;

// Keep only the filter keys, as a querystring, so KPI/"View all" links carry the
// active filter into the destination page (spec §4).
function filterQs(sp: SearchParams): string {
  const params = new URLSearchParams();
  for (const k of ["range", "customer", "module"]) {
    const v = sp[k];
    if (typeof v === "string" && v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export default async function DashboardHome({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  // Options for the filter bar. Product line is data-driven from the modules
  // catalog (CLAUDE.md: reference data is data, not code).
  const { customers, products } = await getFilterOptions(supabase);

  const filter = parseFilterParams({
    range: typeof sp.range === "string" ? sp.range : undefined,
    customer: typeof sp.customer === "string" ? sp.customer : undefined,
    module: typeof sp.module === "string" ? sp.module : undefined,
  });
  const qs = filterQs(sp);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
          Dashboard
        </h1>
        <Suspense fallback={<div className="h-8" />}>
          <FilterBar customers={customers} products={products} />
        </Suspense>
      </div>

      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardBody filter={filter} qs={qs} />
      </Suspense>
    </div>
  );
}

function pctLabel(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

// Subtle divider that titles a band of the page (establishes the health →
// worklist hierarchy the brief asks for).
function SectionDivider({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 flex items-center gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{children}</h2>
      <div className="h-px flex-1 bg-slate-200" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[132px] animate-pulse rounded-xl border border-slate-200 bg-slate-50" />
        ))}
      </div>
      <SectionDivider>Needs action today</SectionDivider>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <KpiSkeleton key={i} />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PanelSkeleton title="Pending renewals" />
        <PanelSkeleton title="Upcoming renewals (30d)" />
        <PanelSkeleton title="Due invoices" />
        <PanelSkeleton title="Implementations at risk" />
      </div>
    </>
  );
}

// Small right-aligned muted meta text used inside rows.
function Meta({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 text-xs text-slate-500">{children}</span>;
}

async function DashboardBody({
  filter,
  qs,
}: {
  filter: DashboardFilter;
  qs: string;
}) {
  const supabase = await createClient();
  const [data, h] = await Promise.all([
    getDashboardData(supabase, filter),
    getHealthMetrics(supabase, filter),
  ]);
  const { renewals, invoices, implementation, usage } = data;

  const worstUsage = usage.rows[0];
  const onTrack = Math.max(0, implementation.activeCount - implementation.atRiskCount);
  // renewals.rows = overdue + upcoming (within RENEWAL_UPCOMING_DAYS = 30d).
  // Split them so overdue and upcoming get their own panels.
  const overdueRenewals = renewals.rows.filter((r) => r.overdue);
  const upcomingRenewals = renewals.rows.filter((r) => !r.overdue);

  // One renewal row, shared by the Pending (overdue) and Upcoming panels.
  const renderRenewalRow = (r: (typeof renewals.rows)[number]) => (
    <PanelRow
      key={r.id}
      href={r.siteId ? `/sites/${r.siteId}` : "/renewals"}
      action={
        r.siteId ? (
          <a
            href={`/sites/${r.siteId}/spox`}
            className="rounded text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            Contact →
          </a>
        ) : null
      }
    >
      <span className="min-w-0 flex-1 truncate text-sm text-gray-900">{r.customer}</span>
      {r.aging ? <RenewalAgingTag aging={r.aging} /> : null}
      <Meta>{formatDate(r.renewalDate)}</Meta>
      <span
        className={`shrink-0 text-xs font-medium tabular-nums ${
          r.overdue ? "text-red-600" : "text-slate-500"
        }`}
      >
        {r.overdue ? `${Math.abs(r.daysUntil ?? 0)}d overdue` : `in ${r.daysUntil}d`}
      </span>
      <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">
        {formatPaiseFull(r.amountPaise)}
      </span>
    </PanelRow>
  );

  return (
    <>
      {/* Layer 1 — business health. Largest type; first glance lands here. */}
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <HeroTile
          label="ARR"
          value={formatPaiseHero(h.arr.valuePaise)}
          deltaPct={h.arr.deltaPct}
          deltaCaption="vs a year ago"
          series={h.arr.series}
        />
        <HeroTile
          label="MRR"
          value={formatPaiseHero(h.mrr.valuePaise)}
          deltaPct={h.mrr.deltaPct}
          deltaCaption="vs last month"
          secondary="ARR ÷ 12"
          series={h.mrr.series}
        />
        <HeroTile
          label={`Revenue · ${h.revenueFy.label}`}
          value={formatPaiseHero(h.revenueFy.valuePaise)}
          deltaPct={h.revenueFy.deltaPct}
          deltaCaption="vs last FY"
          secondary="recognised"
          series={h.revenueFy.series}
        />
        <HeroTile
          label="Net revenue retention"
          value={pctLabel(h.retention.nrr)}
          deltaPct={null}
          deltaCaption={h.retention.windowLabel}
          secondary={`GRR ${pctLabel(h.retention.grr)}`}
          series={[]}
        />
      </div>

      {/* Month-by-month ARR & MRR — the actual ₹ value for each of the last 12
          months, readable per bar (owner ask). */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <MonthlyBars
          title="ARR · last 12 months"
          currentValue={formatPaiseHero(h.arr.valuePaise)}
          labels={h.monthLabels}
          values={h.arr.series}
          format={formatPaiseShort}
          accent="indigo"
        />
        <MonthlyBars
          title="MRR · last 12 months"
          currentValue={formatPaiseHero(h.mrr.valuePaise)}
          labels={h.monthLabels}
          values={h.mrr.series}
          format={formatPaiseShort}
          accent="sky"
        />
      </div>

      {/* Revenue recognised per month — recurring ÷12 spread + one-time lumps in
          their go-live month (owner's rule). Spikes mark one-time hardware/setup. */}
      <div className="mt-3">
        <MonthlyBars
          title={`Revenue recognised · last 12 months (${h.revenueFy.label} to date: ${formatPaiseHero(h.revenueFy.valuePaise)})`}
          currentValue={formatPaiseShort(h.revenueFy.series[h.revenueFy.series.length - 1] ?? 0)}
          labels={h.monthLabels}
          values={h.revenueFy.series}
          format={formatPaiseShort}
          accent="emerald"
        />
      </div>

      {/* Booked this FY — new business won and renewals closed inside the
          selected financial year (owner ask). */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <HeroTile
          label={`New order value · ${h.fyBookings.fyLabel}`}
          value={formatPaiseHero(h.fyBookings.newOrderValuePaise)}
          deltaPct={null}
          deltaCaption={h.fyBookings.windowLabel}
          secondary={
            h.fyBookings.newOrderCount > 0
              ? `${h.fyBookings.newOrderCount} new PO${h.fyBookings.newOrderCount === 1 ? "" : "s"}`
              : "No new POs yet"
          }
          series={[]}
        />
        <HeroTile
          label={`Renewal done value · ${h.fyBookings.fyLabel}`}
          value={formatPaiseHero(h.fyBookings.renewalDoneValuePaise)}
          deltaPct={null}
          deltaCaption={h.fyBookings.windowLabel}
          secondary={
            h.fyBookings.renewalDoneCount > 0
              ? `${h.fyBookings.renewalDoneCount} renewal${h.fyBookings.renewalDoneCount === 1 ? "" : "s"} closed`
              : "No renewals closed yet"
          }
          series={[]}
        />
      </div>

      <SectionDivider>Needs action today</SectionDivider>

      {/* Worklist Row 1 — money-first triage KPIs. Colour is disciplined: red
          only for genuinely-overdue money; each alarm is paired with the
          matching good-news figure (collected / secured this month). */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          href={`/renewals${qs || "?"}${qs ? "&" : ""}status=overdue`}
          label="Pending renewals"
          value={formatPaiseShort(renewals.overdueValuePaise)}
          count={renewals.overdueCount > 0 ? `${renewals.overdueCount} overdue` : "none overdue"}
          secondary={
            renewals.upcomingCount > 0
              ? `${formatPaiseShort(renewals.upcomingValuePaise)} renewing in 30d`
              : "Nothing due in 30 days"
          }
          positive={
            h.positives.renewalsSecuredCount > 0
              ? `${formatPaiseShort(h.positives.renewalsSecuredThisMonthPaise)} secured this month`
              : null
          }
          tone={renewals.overdueCount > 0 ? "red" : "default"}
        />
        <KpiTile
          href={`/invoices${qs || "?"}${qs ? "&" : ""}status=outstanding`}
          label="Expected collection"
          value={formatPaiseShort(invoices.overdueValuePaise)}
          count={invoices.overdueCount > 0 ? `${invoices.overdueCount} overdue` : "none overdue"}
          secondary={`${formatPaiseShort(invoices.dueSoonValuePaise)} due in 30d`}
          positive={
            h.positives.collectedThisMonthPaise > 0
              ? `${formatPaiseShort(h.positives.collectedThisMonthPaise)} collected this month`
              : null
          }
          tone={invoices.overdueValuePaise > 0 ? "red" : "default"}
        />
        <KpiTile
          href={`/implementations${qs}`}
          label="Implementations"
          value={`${implementation.activeCount}`}
          count="active"
          secondary={
            implementation.atRiskCount > 0
              ? `${implementation.atRiskCount} at risk — stalled or past go-live`
              : "All on track"
          }
          positive={onTrack > 0 ? `${onTrack} on track` : null}
          tone={implementation.atRiskCount > 0 ? "amber" : "default"}
        />
        <KpiTile
          href={`/usage${qs}`}
          label="Usage alerts"
          value={`${usage.belowExpectedCount}`}
          count={usage.belowExpectedCount > 0 ? "below expected" : "all healthy"}
          secondary={
            worstUsage
              ? `Worst ${Math.round(worstUsage.deviationPct)}% · ${worstUsage.customer}`
              : "Every tracked customer healthy"
          }
          tone={usage.belowExpectedCount > 0 ? "amber" : "default"}
        />
      </div>

      {/* Row 2 — renewals, split into overdue (needs action now) and upcoming
          (next 30 days) so the two are never conflated. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Pending renewals"
          count={overdueRenewals.length}
          viewAllHref={`/renewals${qs || "?"}${qs ? "&" : ""}status=overdue`}
          empty={overdueRenewals.length === 0 ? "No overdue renewals — you're clear." : null}
        >
          {overdueRenewals.slice(0, 5).map((r) => renderRenewalRow(r))}
        </Panel>

        <Panel
          title="Upcoming renewals (30d)"
          count={upcomingRenewals.length}
          viewAllHref={`/renewals${qs || "?"}${qs ? "&" : ""}status=upcoming`}
          empty={upcomingRenewals.length === 0 ? "No renewals due in the next 30 days." : null}
        >
          {upcomingRenewals.slice(0, 5).map((r) => renderRenewalRow(r))}
        </Panel>
      </div>

      {/* Row 3 — collections + delivery risk. */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Due invoices"
          count={invoices.rows.length}
          viewAllHref={`/invoices${qs || "?"}${qs ? "&" : ""}status=outstanding`}
          empty={invoices.rows.length === 0 ? "No overdue or upcoming invoices — collections are clear." : null}
        >
          {invoices.rows.slice(0, 5).map((inv) => (
            <PanelRow
              key={inv.id}
              href={inv.siteId ? `/sites/${inv.siteId}#pos` : "/invoices"}
              action={
                inv.siteId ? (
                  <a
                    href={`/sites/${inv.siteId}#pos`}
                    className="rounded text-xs font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    Collect →
                  </a>
                ) : null
              }
            >
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                {inv.customer}
                <span className="ml-2 text-xs text-slate-400">{inv.invoiceNumber}</span>
              </span>
              <InvoiceAgingTag aging={inv.aging} />
              <Meta>{formatDate(inv.dueDate)}</Meta>
              <span className="w-24 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">
                {formatPaiseFull(inv.balancePaise)}
              </span>
            </PanelRow>
          ))}
        </Panel>

        <Panel
          title="Implementations at risk"
          count={implementation.rows.length}
          viewAllHref={`/implementations${qs}`}
          empty={implementation.rows.length === 0 ? "No at-risk projects — delivery is on track." : null}
        >
          {implementation.rows.slice(0, 5).map((p) => (
            <PanelRow key={p.id} href={`/sites/${p.siteId}/implementation`}>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                {p.customer}
                <span className="ml-2 text-xs text-slate-400">{p.projectName}</span>
              </span>
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                Stage {p.currentStage}/5
              </span>
              {p.daysInStage !== null ? <Meta>{p.daysInStage}d in stage</Meta> : null}
              <span
                className={`shrink-0 text-xs font-medium tabular-nums ${
                  p.daysOverGoLive && p.daysOverGoLive > 0 ? "text-red-600" : "text-slate-500"
                }`}
              >
                {p.targetGoLive
                  ? p.daysOverGoLive && p.daysOverGoLive > 0
                    ? `${p.daysOverGoLive}d late`
                    : `go-live ${formatDate(p.targetGoLive)}`
                  : "no go-live set"}
              </span>
            </PanelRow>
          ))}
        </Panel>
      </div>

      {/* Row 4 — churn signal (usage), full width. */}
      <div className="mt-4">
        <Panel
          title="Usage alerts"
          count={usage.rows.length}
          viewAllHref={`/usage${qs}`}
          empty={usage.rows.length === 0 ? "No usage dips — every tracked customer is healthy." : null}
        >
          {usage.rows.slice(0, 5).map((u) => (
            <PanelRow key={`${u.siteId}-${u.moduleName}`} href={`/sites/${u.siteId}/usage`}>
              <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                {u.customer}
                <span className="ml-2 text-xs text-slate-400">{u.moduleName}</span>
              </span>
              <Sparkline values={u.trend} />
              <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-red-600">
                {Math.round(u.deviationPct)}%
              </span>
            </PanelRow>
          ))}
        </Panel>
      </div>
    </>
  );
}
