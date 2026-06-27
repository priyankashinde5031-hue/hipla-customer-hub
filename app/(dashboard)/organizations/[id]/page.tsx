import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const STATUS_STYLES: Record<string, string> = {
  live: "bg-green-50 text-green-700",
  implementing: "bg-amber-50 text-amber-700",
  prospect: "bg-amber-50 text-amber-700",
  suspended: "bg-amber-50 text-amber-700",
  churned: "bg-red-50 text-red-700",
};

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: organization } = await supabase
    .from("organizations")
    .select("id, legal_name, brand_name, industry, status, notes")
    .eq("id", id)
    .maybeSingle();

  if (!organization) {
    notFound();
  }

  const { data: sites, error: sitesError } = await supabase
    .from("sites")
    .select("id, name, is_hq, status, region, go_live_date")
    .eq("organization_id", id)
    .order("is_hq", { ascending: false })
    .order("name");

  return (
    <div>
      <Link href="/organizations" className="text-sm text-indigo-600">
        ← Organizations
      </Link>

      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
        {organization.brand_name || organization.legal_name}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        {organization.legal_name}
        {organization.industry ? ` · ${organization.industry}` : ""}
      </p>

      <h2 className="mt-8 text-sm font-medium uppercase tracking-wide text-slate-500">
        Sites
      </h2>

      {sitesError && (
        <p className="mt-2 text-sm text-red-600">
          Could not load sites: {sitesError.message}
        </p>
      )}

      <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Site</th>
              <th className="px-4 py-3 font-medium">Region</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Go-live</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sites?.map((site) => (
              <tr key={site.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/sites/${site.id}`}
                    className="font-medium text-slate-900 hover:text-indigo-600"
                  >
                    {site.name}
                  </Link>
                  {site.is_hq && (
                    <span className="ml-2 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      HQ
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {site.region || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      STATUS_STYLES[site.status] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {site.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {site.go_live_date || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {sites?.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">
            No sites yet for this organization.
          </p>
        )}
      </div>
    </div>
  );
}
