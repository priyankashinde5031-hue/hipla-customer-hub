import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { PaymentTermsManager, type PaymentTermRow } from "./payment-terms-manager";

export default async function PaymentTermsPage() {
  const supabase = await createClient();
  const user = await getCurrentInternalUser();
  const canEdit = canEditCatalogs(user);

  const { data: terms, error } = await supabase
    .from("payment_terms")
    .select(
      `id, name, active, schedule_type, invoices_per_year, timing, billing_schedule_days,
       installments:payment_term_installments ( id, sort_order, label, percent )`,
    )
    .order("name");

  const rows: PaymentTermRow[] = (terms ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    active: t.active,
    schedule_type: t.schedule_type,
    invoices_per_year: t.invoices_per_year,
    timing: t.timing,
    billing_schedule_days: t.billing_schedule_days,
    installments: (t.installments ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((i) => ({ label: i.label, percent: Number(i.percent) })),
  }));

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Payment Terms</h1>
      <p className="mt-1 max-w-2xl text-sm text-slate-500">
        A payment term decides how a Purchase Order is split into invoices — either a
        repeating frequency (e.g. quarterly) multiplied by the contract length, or named
        milestones with percentages (e.g. 25 / 25 / 50). The billing schedule is how many
        days after the invoice date payment is expected to clear.
      </p>

      {error && (
        <p className="mt-6 text-sm text-red-600">Could not load payment terms: {error.message}</p>
      )}

      <div className="mt-6">
        <PaymentTermsManager rows={rows} canEdit={canEdit} />
      </div>
    </div>
  );
}
