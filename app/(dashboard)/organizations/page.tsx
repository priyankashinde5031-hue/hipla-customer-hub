import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { getOrganizationMetrics } from "@/lib/org-list-metrics";
import { AddOrganizationButton } from "./organization-form";
import { OrganizationsList, type OrgRow } from "./organizations-list";

export default async function OrganizationsPage() {
  const supabase = await createClient();
  const [{ data: organizations, error }, user, { data: owners }, metrics] = await Promise.all([
    supabase
      .from("organizations")
      .select("id, legal_name, brand_name, industry, status")
      .order("legal_name"),
    getCurrentInternalUser(),
    supabase.from("internal_users").select("id, name").eq("is_active", true).order("name"),
    getOrganizationMetrics(supabase),
  ]);

  const canEdit = canEditCatalogs(user);

  const rows: OrgRow[] = (organizations ?? []).map((org) => {
    const m = metrics.get(org.id);
    return {
      id: org.id,
      legalName: org.legal_name,
      brandName: org.brand_name,
      industry: org.industry,
      status: org.status,
      totalPos: m?.totalPos ?? 0,
      overdueRenewals: m?.overdueRenewals ?? 0,
      overdueInvoices: m?.overdueInvoices ?? 0,
      projectsInProgress: m?.projectsInProgress ?? 0,
    };
  });

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

      <OrganizationsList organizations={rows} canEdit={canEdit} />
    </div>
  );
}
