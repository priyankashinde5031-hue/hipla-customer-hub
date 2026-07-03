import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { SpoxView, type SpoxRow, type TeamOption, type StaffOption } from "./spox-view";

export default async function SiteSpoxPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: site }, user] = await Promise.all([
    supabase
      .from("sites")
      .select(
        `id, name, is_hq, status,
         organization:organizations ( id, legal_name, brand_name )`,
      )
      .eq("id", id)
      .maybeSingle(),
    getCurrentInternalUser(),
  ]);

  if (!site) notFound();

  const canEdit = canEditCatalogs(user);
  const organization = Array.isArray(site.organization)
    ? site.organization[0]
    : site.organization;

  const [{ data: spoxRaw }, { data: teamsRaw }, { data: staffRaw }] = await Promise.all([
    supabase
      .from("spox")
      .select(
        `id, name, role, email, phone, designation, has_taken_training,
         internal_owner_team_id, internal_owner_user_id, status, replaced_by_id,
         left_at, created_at,
         internal_owner_team:internal_teams ( name ),
         internal_owner_user:internal_users!spox_internal_owner_user_id_fkey ( name ),
         replaced_by:spox!replaced_by_id ( name )`,
      )
      .eq("site_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("internal_teams")
      .select("id, name")
      .eq("active", true)
      .order("sort_order"),
    supabase
      .from("internal_users")
      .select("id, name")
      .eq("is_active", true)
      .order("name"),
  ]);

  const flatten = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const spox: SpoxRow[] = (spoxRaw || []).map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    email: s.email,
    phone: s.phone,
    designation: s.designation,
    hasTakenTraining: s.has_taken_training,
    internalOwnerTeamId: s.internal_owner_team_id,
    internalOwnerTeamName: flatten(s.internal_owner_team)?.name ?? "—",
    internalOwnerUserId: s.internal_owner_user_id,
    internalOwnerUserName: flatten(s.internal_owner_user)?.name ?? null,
    status: s.status,
    replacedById: s.replaced_by_id,
    replacedByName: flatten(s.replaced_by)?.name ?? null,
    leftAt: s.left_at,
  }));

  const teams: TeamOption[] = (teamsRaw || []).map((t) => ({ id: t.id, name: t.name }));
  const staff: StaffOption[] = (staffRaw || []).map((u) => ({ id: u.id, name: u.name }));

  const orgLabel =
    organization?.brand_name || organization?.legal_name || "Organization";

  return (
    <div>
      <Link
        href={`/sites/${site.id}`}
        className="rounded text-sm text-indigo-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
      >
        ← {site.name}
      </Link>

      <div className="mt-2 flex items-baseline gap-3">
        <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
          Spox
        </h1>
        <span className="text-sm text-slate-500">
          {orgLabel} · {site.name}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Manage your customer&apos;s points of contact — by role, internal owner,
        and replacement history.
      </p>

      <SpoxView
        siteId={site.id}
        spox={spox}
        teams={teams}
        staff={staff}
        canEdit={canEdit}
      />
    </div>
  );
}
