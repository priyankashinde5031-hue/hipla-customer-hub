import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import {
  ImplementationView,
  type ProjectRow,
  type StageRow,
  type ModuleOption,
  type SpocOption,
  type PoOption,
} from "./implementation-view";

export default async function SiteImplementationPage({
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

  const [{ data: projectsRaw }, { data: modulesRaw }, { data: spoxRaw }, { data: poLinks }] =
    await Promise.all([
      supabase
        .from("implementation_projects")
        .select(
          `id, project_code, project_name, overall_status, po_id, created_at, updated_at,
           stages:implementation_project_stages (
             id, stage_number, stage_status, data, updated_at,
             updated_by_user:internal_users!implementation_project_stages_updated_by_fkey ( name )
           )`,
        )
        .eq("site_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("modules").select("id, name").eq("active", true).order("name"),
      supabase
        .from("spox")
        .select("id, name, designation")
        .eq("site_id", id)
        .eq("status", "active")
        .order("name"),
      // POs covering this site — offered when linking a project to its PO.
      supabase
        .from("po_sites")
        .select("purchase_order:purchase_orders ( id, po_number, name )")
        .eq("site_id", id),
    ]);

  const flatten = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : v;

  const pos: PoOption[] = (poLinks || [])
    .map((l) => flatten(l.purchase_order))
    .filter((po): po is NonNullable<typeof po> => Boolean(po))
    .map((po) => ({
      id: po.id,
      label: po.name ? `${po.po_number} · ${po.name}` : po.po_number,
    }));
  const poLabelById = new Map(pos.map((p) => [p.id, p.label]));

  const projects: ProjectRow[] = (projectsRaw || []).map((p) => {
    const stages: StageRow[] = (p.stages || [])
      .map((s) => ({
        stageNumber: s.stage_number,
        stageStatus: s.stage_status as StageRow["stageStatus"],
        data: (s.data ?? {}) as Record<string, unknown>,
        updatedAt: s.updated_at,
        updatedByName: flatten(s.updated_by_user)?.name ?? null,
      }))
      .sort((a, b) => a.stageNumber - b.stageNumber);

    // The most-recent stage edit drives the card's "last updated by".
    const lastTouched = [...stages]
      .filter((s) => s.updatedByName)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];

    return {
      id: p.id,
      projectCode: p.project_code,
      projectName: p.project_name,
      overallStatus: p.overall_status as ProjectRow["overallStatus"],
      poId: p.po_id,
      poLabel: p.po_id ? poLabelById.get(p.po_id) ?? null : null,
      updatedAt: p.updated_at,
      lastUpdatedByName: lastTouched?.updatedByName ?? null,
      stages,
    };
  });

  // Sign every attachment stored in any stage so its filename can render as a
  // clickable link (private bucket → short-lived signed URL, like PO cards).
  const storagePaths = new Set<string>();
  const collectPaths = (v: unknown) => {
    if (!v) return;
    if (Array.isArray(v)) {
      v.forEach(collectPaths);
      return;
    }
    if (typeof v === "object" && "storagePath" in (v as object)) {
      const p = (v as { storagePath?: unknown }).storagePath;
      if (typeof p === "string" && p) storagePaths.add(p);
    }
  };
  projects.forEach((p) => p.stages.forEach((s) => Object.values(s.data).forEach(collectPaths)));

  const signedUrls: Record<string, string> = {};
  await Promise.all(
    [...storagePaths].map(async (path) => {
      const { data: signed } = await supabase.storage
        .from("implementation-attachments")
        .createSignedUrl(path, 60 * 60);
      if (signed?.signedUrl) signedUrls[path] = signed.signedUrl;
    }),
  );

  const modules: ModuleOption[] = (modulesRaw || []).map((m) => ({
    id: m.id,
    name: m.name,
  }));
  const spocs: SpocOption[] = (spoxRaw || []).map((s) => ({
    id: s.id,
    name: s.name,
    designation: s.designation,
  }));

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
          Implementation
        </h1>
        <span className="text-sm text-slate-500">
          {orgLabel} · {site.name}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Onboard this site through the five stages — each saved and tracked
        independently, so Sales, Onboarding, and CS can work in parallel.
      </p>

      <ImplementationView
        siteId={site.id}
        projects={projects}
        modules={modules}
        spocs={spocs}
        pos={pos}
        canEdit={canEdit}
        signedUrls={signedUrls}
      />
    </div>
  );
}
