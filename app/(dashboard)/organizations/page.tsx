import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { AddOrganizationButton } from "./organization-form";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700",
  prospect: "bg-amber-50 text-amber-700",
  churned: "bg-red-50 text-red-700",
};

export default async function OrganizationsPage() {
  const supabase = await createClient();
  const [{ data: organizations, error }, user, { data: owners }] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, brand_name, industry, status")
      .order("legal_name"),
    getCurrentInternalUser(),
    supabase.from("internal_users").select("id, name").eq("is_active", true).order("name"),
  ]);

  const canEdit = canEditCatalogs(user);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
            Organizations
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every customer HQ we work with.
          </p>
        </div>
        {canEdit && <AddOrganizationButton ownerOptions={owners ?? []} />}
      </div>

      {error && (
        <p className="mt-6 text-sm text-red-600">
          Could not load organizations: {error.message}
        </p>
      )}

      <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3 font-medium">Organization</th>
              <th className="px-4 py-3 font-medium">Industry</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {organizations?.map((org) => (
              <tr key={org.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    href={`/organizations/${org.id}`}
                    className="font-medium text-gray-900 hover:text-indigo-600"
                  >
                    {org.brand_name || org.legal_name}
                  </Link>
                  <div className="text-xs text-slate-400">
                    {org.legal_name}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {org.industry || "—"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                      STATUS_STYLES[org.status] ?? "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {org.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {organizations?.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">
            No organizations yet.
          </p>
        )}
      </div>
    </div>
  );
}
