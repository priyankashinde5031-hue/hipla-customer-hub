import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { UsageView, type UsageEntryRow, type DeployedModule } from "./usage-view";

export default async function SiteUsagePage({
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

  // Deployed modules for this site = distinct modules across its POs (same
  // derivation as the Site 360 "Licenses" card). These are the only modules a
  // usage entry / expectation can sensibly be recorded against.
  const { data: poLinks } = await supabase
    .from("po_sites")
    .select(
      `purchase_order:purchase_orders (
         po_modules ( module_id, module:modules ( id, name ) )
       )`,
    )
    .eq("site_id", id);

  const deployedModules: DeployedModule[] = Array.from(
    new Map(
      (poLinks || [])
        .flatMap((link) => {
          const po = Array.isArray(link.purchase_order)
            ? link.purchase_order[0]
            : link.purchase_order;
          return po?.po_modules || [];
        })
        .map((pm) => {
          const mod = Array.isArray(pm.module) ? pm.module[0] : pm.module;
          return [pm.module_id, mod?.name ?? "—"] as const;
        }),
    ).entries(),
  )
    .map(([moduleId, name]) => ({ moduleId, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const [{ data: entriesRaw }, { data: expectationsRaw }, { data: sourcesRaw }, { data: mapRaw }] =
    await Promise.all([
      supabase
        .from("usage_entries")
        .select(
          `id, module_id, entry_source_id, year, month, week, entry_count, notes, source,
           module:modules ( name ),
           entry_source:entry_sources ( name )`,
        )
        .eq("site_id", id)
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .order("week", { ascending: true }),
      supabase
        .from("usage_expectations")
        .select("module_id, expected_per_week")
        .eq("site_id", id),
      supabase.from("entry_sources").select("id, name").eq("active", true).order("name"),
      supabase.from("entry_source_module_map").select("entry_source_id, module_id"),
    ]);

  const entries: UsageEntryRow[] = (entriesRaw || []).map((e) => {
    const mod = Array.isArray(e.module) ? e.module[0] : e.module;
    const src = Array.isArray(e.entry_source) ? e.entry_source[0] : e.entry_source;
    return {
      id: e.id,
      moduleId: e.module_id,
      moduleName: mod?.name ?? "—",
      entrySourceId: e.entry_source_id,
      entrySourceName: src?.name ?? "—",
      year: e.year,
      month: e.month,
      week: e.week,
      entryCount: e.entry_count,
      notes: e.notes,
    };
  });

  const expectations: Record<string, number> = {};
  for (const row of expectationsRaw || []) {
    expectations[row.module_id] = row.expected_per_week;
  }

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
          Customer Usage
        </h1>
        <span className="text-sm text-slate-500">
          {orgLabel} · {site.name}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Weekly entry counts per module and source, compared with the expected
        usage for this site. Manual entry for now — CSV import comes later.
      </p>

      <UsageView
        siteId={site.id}
        entries={entries}
        expectations={expectations}
        deployedModules={deployedModules}
        entrySources={sourcesRaw || []}
        sourceModuleMap={mapRaw || []}
        canEdit={canEdit}
      />
    </div>
  );
}
