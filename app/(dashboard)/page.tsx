import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatPaiseShort } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import {
  getDashboardData,
  getFilterOptions,
  parseFilterParams,
  type DashboardFilter,
} from "@/lib/dashboard-metrics";
import { getFyBookings } from "@/lib/fy-bookings";
import { FilterBar } from "./_dashboard/filter-bar";
import { KpiTile } from "./_dashboard/kpi-tile";
import { FyStatTile } from "./_dashboard/fy-stat-tile";
import { Panel, PanelRow } from "./_dashboard/panel";
import { RevenueStrip } from "./_dashboard/revenue-strip";
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

function DashboardSkeleton() {
  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
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
  const [data, fyBookings] = await Promise.all([
    getDashboardData(supabase, filter),
    getFyBookings(supabase, filter),
  ]);
  const { renewals, invoices, implementation, usage } = data;

  const worstUsage = usage.rows[0];
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
      <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">
        {formatPaiseShort(r.amountPaise)}
      </span>
    </PanelRow>
  );

  return (
    <>
      {/* Row 1 — the four money-first KPIs. */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          href={`/renewals${qs || "?"}${qs ? "&" : ""}status=overdue`}
          label="Pending renewals"
          value={formatPaiseShort(renewals.overdueValuePaise)}
          count={`${renewals.overdueCount} overdue`}
          secondary={
            renewals.upcomingCount > 0
              ? `${formatPaiseShort(renewals.upcomingValuePaise)} renewing soon · ${renewals.upcomingCount}`
              : "No renewals due soon"
          }
          tone={renewals.overdueCount > 0 ? "red" : "default"}
        />
        <KpiTile
          href={`/invoices${qs || "?"}${qs ? "&" : ""}status=outstanding`}
          label="Expected collection"
          value={formatPaiseShort(invoices.overdueValuePaise)}
          count={`${invoices.overdueCount} overdue`}
          secondary={`${formatPaiseShort(invoices.dueSoonValuePaise)} due soon`}
          tone={invoices.overdueValuePaise > 0 ? "red" : "default"}
        />
        <KpiTile
          href={`/implementations${qs}`}
          label="Implementations"
          value={`${implementation.activeCount} active`}
          count={implementation.atRiskCount > 0 ? `${implementation.atRiskCount} at risk` : null}
          secondary={
            implementation.atRiskCount > 0
              ? "Stalled or past go-live"
              : "All on track"
          }
          tone={implementation.atRiskCount > 0 ? "amber" : "default"}
        />
        <KpiTile
          href={`/usage${qs}`}
          label="Usage alerts"
          value={`${usage.belowExpectedCount}`}
          count="below expected"
          secondary={
            worstUsage
              ? `Worst ${Math.round(worstUsage.deviationPct)}% · ${worstUsage.customer}`
              : "All customers healthy"
          }
          tone={usage.belowExpectedCount > 0 ? "red" : "default"}
        />
      </div>

      {/* Booked this FY — total new order value and renewals closed inside the
          current financial year (April–March). Filter-aware like the KPIs. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FyStatTile
          label={`New order value · ${fyBookings.fyLabel}`}
          value={formatPaiseShort(fyBookings.newOrderValuePaise)}
          sub={
            fyBookings.newOrderCount > 0
              ? `${fyBookings.newOrderCount} new PO${fyBookings.newOrderCount === 1 ? "" : "s"}`
              : "No new POs yet"
          }
          caption={fyBookings.windowLabel}
        />
        <FyStatTile
          label={`Renewal done value · ${fyBookings.fyLabel}`}
          value={formatPaiseShort(fyBookings.renewalDoneValuePaise)}
          sub={
            fyBookings.renewalDoneCount > 0
              ? `${fyBookings.renewalDoneCount} renewal${fyBookings.renewalDoneCount === 1 ? "" : "s"} closed`
              : "No renewals closed yet"
          }
          caption={fyBookings.windowLabel}
        />
      </div>

      {/* Revenue strip — FY ARR (all components in the FY), recognised/projected
          split, and current-month revenue. Loads its own schedule data, streamed
          in its own Suspense so it never delays the rest of the dashboard. */}
      <Suspense
        fallback={<div className="mt-4 h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />}
      >
        <RevenueStrip />
      </Suspense>

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
              <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">
                {formatPaiseShort(inv.balancePaise)}
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
