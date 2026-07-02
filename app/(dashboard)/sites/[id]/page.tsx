import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { AddSiteButton } from "@/app/(dashboard)/organizations/[id]/site-form";
import { AddPoButton, EditPoButton, type ExistingPo } from "./po-form";
import { PoTableRow } from "./po-table";
import { InvoiceActionsForPo, type PoInvoiceContext } from "./invoice-form";
import { RecordPaymentButton } from "./payment-form";
import { EditInvoiceButton } from "./invoice-edit-form";
import {
  RenewalsForPo,
  type RenewalCardData,
  type PaymentTermOption,
} from "./renewals-section";
import type { PaymentTermSpec } from "@/lib/invoicing";
import { renewalDate } from "@/lib/renewals";

const STATUS_STYLES: Record<string, string> = {
  cleared: "bg-emerald-50 text-emerald-700",
  "part-paid": "bg-amber-50 text-amber-700",
  due: "bg-amber-50 text-amber-700",
  overdue: "bg-red-50 text-red-700",
  draft: "bg-slate-100 text-slate-600",
  raised: "bg-slate-100 text-slate-600",
  cancelled: "bg-slate-100 text-slate-400",
};

// Design system: dates render as "30 Jun 2026", never raw ISO. Parses the
// stored YYYY-MM-DD without going through Date() (avoids timezone day-shift).
const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
function formatDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${Number(m[3])} ${MONTH_ABBR[Number(m[2]) - 1]} ${m[1]}`;
}

// "Jan 2027" — month + year only, for the renewal context line.
function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  return `${MONTH_ABBR[Number(m[2]) - 1]} ${m[1]}`;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
        STATUS_STYLES[status] || "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}

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
      ? "border-slate-200"
      : tone === "red"
        ? "border-red-200"
        : "border-emerald-200";
  const valueClass = isEmpty
    ? "text-slate-400"
    : tone === "red"
      ? "text-red-600"
      : tone === "green"
        ? "text-emerald-700"
        : "text-slate-900";
  return (
    <div className={`rounded-lg border ${borderClass} bg-white p-3`}>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-lg font-semibold tabular-nums ${valueClass}`}>
        {isEmpty ? emptyText ?? "—" : value}
      </p>
      {!isEmpty && context ? (
        <p className="mt-0.5 text-xs text-slate-500">{context}</p>
      ) : null}
    </div>
  );
}

// Modules 5–9 of the spec (Implementation, Usage, Support, SPOCs, Scope
// Changes, Hardware) aren't built yet — CLAUDE.md says not to start them
// until told. These render the Site 360 layout now; real data lands
// module-by-module later, same as PO & Invoices did.
function PlaceholderCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-slate-200 bg-white p-4">
      <h3 className="text-sm font-medium text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-400">{description}</p>
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-300">
        Coming soon
      </p>
    </div>
  );
}

// Known keys from the Add Site form (line1, line2, city, state, pincode),
// rendered as a normal postal address. Any other/legacy keys fall back to a
// plain key: value list so nothing is silently dropped.
const KNOWN_ADDRESS_KEYS = ["line1", "line2", "city", "state", "pincode"];

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
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
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
         po_modules ( module_id, module:modules ( name ) ),
         po_line_items ( id, description, qty, unit_price_paise, amount_paise )
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
  const licenseModules = Array.from(
    new Map(
      purchaseOrders
        .flatMap((po) => po.po_modules || [])
        .map((pm) => {
          const mod = Array.isArray(pm.module) ? pm.module[0] : pm.module;
          return [pm.module_id, mod?.name ?? "—"] as const;
        }),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

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
       issue_date, due_date, status,
       purchase_order:purchase_orders ( po_number )`,
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
    financialYearsRes,
    paymentTermsRes,
    contractTimesRes,
    modulesRes,
    orgSitesRes,
    ownersRes,
  ] = await Promise.all([
    getCurrentInternalUser(),
    supabase.from("po_types").select("id, name").eq("active", true).order("name"),
    supabase.from("cost_types").select("id, name").eq("active", true).order("name"),
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

  const poFormOptions = {
    organizationId: orgId ?? "",
    siteId: id,
    poTypeOptions: poTypesRes.data ?? [],
    costTypeOptions: costTypesRes.data ?? [],
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
           payment_terms_id, status,
           attachment:attachments!attachment_id ( storage_path, original_filename )`,
        )
        .in("po_id", poIds)
        .order("year_number")
    : { data: [] };

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
      const card: RenewalCardData = {
        id: r.id,
        yearNumber: r.year_number,
        renewalDate: renewalDate(site.go_live_date, r.offset_months),
        expectedValuePaise: r.expected_value_paise,
        renewalValuePaise: r.renewal_value_paise,
        renewalReceivedDate: r.renewal_received_date,
        paymentTermsId: r.payment_terms_id,
        status: r.status === "renewed" ? "renewed" : "upcoming",
        attachment: attached,
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
        cost_type_id: po.cost_type_id ?? null,
        po_received_date: po.po_received_date ?? null,
        financial_year_id: po.financial_year_id ?? null,
        gst_percent: po.gst_percent ?? null,
        payment_terms_id: po.payment_terms_id ?? null,
        contract_time_id: po.contract_time_id ?? null,
        site_ids: (po.po_sites || []).map((s) => s.site_id),
        module_ids: (po.po_modules || []).map((m) => m.module_id),
        line_items: (po.po_line_items || []).map((li) => ({
          description: li.description,
          qty: li.qty,
          unit_price_paise: li.unit_price_paise,
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

  return (
    <div>
      {organization && (
        <Link
          href={orgIsSingleSite ? "/organizations" : `/organizations/${organization.id}`}
          className="text-sm text-indigo-600"
        >
          ← {orgIsSingleSite ? "Organizations" : organization.brand_name || organization.legal_name}
        </Link>
      )}

      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
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

      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Region
          </dt>
          <dd className="mt-1 text-slate-900">{site.region || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Timezone
          </dt>
          <dd className="mt-1 text-slate-900">{site.timezone || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            GST number
          </dt>
          <dd className="mt-1 text-slate-900">{site.gst_number || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Go-live date
          </dt>
          <dd className="mt-1 text-slate-900">{site.go_live_date || "—"}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            Onboarding owner
          </dt>
          <dd className="mt-1 text-slate-900">
            {onboardingOwner?.name || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">
            CS owner
          </dt>
          <dd className="mt-1 text-slate-900">{csOwner?.name || "—"}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-500">
        Addresses
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <AddressBlock label="Site / physical" address={site.address_site} />
        <AddressBlock label="Billing" address={site.address_billing} />
        <AddressBlock label="Shipping" address={site.address_shipping} />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-sm font-medium uppercase tracking-wide text-slate-500">
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
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-left [font-variant-numeric:tabular-nums]">
            <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr className="border-b border-slate-200">
                <th className="py-2 pl-2 pr-3 font-medium">PO Number</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Renewal / Expiry</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
                <th className="py-2 pl-3 pr-2 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
          {purchaseOrders.map((po) => {
            const poType = Array.isArray(po.po_type) ? po.po_type[0] : po.po_type;
            const costType = Array.isArray(po.cost_type)
              ? po.cost_type[0]
              : po.cost_type;
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

            return (
              <PoTableRow
                key={po.id}
                poNumber={po.po_number}
                statusLabel={poType?.name ?? null}
                product={moduleNames}
                type={costType?.name || "—"}
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
                      <dt className="text-xs uppercase tracking-wide text-slate-500">
                        Financial year
                      </dt>
                      <dd className="text-slate-700">{financialYear?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">
                        Payment terms
                      </dt>
                      <dd className="text-slate-700">{paymentTerm?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">
                        Contract time
                      </dt>
                      <dd className="text-slate-700">{contractTime?.name || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">
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

                  <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Line items
                  </h3>
                  {(po.po_line_items || []).length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">No line items recorded.</p>
                  ) : (
                    <table className="mt-2 w-full text-sm">
                      <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-1 text-left font-medium">Description</th>
                          <th className="py-1 text-right font-medium">Qty</th>
                          <th className="py-1 text-right font-medium">Unit price</th>
                          <th className="py-1 text-right font-medium">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(po.po_line_items || []).map((li) => (
                          <tr key={li.id}>
                            <td className="py-1 text-slate-700">{li.description}</td>
                            <td className="py-1 text-right tabular-nums text-slate-700">
                              {li.qty}
                            </td>
                            <td className="py-1 text-right tabular-nums text-slate-700">
                              {formatPaise(li.unit_price_paise)}
                            </td>
                            <td className="py-1 text-right tabular-nums text-slate-900">
                              {formatPaise(li.amount_paise)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t border-slate-200">
                        <tr>
                          <td colSpan={3} className="py-1 text-right text-xs uppercase tracking-wide text-slate-500">
                            Subtotal (goods)
                          </td>
                          <td className="py-1 text-right tabular-nums text-slate-600">
                            {formatPaise(poNetById.get(po.id) ?? 0)}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="py-1 text-right text-xs uppercase tracking-wide text-slate-500">
                            GST{po.gst_percent ? ` (${po.gst_percent}%)` : ""}
                          </td>
                          <td className="py-1 text-right tabular-nums text-slate-600">
                            {formatPaise((poGrossById.get(po.id) ?? 0) - (poNetById.get(po.id) ?? 0))}
                          </td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="py-1 text-right text-xs font-medium uppercase tracking-wide text-slate-500">
                            PO total
                          </td>
                          <td className="py-1 text-right font-semibold tabular-nums text-slate-900">
                            {formatPaise(poGrossById.get(po.id) ?? 0)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}

                  <div className="mt-4 flex items-center justify-between">
                    <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                      Invoices
                    </h3>
                    {canEdit && (
                      <span className="flex items-center gap-3">
                        <InvoiceActionsForPo ctx={invoiceCtx} siteId={id} />
                      </span>
                    )}
                  </div>
                  {poInvoices.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-400">
                      No invoices raised against this PO for this site yet.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {poInvoices.map((inv) => {
                        const balance = balancesByInvoice.get(inv.id);
                        const status = balance?.computed_status || inv.status;
                        const isOverdue = status === "overdue";
                        const invPayments = paymentsByInvoice.get(inv.id) || [];
                        return (
                          <div
                            key={inv.id}
                            className={`rounded-md border ${
                              isOverdue ? "border-red-200 bg-red-50/40" : "border-slate-100"
                            } p-3`}
                          >
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                                <span className="font-medium text-slate-900">
                                  {inv.invoice_number}
                                </span>
                                <span className="text-slate-500">
                                  Issued {inv.issue_date || "—"}
                                </span>
                                <span className="text-slate-500">
                                  Due {inv.due_date || "—"}
                                </span>
                                <StatusBadge status={status} />
                              </div>
                              <div className="flex gap-4 text-sm tabular-nums">
                                <span className="text-slate-500">
                                  Amount {formatPaise(inv.amount_paise)}
                                </span>
                                <span className="text-slate-500">
                                  GST {formatPaise(inv.gst_amount_paise)}
                                </span>
                                <span className="font-medium text-slate-900">
                                  Total {formatPaise(inv.total_paise)}
                                </span>
                                <span className="font-medium text-slate-900">
                                  Balance{" "}
                                  {formatPaise(balance?.balance_paise ?? inv.total_paise)}
                                </span>
                                {canEdit &&
                                  status !== "cleared" &&
                                  status !== "cancelled" && (
                                    <RecordPaymentButton
                                      invoiceId={inv.id}
                                      invoiceNumber={inv.invoice_number}
                                      balancePaise={balance?.balance_paise ?? inv.total_paise}
                                      siteId={id}
                                    />
                                  )}
                                {canEdit && (
                                  <EditInvoiceButton
                                    invoiceId={inv.id}
                                    invoiceNumber={inv.invoice_number}
                                    currentStatus={inv.status}
                                    issueDate={inv.issue_date}
                                    dueDate={inv.due_date}
                                    siteId={id}
                                  />
                                )}
                              </div>
                            </div>

                            {invPayments.length > 0 && (
                              <table className="mt-2 w-full text-sm">
                                <thead className="text-xs uppercase tracking-wide text-slate-500">
                                  <tr>
                                    <th className="py-1 text-left font-medium">Received</th>
                                    <th className="py-1 text-left font-medium">Mode</th>
                                    <th className="py-1 text-left font-medium">Reference</th>
                                    <th className="py-1 text-right font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                  {invPayments.map((p) => (
                                    <tr key={p.id}>
                                      <td className="py-1 text-slate-700">{p.received_date}</td>
                                      <td className="py-1 text-slate-700">{p.mode || "—"}</td>
                                      <td className="py-1 text-slate-700">
                                        {p.reference || "—"}
                                      </td>
                                      <td className="py-1 text-right tabular-nums text-slate-900">
                                        {formatPaise(p.amount_paise)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <RenewalsForPo
                    renewals={renewalsByPo.get(po.id) ?? []}
                    siteId={id}
                    canEdit={canEdit}
                    goLiveSet={Boolean(site.go_live_date)}
                    paymentTermsOptions={renewalPaymentTermsOptions}
                  />
                </div>
              </PoTableRow>
            );
          })}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-slate-500">
        Licenses
      </h2>
      <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4">
        {licenseModules.length === 0 ? (
          <p className="text-sm text-slate-400">
            No modules licensed yet — add a PO covering this site with modules selected.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {licenseModules.map(([moduleId, name]) => (
              <span
                key={moduleId}
                className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
              >
                {name}
              </span>
            ))}
          </div>
        )}
      </div>

      <h2 className="mt-10 text-sm font-medium uppercase tracking-wide text-slate-500">
        Implementation, usage &amp; support
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PlaceholderCard
          title="Implementation"
          description="Scope, stages, and go-live tracking for this site."
        />
        <PlaceholderCard
          title="Customer Usage"
          description="Usage health per module, imported from Hipla's own systems."
        />
        <PlaceholderCard
          title="Support"
          description="Ticket volume and topics logged for this site."
        />
        <PlaceholderCard
          title="Customer SPOCs"
          description="Points of contact for this site and its organization."
        />
        <PlaceholderCard
          title="Scope Changes"
          description="Approved changes to this site's implementation scope."
        />
        <PlaceholderCard
          title="Hardware & Replacement"
          description="Devices deployed at this site and their replacement history."
        />
      </div>
    </div>
  );
}
