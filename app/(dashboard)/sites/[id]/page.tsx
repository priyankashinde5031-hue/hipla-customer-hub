import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function AddressBlock({
  label,
  address,
}: {
  label: string;
  address: Record<string, unknown> | null;
}) {
  const hasContent = address && Object.keys(address).length > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">
        {label}
      </h3>
      {hasContent ? (
        <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
          {JSON.stringify(address, null, 2)}
        </pre>
      ) : (
        <p className="mt-2 text-sm text-slate-400">Not recorded yet.</p>
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

  const organization = Array.isArray(site.organization)
    ? site.organization[0]
    : site.organization;
  const onboardingOwner = Array.isArray(site.onboarding_owner)
    ? site.onboarding_owner[0]
    : site.onboarding_owner;
  const csOwner = Array.isArray(site.cs_owner)
    ? site.cs_owner[0]
    : site.cs_owner;

  return (
    <div>
      {organization && (
        <Link
          href={`/organizations/${organization.id}`}
          className="text-sm text-indigo-600"
        >
          ← {organization.brand_name || organization.legal_name}
        </Link>
      )}

      <div className="mt-2 flex items-center gap-2">
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
    </div>
  );
}
