import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { AddSiteButton } from "@/app/(dashboard)/organizations/[id]/site-form";
import { AddPoButton, EditPoButton, type ExistingPo } from "./po-form";
import { PoTableRow, PoFilterTable, type PoFilterItem } from "./po-table";
import { SiteMetaCard } from "./site-meta-card";
import { SiteStickyNav, type NavSection } from "./site-sticky-nav";
import { ScopeChangesCard, type ScopeChangeRow } from "./scope-changes-view";
import { InvoiceActionsForPo, type PoInvoiceContext } from "./invoice-form";
import { InvoicesPanel } from "./invoices-panel";
import {
  RenewalsForPo,
  type RenewalCardData,
  type RenewalBreakdownLine,
  type PaymentTermOption,
} from "./renewals-section";
import type { PaymentTermSpec } from "@/lib/invoicing";
import { renewalDate, renewalLineValuesPaise, RENEWAL_LOGIC, type RenewalLine } from "@/lib/renewals";
import { formatDate as formatDisplayDate, formatMonthYear } from "@/lib/date";

// A metric card: label, primary value, and a secondary context line. Pass
// value={null} for money that is ₹0 only because no invoices exist yet — the
// card then shows emptyText in muted grey instead of a misleading ₹0.00.
// tone tints the border + value (red = money owed, green = fully collected).
function SummaryCard({
  label,
  value,
  context,
  emptyText,
  tone = "default",
}: {
  label: string;
  value: string | null;
  context?: string | null;
  emptyText?: string;
  tone?: "default" | "red" | "green";
}) {
  const isEmpty = value === null;
  const borderClass =
    isEmpty || tone === "default"
      ? "border-gray-200"
      : tone === "red"
        ? "border-red-200"
        : "border-emerald-200";
  const valueClass = isEmpty
    ? "text-slate-400"
    : tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-700"
        : "text-gray-900";
  return (
    <div className={`rounded-xl border ${borderClass} bg-white p-3 shadow-sm`}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>
        {isEmpty ? emptyText ?? "—" : value}
      </p>
      {!isEmpty && context ? (
        <p className="mt-0.5 text-xs text-slate-500">{context}</p>
      ) : null}
    </div>
  );
}

// Known keys from the Add Site form (line1, line2, city, state, pincode),
// rendered as a normal postal address. Any other/legacy keys fall back to a
// plain key: value list so nothing is silently dropped.
const KNOWN_ADDRESS_KEYS = ["line1", "line2", "city", "state", "pincode"];

// Stored address jsonb → the 5-string shape the edit form expects. Unknown or
// missing keys become "" so the form's inputs stay controlled.
function toAddressFields(address: Record<string, unknown> | null) {
  const a = address ?? {};
  return {
    line1: String(a.line1 ?? ""),
    line2: String(a.line2 ?? ""),
    city: String(a.city ?? ""),
    state: String(a.state ?? ""),
    pincode: String(a.pincode ?? ""),
  };
}

function AddressBlock({
  label,
  address,
}: {
  label: string;
  address: Record<string, unknown> | null;
}) {
  const hasContent = address && Object.keys(address).length > 0;
  const isKnownShape =
    hasContent && Object.keys(address!).every((k) => KNOWN_ADDRESS_KEYS.includes(k));

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {label}
      </h3>
      {!hasContent ? (
        <p className="mt-2 text-sm text-slate-400">Not recorded yet.</p>
      ) : isKnownShape ? (
        <div className="mt-2 text-sm text-slate-700">
          {Boolean(address!.line1) && <p>{String(address!.line1)}</p>}
          {Boolean(address!.line2) && <p>{String(address!.line2)}</p>}
          <p>
            {[address!.city, address!.state].filter(Boolean).join(", ")}
            {address!.pincode ? ` — ${address!.pincode}` : ""}
          </p>
        </div>
      ) : (
        <dl className="mt-2 space-y-1 text-sm text-slate-700">
          {Object.entries(address!).map(([key, value]) => (
            <div key={key} className="flex gap-1">
              <dt className="capitalize text-slate-500">{key}:</dt>
              <dd>{String(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export default async function SitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("sites")
    .select(
      `id, name, is_hq, status, region, timezone, gst_number, go_live_date,
       onboarding_owner_id, cs_owner_id,
       address_site, address_billing, address_shipping,
       organization:organizations ( id, legal_name, brand_name ),
       onboarding_owner:internal_users!sites_onboarding_owner_id_fkey ( name, email ),
       cs_owner:internal_users!sites_cs_owner_id_fkey ( name, email )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!site) {
    notFound();
  }

  const { data: poLinks } = await supabase
    .from("po_sites")
    .select(
      `purchase_order:purchase_orders (
         id, po_number, name, po_received_date,
         po_type_id, cost_type_id, gst_percent,
         financial_year_id, payment_terms_id, contract_time_id,
         attachment_id,
         attachment:attachments!attachment_id ( storage_path, original_filename ),
         po_type:po_types ( name ),
         cost_type:cost_types ( name ),
         financial_year:financial_years!financial_year_id ( name ),
         payment_term:payment_terms!payment_terms_id (
           name, schedule_type, invoices_per_year, timing, billing_schedule_days,
           installments:payment_term_installments ( label, percent, sort_order )
         ),
         contract_time:contract_times!contract_time_id ( name, months ),
         po_sites ( site_id ),
         po_modules ( module_id, license_count, module:modules ( name ) ),
         po_line_items (
           id, description, qty, unit_price_paise, amount_paise,
           product_id, product_category_id, cost_type_id, renewal_term_id,
           product:products!product_id ( name ),
           line_category:product_categories!product_category_id ( name ),
           line_cost_type:cost_types!cost_type_id ( name ),
           renewal_term:renewal_terms!renewal_term_id ( name, logic, escalation_pct, amc_pct )
         )
       )`,
    )
    .eq("site_id", id);

  const purchaseOrders = (poLinks || [])
    .map((link) =>
      Array.isArray(link.purchase_order)
        ? link.purchase_order[0]
        : link.purchase_order,
    )
    .filter((po): po is NonNullable<typeof po> => Boolean(po));

  const poIds = purchaseOrders.map((po) => po.id);

  // Licenses card = distinct modules covered by this site's POs. Derived on
  // read from po_modules rather than hand-tracked (CLAUDE.md: reference/usage
  // data isn't hand-totaled where it can be computed).
  // moduleId -> { name, licenses }. Licenses sum the recorded counts across
  // this site's POs; null means no PO recorded a count for that module.
  const licenseAgg = new Map<string, { name: string; licenses: number | null }>();
  for (const pm of purchaseOrders.flatMap((po) => po.po_modules || [])) {
    const mod = Array.isArray(pm.module) ? pm.module[0] : pm.module;
    const name = mod?.name ?? "—";
    const count = pm.license_count;
    const prev = licenseAgg.get(pm.module_id);
    const licenses =
      count == null
        ? (prev?.licenses ?? null)
        : (prev?.licenses ?? 0) + count;
    licenseAgg.set(pm.module_id, { name, licenses });
  }
  const licenseModules = Array.from(licenseAgg.entries())
    .map(([id, v]) => [id, v.name, v.licenses] as const)
    .sort((a, b) => a[1].localeCompare(b[1]));

  const { data: poTotals } = poIds.length
    ? await supabase.from("po_totals").select("po_id, po_value_paise").in("po_id", poIds)
    : { data: [] };

  const poNetById = new Map(
    (poTotals || []).map((row) => [row.po_id, row.po_value_paise]),
  );

  // PO total shown to users = goods (sum of line items) + GST. GST is a
  // percentage on the PO; the amount is derived here, never stored
  // (CLAUDE.md: money is computed, never hand-totaled).
  const poGrossById = new Map<string, number>(
    purchaseOrders.map((po) => {
      const net = poNetById.get(po.id) ?? 0;
      const pct = po.gst_percent ?? 0;
      const gst = pct > 0 ? Math.round((net * pct) / 100) : 0;
      return [po.id, net + gst];
    }),
  );

  // Signed URLs for any attached PO documents (private bucket).
  const poAttachmentById = new Map<string, { filename: string; url: string | null }>();
  await Promise.all(
    purchaseOrders.map(async (po) => {
      const att = Array.isArray(po.attachment) ? po.attachment[0] : po.attachment;
      if (!att?.storage_path) return;
      const { data: signed } = await supabase.storage
        .from("po-attachments")
        .createSignedUrl(att.storage_path, 60 * 60);
      poAttachmentById.set(po.id, {
        filename: att.original_filename,
        url: signed?.signedUrl ?? null,
      });
    }),
  );

  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `id, po_id, invoice_number, amount_paise, gst_amount_paise, total_paise,
       issue_date, due_date, status, renewal_id,
       purchase_order:purchase_orders ( po_number ),
       renewal:renewals!renewal_id ( year_number )`,
    )
    .eq("billed_site_id", id)
    .order("issue_date", { ascending: false });

  const invoiceIds = (invoices || []).map((inv) => inv.id);

  const { data: invoiceBalances } = invoiceIds.length
    ? await supabase
        .from("invoice_balances")
        .select("invoice_id, paid_paise, balance_paise, computed_status")
        .in("invoice_id", invoiceIds)
    : { data: [] };

  const balancesByInvoice = new Map(
    (invoiceBalances || []).map((row) => [row.invoice_id, row]),
  );

  const paymentsQuery = invoiceIds.length
    ? await supabase
        .from("payments")
        .select("id, invoice_id, amount_paise, received_date, mode, reference")
        .in("invoice_id", invoiceIds)
        .order("received_date", { ascending: false })
    : null;
  const payments = paymentsQuery?.data ?? [];

  // Active Spox for the card summary (spec §4.1) — role breakdown at a glance.
  // Roles are Settings-managed (spox_roles): label + display order come from the
  // catalog, not a hardcoded map.
  const { data: activeSpox } = await supabase
    .from("spox")
    .select("spox_role_id, spox_role:spox_roles ( name, sort_order )")
    .eq("site_id", site.id)
    .eq("status", "active");
  const flattenRole = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;
  const spoxRoleMeta = new Map<string, { name: string; sortOrder: number }>();
  const spoxCounts = (activeSpox || []).reduce<Record<string, number>>((acc, s) => {
    const role = flattenRole(s.spox_role);
    const key = s.spox_role_id;
    if (!spoxRoleMeta.has(key)) {
      spoxRoleMeta.set(key, {
        name: role?.name ?? "—",
        sortOrder: role?.sort_order ?? 0,
      });
    }
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const spoxTotal = activeSpox?.length ?? 0;
  const spoxBreakdown = Object.keys(spoxCounts)
    .sort(
      (a, b) =>
        (spoxRoleMeta.get(a)?.sortOrder ?? 0) - (spoxRoleMeta.get(b)?.sortOrder ?? 0),
    )
    .map((key) => `${spoxCounts[key]} ${spoxRoleMeta.get(key)?.name ?? "—"}`)
    .join(" · ");

  // Support ticket counts for the card summary (spec §5.9). Open = no close date.
  const { data: supportTickets } = await supabase
    .from("support_tickets")
    .select("closed_date")
    .eq("site_id", site.id)
    .is("deleted_at", null);
  const supportTotal = supportTickets?.length ?? 0;
  const supportOpen = (supportTickets || []).filter((t) => !t.closed_date).length;

  // Agreements count for the card summary — live rows only (soft-deleted hidden).
  const { count: agreementsCount } = await supabase
    .from("agreements")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .is("deleted_at", null);
  const agreementsTotal = agreementsCount ?? 0;

  // Scope changes (spec §5.7) — site-scoped, live rows only (soft-deleted
  // rows stay in the table but never surface). Approver + requester names are
  // resolved via the internal_users FKs.
  const { data: scopeChangesRaw } = await supabase
    .from("scope_changes")
    .select(
      `id, description, change_date, impact, approver_id, status, created_at,
       approver:internal_users!scope_changes_approver_id_fkey ( name ),
       created_by_user:internal_users!scope_changes_created_by_fkey ( name )`,
    )
    .eq("site_id", site.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Implementation projects: card summary (counts by computed status) AND the
  // per-PO go-live anchor for renewals. Each project can link a PO; that
  // project's Stage-4 go-live date drives that PO's renewal dates (resolved
  // with owner) — falling back to the site's go_live_date when unlinked.
  const { data: implProjects } = await supabase
    .from("implementation_projects")
    .select(
      `overall_status, po_id,
       stages:implementation_project_stages ( stage_number, data )`,
    )
    .eq("site_id", site.id);

  const poGoLiveMap = new Map<string, string>();
  for (const p of implProjects || []) {
    if (!p.po_id) continue;
    const stage4 = (p.stages || []).find((s) => s.stage_number === 4);
    const goLive = (stage4?.data as { goLiveDate?: string } | null)?.goLiveDate;
    // First linked project with a go-live wins (one project per PO expected).
    if (goLive && !poGoLiveMap.has(p.po_id)) poGoLiveMap.set(p.po_id, goLive);
  }

  const implTotal = implProjects?.length ?? 0;
  const implDone = (implProjects || []).filter(
    (p) => p.overall_status === "completed",
  ).length;
  const implInProgress = (implProjects || []).filter(
    (p) => p.overall_status === "in_progress",
  ).length;
  const implBreakdown = [
    implDone ? `${implDone} completed` : null,
    implInProgress ? `${implInProgress} in progress` : null,
  ].filter(Boolean);
  const implSummary =
    implTotal === 0
      ? "Scope, stages, and go-live tracking for this site."
      : `${implTotal} project${implTotal === 1 ? "" : "s"}` +
        (implBreakdown.length ? ` · ${implBreakdown.join(", ")}` : "");

  const invoicesByPo = new Map<string, typeof invoices>();
  for (const inv of invoices || []) {
    if (!inv.po_id) continue;
    const list = invoicesByPo.get(inv.po_id) || [];
    list.push(inv);
    invoicesByPo.set(inv.po_id, list);
  }

  const paymentsByInvoice = new Map<string, NonNullable<typeof payments>>();
  for (const p of payments || []) {
    const list = paymentsByInvoice.get(p.invoice_id) || [];
    list.push(p);
    paymentsByInvoice.set(p.invoice_id, list);
  }

  // Aggregate cards — every figure derived on read, nothing hand-totaled (CLAUDE.md).
  const totalPoValuePaise = purchaseOrders.reduce(
    (sum, po) => sum + (poGrossById.get(po.id) ?? 0),
    0,
  );
  // Cancelled invoices don't count as invoiced or pending. Pending collection
  // is Σ balance where status ∈ {due, overdue, part-paid} (spec §6).
  const totalInvoicedPaise = (invoices || []).reduce((sum, inv) => {
    const cs = balancesByInvoice.get(inv.id)?.computed_status;
    return cs === "cancelled" ? sum : sum + inv.total_paise;
  }, 0);
  const totalCollectedPaise = (invoiceBalances || []).reduce(
    (sum, b) => sum + b.paid_paise,
    0,
  );
  const outstandingPaise = (invoiceBalances || []).reduce(
    (sum, b) =>
      ["due", "overdue", "part-paid"].includes(b.computed_status)
        ? sum + b.balance_paise
        : sum,
    0,
  );

  const organization = Array.isArray(site.organization)
    ? site.organization[0]
    : site.organization;
  const onboardingOwner = Array.isArray(site.onboarding_owner)
    ? site.onboarding_owner[0]
    : site.onboarding_owner;
  const csOwner = Array.isArray(site.cs_owner)
    ? site.cs_owner[0]
    : site.cs_owner;

  // Who can add/edit POs, and the dropdown/multi-select options the form needs.
  // Catalogs are read active-only (CLAUDE.md: reference data is data; only
  // active items are selectable).
  const orgId = organization?.id;
  const [
    user,
    poTypesRes,
    costTypesRes,
    productsRes,
    productCategoriesRes,
    renewalTermsRes,
    financialYearsRes,
    paymentTermsRes,
    contractTimesRes,
    modulesRes,
    orgSitesRes,
    ownersRes,
    renewalPoTypesRes,
  ] = await Promise.all([
    getCurrentInternalUser(),
    supabase.from("po_types").select("id, name").eq("active", true).order("name"),
    supabase.from("cost_types").select("id, name").eq("active", true).order("name"),
    supabase.from("products").select("id, name").eq("active", true).order("name"),
    supabase.from("product_categories").select("id, name").eq("active", true).order("name"),
    supabase.from("renewal_terms").select("id, name").eq("active", true).order("name"),
    supabase.from("financial_years").select("id, name").eq("active", true).order("name"),
    supabase
      .from("payment_terms")
      .select("id, name, schedule_type, invoices_per_year, timing, billing_schedule_days")
      .eq("active", true)
      .order("name"),
    supabase.from("contract_times").select("id, name").eq("active", true).order("name"),
    supabase.from("modules").select("id, name").eq("active", true).order("name"),
    orgId
      ? supabase.from("sites").select("id, name").eq("organization_id", orgId).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    supabase.from("internal_users").select("id, name").eq("is_active", true).order("name"),
    supabase.from("renewal_po_types").select("id, name").eq("active", true).order("name"),
  ]);

  const canEdit = canEditCatalogs(user);

  // Full payment-term rows (with their billing schedule) for the renewal
  // dropdown; the PO form only needs id + name.
  const renewalPaymentTermsOptions: PaymentTermOption[] = (paymentTermsRes.data ?? []).map(
    (t) => ({
      id: t.id,
      name: t.name,
      schedule_type: t.schedule_type === "milestone" ? "milestone" : "periodic",
      invoices_per_year: t.invoices_per_year ?? null,
      timing: t.timing === "arrears" ? "arrears" : "advance",
      billing_schedule_days: t.billing_schedule_days ?? null,
    }),
  );

  const renewalPoTypeOptions = renewalPoTypesRes.data ?? [];

  const poFormOptions = {
    organizationId: orgId ?? "",
    siteId: id,
    poTypeOptions: poTypesRes.data ?? [],
    costTypeOptions: costTypesRes.data ?? [],
    productOptions: productsRes.data ?? [],
    productCategoryOptions: productCategoriesRes.data ?? [],
    renewalTermOptions: renewalTermsRes.data ?? [],
    financialYearOptions: financialYearsRes.data ?? [],
    paymentTermsOptions: (paymentTermsRes.data ?? []).map((t) => ({ id: t.id, name: t.name })),
    contractTimeOptions: contractTimesRes.data ?? [],
    moduleOptions: modulesRes.data ?? [],
    siteOptions: orgSitesRes.data ?? [],
  };

  // Name lookup for the org's sites, used to label a PO's covered sites in the
  // invoice "bill to" picker.
  const siteNameById = new Map(
    (orgSitesRes.data ?? []).map((s) => [s.id, s.name]),
  );

  // Renewals (Year 2–5 projections) for this site's POs, grouped per PO so each
  // PO card shows its own renewals. Dates are computed on read from the site's
  // go-live date, so they appear/update automatically once Implementation
  // stamps it (CLAUDE.md: money/dates computed, not stored).
  const { data: renewalRows } = poIds.length
    ? await supabase
        .from("renewals")
        .select(
          `id, po_id, year_number, offset_months, term_months,
           expected_value_paise, renewal_value_paise, renewal_received_date,
           renewal_date_override, payment_terms_id, renewal_po_type_id, status,
           attachment:attachments!attachment_id ( storage_path, original_filename )`,
        )
        .in("po_id", poIds)
        .order("year_number")
    : { data: [] };

  // Per-PO renewal lines (base amount + the term's logic/rates), so each card
  // can show a line-by-line breakdown built with the SAME math the projection
  // used. Keyed by po_id; each entry keeps the display metadata alongside the
  // RenewalLine the math consumes.
  const renewalLinesByPo = new Map<
    string,
    { meta: { description: string; renewalTermName: string | null; logic: string | null; ratePct: number | null; basePaise: number }; line: RenewalLine }[]
  >();
  for (const po of purchaseOrders) {
    const rows = (po.po_line_items || []).map((li) => {
      const term = Array.isArray(li.renewal_term) ? li.renewal_term[0] : li.renewal_term;
      const logic = (term?.logic as string | null) ?? null;
      const escalationPct = (term?.escalation_pct as number | null) ?? null;
      const amcPct = (term?.amc_pct as number | null) ?? null;
      const basePaise = li.amount_paise ?? Math.round(li.qty * li.unit_price_paise);
      return {
        meta: {
          description: li.description,
          renewalTermName: (term?.name as string | null) ?? null,
          logic,
          // The rate that this logic actually uses (escalation vs AMC).
          ratePct: logic === RENEWAL_LOGIC.amc ? amcPct : escalationPct,
          basePaise,
        },
        line: { basePaise, logic, escalationPct, amcPct } satisfies RenewalLine,
      };
    });
    renewalLinesByPo.set(po.id, rows);
  }

  const renewalsByPo = new Map<string, RenewalCardData[]>();
  await Promise.all(
    (renewalRows ?? []).map(async (r) => {
      const attachment = Array.isArray(r.attachment) ? r.attachment[0] : r.attachment;
      let attached: RenewalCardData["attachment"] = null;
      if (attachment?.storage_path) {
        const { data: signed } = await supabase.storage
          .from("renewal-attachments")
          .createSignedUrl(attachment.storage_path, 60 * 60);
        attached = {
          filename: attachment.original_filename,
          url: signed?.signedUrl ?? null,
        };
      }
      // Per-line contributions for this year, via the shared projection math.
      const poLines = renewalLinesByPo.get(r.po_id) ?? [];
      const lineValues = renewalLineValuesPaise(
        poLines.map((x) => x.line),
        r.year_number,
      );
      const breakdown: RenewalBreakdownLine[] = poLines.map((x, i) => ({
        description: x.meta.description,
        renewalTermName: x.meta.renewalTermName,
        logic: x.meta.logic,
        ratePct: x.meta.ratePct,
        basePaise: x.meta.basePaise,
        valuePaise: lineValues[i] ?? 0,
      }));

      // Auto date: anchor to the go-live of the project linked to THIS PO; fall
      // back to the site's go-live when no project is linked yet. A manual
      // override, when present, wins over this computed date.
      const autoRenewalDate = renewalDate(
        poGoLiveMap.get(r.po_id) ?? site.go_live_date,
        r.offset_months,
      );

      const card: RenewalCardData = {
        id: r.id,
        yearNumber: r.year_number,
        autoRenewalDate,
        renewalDateOverride: r.renewal_date_override,
        renewalDate: r.renewal_date_override ?? autoRenewalDate,
        expectedValuePaise: r.expected_value_paise,
        renewalValuePaise: r.renewal_value_paise,
        renewalReceivedDate: r.renewal_received_date,
        paymentTermsId: r.payment_terms_id,
        renewalPoTypeId: r.renewal_po_type_id,
        status: r.status === "renewed" ? "renewed" : "upcoming",
        attachment: attached,
        breakdown,
      };
      const list = renewalsByPo.get(r.po_id) || [];
      list.push(card);
      renewalsByPo.set(r.po_id, list);
    }),
  );
  // Keep each PO's cards ordered by year (Promise.all resolves out of order).
  for (const list of renewalsByPo.values()) {
    list.sort((a, b) => a.yearNumber - b.yearNumber);
  }

  // Reshape each PO into the form's edit payload (ids + rupee-free raw paise).
  const existingPoById = new Map<string, ExistingPo>(
    purchaseOrders.map((po) => [
      po.id,
      {
        id: po.id,
        po_number: po.po_number,
        name: po.name ?? null,
        po_type_id: po.po_type_id ?? null,
        po_received_date: po.po_received_date ?? null,
        financial_year_id: po.financial_year_id ?? null,
        gst_percent: po.gst_percent ?? null,
        payment_terms_id: po.payment_terms_id ?? null,
        contract_time_id: po.contract_time_id ?? null,
        site_ids: (po.po_sites || []).map((s) => s.site_id),
        module_ids: (po.po_modules || []).map((m) => m.module_id),
        module_license_counts: Object.fromEntries(
          (po.po_modules || []).map((m) => [m.module_id, m.license_count ?? null]),
        ),
        line_items: (po.po_line_items || []).map((li) => ({
          description: li.description,
          qty: li.qty,
          unit_price_paise: li.unit_price_paise,
          product_id: li.product_id ?? null,
          product_category_id: li.product_category_id ?? null,
          cost_type_id: li.cost_type_id ?? null,
          renewal_term_id: li.renewal_term_id ?? null,
        })),
        attachment: poAttachmentById.get(po.id) ?? null,
      },
    ]),
  );

  // A single-site org's detail page redirects straight back here, so send
  // the breadcrumb to the list instead of bouncing the user in a loop.
  const orgIsSingleSite = (orgSitesRes.data?.length ?? 0) <= 1;

  // Secondary context lines for the summary cards. All derived on read (CLAUDE.md).
  // Cancelled invoices are excluded from the count, matching the money rollups.
  const activeInvoiceCount = (invoices || []).filter(
    (inv) => balancesByInvoice.get(inv.id)?.computed_status !== "cancelled",
  ).length;
  const hasInvoices = activeInvoiceCount > 0;
  const overdueCount = (invoiceBalances || []).filter(
    (b) => b.computed_status === "overdue",
  ).length;
  const collectedPct =
    totalInvoicedPaise > 0
      ? Math.round((totalCollectedPaise / totalInvoicedPaise) * 100)
      : 0;
  const fullyCollected = hasInvoices && outstandingPaise === 0;

  // PO count context = new vs renewal split, read from PO Type (spec App. A.4).
  // POs have no lifecycle "status" field, so we don't claim one (e.g. "active").
  const renewalPoCount = purchaseOrders.filter((po) => {
    const t = Array.isArray(po.po_type) ? po.po_type[0] : po.po_type;
    return /^renewal/i.test(t?.name ?? "");
  }).length;
  const newPoCount = purchaseOrders.length - renewalPoCount;
  const poCountContext =
    purchaseOrders.length === 0
      ? null
      : [
          newPoCount > 0 ? `${newPoCount} new` : null,
          renewalPoCount > 0 ? `${renewalPoCount} renewal` : null,
        ]
          .filter(Boolean)
          .join(" · ");

  // Earliest still-upcoming renewal across this site's POs → "Next renewal: Jan 2027".
  const todayIso = new Date().toISOString().slice(0, 10);
  const nextRenewalIso =
    [...renewalsByPo.values()]
      .flat()
      .map((r) => r.renewalDate)
      .filter((d): d is string => d !== null && d >= todayIso)
      .sort()[0] ?? null;
  const poValueContext = nextRenewalIso
    ? `Next renewal: ${formatMonthYear(nextRenewalIso)}`
    : purchaseOrders.length > 0
      ? "No upcoming renewals"
      : null;

  // Scope-change rows for the modal. Approver options reuse the active
  // internal-users list already loaded for PO owners (ownersRes).
  const flattenName = (v: { name: string } | { name: string }[] | null) =>
    (Array.isArray(v) ? v[0] : v)?.name ?? null;
  const scopeChanges: ScopeChangeRow[] = (scopeChangesRaw || []).map((sc) => ({
    id: sc.id,
    description: sc.description,
    changeDate: sc.change_date,
    impact: sc.impact,
    approverId: sc.approver_id,
    approverName: flattenName(sc.approver),
    status: sc.status,
    createdByName: flattenName(sc.created_by_user),
    createdAt: sc.created_at,
  }));

  // Anchor targets for the sticky sub-header nav (ids match the section markup).
  const navSections: NavSection[] = [
    { id: "overview", label: "Overview" },
    { id: "pos", label: "POs" },
    { id: "licenses", label: "Licenses" },
    { id: "implementation", label: "Implementation" },
    { id: "support", label: "Support" },
    { id: "contacts", label: "Contacts" },
    { id: "hardware", label: "Hardware" },
    { id: "scope", label: "Scope" },
    { id: "agreements", label: "Agreements" },
    { id: "addresses", label: "Addresses" },
  ];

  return (
    <div>
      <SiteStickyNav
        orgName={
          organization?.brand_name || organization?.legal_name || "Organizations"
        }
        orgHref={
          organization && !orgIsSingleSite
            ? `/organizations/${organization.id}`
            : "/organizations"
        }
        siteName={site.name}
        status={site.status}
        sections={navSections}
      />
      {organization && (
        <Link
          href={orgIsSingleSite ? "/organizations" : `/organizations/${organization.id}`}
          className="rounded text-sm text-indigo-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
        >
          ← {orgIsSingleSite ? "Organizations" : organization.brand_name || organization.legal_name}
        </Link>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
            {site.name}
          </h1>
          {site.is_hq && (
            <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              HQ
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-600">
            {site.status}
          </span>
        </div>
        {/* Always available here too — a single-site org never shows its own
            sites list (it redirects straight into this page), so this is
            the only way to add a second site without a dead end. */}
        {canEdit && orgId && (
          <AddSiteButton
            organizationId={orgId}
            suggestHq={false}
            ownerOptions={ownersRes.data ?? []}
          />
        )}
      </div>

      <div id="overview" className="scroll-mt-24">
      <SiteMetaCard
        organizationId={orgId ?? ""}
        siteId={id}
        canEdit={canEdit}
        ownerOptions={ownersRes.data ?? []}
        regionDisplay={site.region || ""}
        timezoneDisplay={site.timezone || ""}
        gstDisplay={site.gst_number || ""}
        goLiveDisplay={site.go_live_date ? formatDisplayDate(site.go_live_date) : ""}
        onboardingOwnerDisplay={onboardingOwner?.name || ""}
        csOwnerDisplay={csOwner?.name || ""}
        initial={{
          name: site.name,
          isHq: site.is_hq,
          status: site.status,
          region: site.region ?? "",
          timezone: site.timezone ?? "",
          gstNumber: site.gst_number ?? "",
          goLiveDate: site.go_live_date ?? "",
          onboardingOwnerId: site.onboarding_owner_id ?? "",
          csOwnerId: site.cs_owner_id ?? "",
          addressSite: toAddressFields(site.address_site),
          addressBilling: toAddressFields(site.address_billing),
          addressShipping: toAddressFields(site.address_shipping),
        }}
      />
      </div>

      <div
        id="pos"
        className="mt-8 flex scroll-mt-24 items-center justify-between"
      >
        <h2 className="text-lg font-serif font-semibold text-gray-900">
          PO &amp; payments
        </h2>
        {canEdit && <AddPoButton {...poFormOptions} />}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard
          label="Purchase orders"
          value={String(purchaseOrders.length)}
          context={poCountContext}
        />
        <SummaryCard
          label="Total PO value"
          value={formatPaise(totalPoValuePaise)}
          context={poValueContext}
        />
        <SummaryCard
          label="Total invoiced"
          value={hasInvoices ? formatPaise(totalInvoicedPaise) : null}
          emptyText="No invoices yet"
          context={
            hasInvoices
              ? `${activeInvoiceCount} invoice${activeInvoiceCount === 1 ? "" : "s"}`
              : null
          }
        />
        <SummaryCard
          label="Total collected"
          value={hasInvoices ? formatPaise(totalCollectedPaise) : null}
          emptyText="No invoices yet"
          context={hasInvoices ? `Collected ${collectedPct}% of invoiced` : null}
          tone={fullyCollected ? "green" : "default"}
        />
        <SummaryCard
          label="Outstanding"
          value={hasInvoices ? formatPaise(outstandingPaise) : null}
          emptyText="No invoices yet"
          context={
            !hasInvoices
              ? null
              : outstandingPaise > 0
                ? overdueCount > 0
                  ? `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} overdue`
                  : "Payment pending"
                : "Fully collected"
          }
          tone={outstandingPaise > 0 ? "red" : fullyCollected ? "green" : "default"}
        />
      </div>

      {purchaseOrders.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          No purchase orders recorded for this site yet.
        </p>
      ) : (
        <PoFilterTable
          rows={purchaseOrders.map((po): PoFilterItem => {
            const poType = Array.isArray(po.po_type) ? po.po_type[0] : po.po_type;
            const costType = Array.isArray(po.cost_type)
              ? po.cost_type[0]
              : po.cost_type;
            // Cost type now lives on each line item, so a PO can carry several.
            // Show the distinct set; fall back to the PO's legacy value.
            const lineCostTypes = Array.from(
              new Set(
                (po.po_line_items || [])
                  .map((li) => {
                    const ct = Array.isArray(li.line_cost_type)
                      ? li.line_cost_type[0]
                      : li.line_cost_type;
                    return ct?.name ?? null;
                  })
                  .filter((n): n is string => Boolean(n)),
              ),
            );
            const costTypeSummary =
              lineCostTypes.length > 0
                ? lineCostTypes.join(", ")
                : costType?.name || "—";
            const financialYear = Array.isArray(po.financial_year)
              ? po.financial_year[0]
              : po.financial_year;
            const paymentTerm = Array.isArray(po.payment_term)
              ? po.payment_term[0]
              : po.payment_term;
            const contractTime = Array.isArray(po.contract_time)
              ? po.contract_time[0]
              : po.contract_time;
            const moduleNames = (po.po_modules || [])
              .map((pm) => {
                const mod = Array.isArray(pm.module) ? pm.module[0] : pm.module;
                return mod?.name;
              })
              .filter(Boolean)
              .join(", ");
            const poInvoices = invoicesByPo.get(po.id) || [];

            // Everything the invoice generator needs: the PO's payment-term
            // schedule (so it can split), its ex-tax value, GST %, and the
            // contract length in months (from Contract time).
            const termSpec: PaymentTermSpec | null = paymentTerm
              ? {
                  scheduleType:
                    paymentTerm.schedule_type === "milestone" ? "milestone" : "periodic",
                  invoicesPerYear: paymentTerm.invoices_per_year ?? null,
                  timing: paymentTerm.timing === "arrears" ? "arrears" : "advance",
                  billingScheduleDays: paymentTerm.billing_schedule_days ?? null,
                  installments: (
                    (paymentTerm.installments || []) as {
                      label: string;
                      percent: number | string;
                      sort_order: number;
                    }[]
                  )
                    .slice()
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .map((i) => ({ label: i.label, percent: Number(i.percent) })),
                }
              : null;
            const invoiceCtx: PoInvoiceContext = {
              poId: po.id,
              poNumber: po.po_number,
              poName: po.name ?? null,
              netPaise: poNetById.get(po.id) ?? 0,
              gstPercent: po.gst_percent ?? null,
              contractMonths: contractTime?.months ?? 12,
              poReceivedDate: po.po_received_date ?? null,
              term: termSpec,
              termName: paymentTerm?.name ?? null,
              coveredSites: (po.po_sites || []).map((s) => ({
                id: s.site_id,
                name: siteNameById.get(s.site_id) ?? "Site",
              })),
            };

            // Renewal/Expiry date = this PO's earliest upcoming renewal (year-2
            // projection), which is when the year-1 term expires. Computed from
            // the site's go-live date; "—" until go-live is stamped.
            const nextRenewalIso =
              renewalsByPo.get(po.id)?.[0]?.renewalDate ?? null;

            return {
              id: po.id,
              poType: poType?.name ?? null,
              financialYear: financialYear?.name ?? null,
              node: (
              <PoTableRow
                key={po.id}
                poNumber={po.name || po.po_number}
                statusLabel={poType?.name ?? null}
                product={moduleNames}
                type={costTypeSummary}
                date={formatDisplayDate(nextRenewalIso)}
                amount={formatPaise(poGrossById.get(po.id) ?? 0)}
                colSpan={7}
                actions={
                  canEdit && existingPoById.get(po.id) ? (
                    <EditPoButton po={existingPoById.get(po.id)!} {...poFormOptions} />
                  ) : null
                }
              >
                <div>
                  <dl className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Financial year
                      </dt>
                      <dd className="text-slate-700">{financialYear?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Payment terms
                      </dt>
                      <dd className="text-slate-700">{paymentTerm?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        Contract time
                      </dt>
                      <dd className="text-slate-700">{contractTime?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        PO attachment
                      </dt>
                      <dd className="text-slate-700">
                        {(() => {
                          const att = poAttachmentById.get(po.id);
                          if (!att) return "—";
                          return att.url ? (
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium text-indigo-600 hover:text-indigo-700"
                            >
                              {att.filename}
                            </a>
                          ) : (
                            att.filename
                          );
                        })()}
                      </dd>
                    </div>
                  </dl>

                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500">
                    Line items
                  </h3>
                  {(po.po_line_items || []).length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No line items recorded.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <thead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="py-1 text-left font-medium">Description</th>
                          <th className="py-1 text-left font-medium">Category</th>
                          <th className="py-1 text-left font-medium">Cost type</th>
                          <th className="py-1 text-left font-medium">Renewal term</th>
                          <th className="py-1 text-right font-medium">Qty</th>
                          <th className="py-1 text-right font-medium">Unit price</th>
                          <th className="py-1 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(po.po_line_items || []).map((li) => {
                          const cat = Array.isArray(li.line_category)
                            ? li.line_category[0]
                            : li.line_category;
                          const ct = Array.isArray(li.line_cost_type)
                            ? li.line_cost_type[0]
                            : li.line_cost_type;
                          const rt = Array.isArray(li.renewal_term)
                            ? li.renewal_term[0]
                            : li.renewal_term;
                          return (
                            <tr key={li.id}>
                              <td className="py-1 text-slate-700">{li.description}</td>
                              <td className="py-1 text-slate-600">{cat?.name || "—"}</td>
                              <td className="py-1 text-slate-600">{ct?.name || "—"}</td>
                              <td className="py-1 text-slate-600">{rt?.name || "—"}</td>
                              <td className="py-1 text-right tabular-nums text-slate-700">
                                {li.qty}
                              </td>
                              <td className="py-1 text-right tabular-nums text-slate-700">
                                {formatPaise(li.unit_price_paise)}
                              </td>
                              <td className="py-1 text-right tabular-nums text-gray-900">
                                {formatPaise(li.amount_paise)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="border-t border-slate-200">
                        <tr>
                          <td colSpan={6} className="py-1 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            Subtotal (goods)
                          </td>
                          <td className="py-1 text-right tabular-nums text-slate-600">
                            {formatPaise(poNetById.get(po.id) ?? 0)}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="py-1 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            GST{po.gst_percent ? ` (${po.gst_percent}%)` : ""}
                          </td>
                          <td className="py-1 text-right tabular-nums text-slate-600">
                            {formatPaise((poGrossById.get(po.id) ?? 0) - (poNetById.get(po.id) ?? 0))}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={6} className="py-1 text-right text-xs font-medium uppercase tracking-wide text-gray-500">
                            PO total
                          </td>
                          <td className="py-1 text-right font-semibold tabular-nums text-gray-900">
                            {formatPaise(poGrossById.get(po.id) ?? 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}

                  <InvoicesPanel
                    invoices={poInvoices.map((inv) => {
                      const balance = balancesByInvoice.get(inv.id);
                      const rnw = Array.isArray(inv.renewal)
                        ? inv.renewal[0]
                        : inv.renewal;
                      return {
                        id: inv.id,
                        invoice_number: inv.invoice_number,
                        amount_paise: inv.amount_paise,
                        gst_amount_paise: inv.gst_amount_paise,
                        total_paise: inv.total_paise,
                        status: inv.status,
                        issue_date: inv.issue_date,
                        due_date: inv.due_date,
                        renewal_id: inv.renewal_id,
                        yearNumber: rnw?.year_number ?? null,
                        computedStatus: balance?.computed_status || inv.status,
                        balance_paise: balance?.balance_paise ?? inv.total_paise,
                        payments: (paymentsByInvoice.get(inv.id) || []).map((p) => ({
                          id: p.id,
                          received_date: p.received_date,
                          mode: p.mode,
                          reference: p.reference,
                          amount_paise: p.amount_paise,
                        })),
                      };
                    })}
                    siteId={id}
                    canEdit={canEdit}
                    headerAction={
                      canEdit ? (
                        <InvoiceActionsForPo
                          ctx={invoiceCtx}
                          siteId={id}
                          canRegenerate={poInvoices.some(
                            (inv) => !inv.renewal_id && inv.status !== "cancelled",
                          )}
                        />
                      ) : null
                    }
                  />

                  <RenewalsForPo
                    renewals={renewalsByPo.get(po.id) ?? []}
                    siteId={id}
                    canEdit={canEdit}
                    goLiveSet={Boolean(site.go_live_date)}
                    paymentTermsOptions={renewalPaymentTermsOptions}
                    renewalPoTypeOptions={renewalPoTypeOptions}
                  />
                </div>
              </PoTableRow>
              ),
            };
          })}
        />
      )}

      <h2
        id="licenses"
        className="mt-8 scroll-mt-24 text-lg font-serif font-semibold text-gray-900"
      >
        Licenses
      </h2>
      <div className="mt-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        {licenseModules.length === 0 ? (
          <p className="text-sm text-slate-400">
            No modules licensed yet — add a PO covering this site with modules selected.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {licenseModules.map(([moduleId, name, licenses]) => (
              <span
                key={moduleId}
                className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {name}
                {licenses != null && (
                  <span className="rounded-full bg-white/70 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-indigo-600">
                    {licenses.toLocaleString("en-IN")}
                  </span>
                )}
              </span>
            ))}
          </div>
        )}
      </div>

      <h2 className="mt-8 text-lg font-serif font-semibold text-gray-900">
        Implementation, usage &amp; support
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link
          href={`/sites/${site.id}/implementation`}
          id="implementation"
          className="scroll-mt-24 block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <h3 className="text-sm font-medium text-gray-900">Implementation</h3>
          <p className="mt-1 text-sm text-slate-500">{implSummary}</p>
          <p className="mt-3 text-xs font-medium text-indigo-600">
            Open implementation →
          </p>
        </Link>
        <Link
          href={`/sites/${site.id}/usage`}
          className="scroll-mt-24 block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <h3 className="text-sm font-medium text-gray-900">Customer Usage</h3>
          <p className="mt-1 text-sm text-slate-500">
            Weekly entries per module vs expected, and usage health.
          </p>
          <p className="mt-3 text-xs font-medium text-indigo-600">Open usage →</p>
        </Link>
        <Link
          href={`/sites/${site.id}/support`}
          id="support"
          className="scroll-mt-24 block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <h3 className="text-sm font-medium text-gray-900">Support</h3>
          <p className="mt-1 text-sm text-slate-500">
            {supportTotal === 0
              ? "Log support tickets raised for this site."
              : `${supportTotal} ticket${supportTotal === 1 ? "" : "s"}${
                  supportOpen > 0 ? ` · ${supportOpen} open` : ""
                }`}
          </p>
          <p className="mt-3 text-xs font-medium text-indigo-600">Open support →</p>
        </Link>
        <Link
          href={`/sites/${site.id}/spox`}
          id="contacts"
          className="scroll-mt-24 block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <h3 className="text-sm font-medium text-gray-900">Spox</h3>
          <p className="mt-1 text-sm text-slate-500">
            {spoxTotal === 0
              ? "Customer contacts by role, internal owners, and replacement history."
              : `${spoxTotal} active${spoxBreakdown ? ` · ${spoxBreakdown}` : ""}`}
          </p>
          <p className="mt-3 text-xs font-medium text-indigo-600">Open Spox →</p>
        </Link>
        <Link
          href={`/sites/${site.id}/hardware`}
          id="hardware"
          className="scroll-mt-24 block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <h3 className="text-sm font-medium text-gray-900">Hardware &amp; Replacement</h3>
          <p className="mt-1 text-sm text-slate-500">
            Devices deployed at this site and their replacement history.
          </p>
          <p className="mt-3 text-xs font-medium text-indigo-600">Open hardware →</p>
        </Link>
        <ScopeChangesCard
          id="scope"
          siteId={site.id}
          scopeChanges={scopeChanges}
          approvers={ownersRes.data ?? []}
          canEdit={canEdit}
        />
        <Link
          href={`/sites/${site.id}/agreements`}
          id="agreements"
          className="scroll-mt-24 block rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-indigo-200 hover:bg-indigo-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          <h3 className="text-sm font-medium text-gray-900">Agreements</h3>
          <p className="mt-1 text-sm text-slate-500">
            {agreementsTotal === 0
              ? "Store signed agreements for this site — NDAs, service agreements, and more."
              : `${agreementsTotal} agreement${agreementsTotal === 1 ? "" : "s"} on file.`}
          </p>
          <p className="mt-3 text-xs font-medium text-indigo-600">Open agreements →</p>
        </Link>
        {/* Scope & Flow — placeholder for a later milestone. Not a link (nothing
            to open yet); styled muted so it clearly reads as coming soon. */}
        <div
          id="scope-and-flow"
          className="scroll-mt-24 block rounded-xl border border-dashed border-gray-200 bg-white/60 p-4 shadow-sm"
        >
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-500">Scope &amp; Flow</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
              Coming soon
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-400">
            The scope and flow for this site will live here. We&apos;ll build it later.
          </p>
        </div>
      </div>

      <h2
        id="addresses"
        className="mt-8 scroll-mt-24 text-lg font-serif font-semibold text-gray-900"
      >
        Addresses
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AddressBlock label="Site / physical" address={site.address_site} />
        <AddressBlock label="Billing" address={site.address_billing} />
        <AddressBlock label="Shipping" address={site.address_shipping} />
      </div>
    </div>
  );
}
