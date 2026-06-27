import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { getCatalogBySlug } from "@/lib/catalogs";
import { CatalogManager } from "./catalog-manager";

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const catalog = getCatalogBySlug(slug);
  if (!catalog) notFound();

  const supabase = await createClient();
  const user = await getCurrentInternalUser();
  const canEdit = canEditCatalogs(user);

  const { data: items, error } = await supabase
    .from(catalog.table)
    .select("*")
    .order(catalog.uniqueField);

  let moduleOptions: { id: string; name: string }[] = [];
  let mappingByEntrySource: Record<string, string[]> = {};

  if (catalog.hasModuleMapping) {
    const { data: modules } = await supabase
      .from("modules")
      .select("id, name")
      .eq("active", true)
      .order("name");
    moduleOptions = modules ?? [];

    const { data: mappings } = await supabase
      .from("entry_source_module_map")
      .select("entry_source_id, module_id");

    mappingByEntrySource = (mappings ?? []).reduce<Record<string, string[]>>((acc, row) => {
      acc[row.entry_source_id] = [...(acc[row.entry_source_id] ?? []), row.module_id];
      return acc;
    }, {});
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        {catalog.label}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{catalog.description}</p>

      {error && (
        <p className="mt-6 text-sm text-red-600">
          Could not load {catalog.label.toLowerCase()}: {error.message}
        </p>
      )}

      <div className="mt-6">
        <CatalogManager
          catalog={catalog}
          items={items ?? []}
          canEdit={canEdit}
          moduleOptions={moduleOptions}
          mappingByEntrySource={mappingByEntrySource}
        />
      </div>
    </div>
  );
}
