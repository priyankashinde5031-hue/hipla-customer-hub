"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { getCatalogBySlug } from "@/lib/catalogs";

type ActionResult = { error?: string };

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: "create" | "update" | "soft_delete",
  entityType: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    before,
    after,
  });
}

function buildValuesFromFormData(
  formData: FormData,
  fields: { key: string; type: string; required: boolean }[],
): { values: Record<string, unknown>; error?: string } {
  const values: Record<string, unknown> = {};

  for (const field of fields) {
    const raw = formData.get(field.key);
    const text = typeof raw === "string" ? raw.trim() : "";

    if (field.required && !text) {
      return { values, error: `${field.key} is required.` };
    }

    if (field.type === "number") {
      if (!text) {
        values[field.key] = null;
        continue;
      }
      const num = Number(text);
      if (!Number.isFinite(num) || num <= 0) {
        return { values, error: `${field.key} must be a positive number.` };
      }
      values[field.key] = num;
    } else {
      values[field.key] = text || null;
    }
  }

  return { values };
}

export async function createCatalogItem(
  slug: string,
  formData: FormData,
): Promise<ActionResult> {
  const catalog = getCatalogBySlug(slug);
  if (!catalog) return { error: "Unknown catalog." };

  const user = await getCurrentInternalUser();
  if (!canEditCatalogs(user)) return { error: "You don't have permission to edit this catalog." };

  const { values, error } = buildValuesFromFormData(formData, catalog.fields);
  if (error) return { error };

  const supabase = await createClient();

  const uniqueValue = values[catalog.uniqueField] as string;
  const { data: existing } = await supabase
    .from(catalog.table)
    .select("id")
    .ilike(catalog.uniqueField, uniqueValue)
    .maybeSingle();

  if (existing) {
    return { error: `A ${catalog.singular.toLowerCase()} with this ${catalog.uniqueField} already exists.` };
  }

  const { data: inserted, error: insertError } = await supabase
    .from(catalog.table)
    .insert(values)
    .select("id")
    .single();

  if (insertError || !inserted) {
    return { error: insertError?.message ?? "Could not create the item." };
  }

  if (catalog.hasModuleMapping) {
    const moduleIds = formData.getAll("module_ids").filter((v): v is string => typeof v === "string" && v.length > 0);
    if (moduleIds.length > 0) {
      await supabase
        .from("entry_source_module_map")
        .insert(moduleIds.map((moduleId) => ({ entry_source_id: inserted.id, module_id: moduleId })));
    }
  }

  await writeAudit(supabase, user!.id, "create", catalog.table, inserted.id, null, values);

  revalidatePath(`/settings/catalogs/${slug}`);
  return {};
}

export async function updateCatalogItem(
  slug: string,
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const catalog = getCatalogBySlug(slug);
  if (!catalog) return { error: "Unknown catalog." };

  const user = await getCurrentInternalUser();
  if (!canEditCatalogs(user)) return { error: "You don't have permission to edit this catalog." };

  const { values, error } = buildValuesFromFormData(formData, catalog.fields);
  if (error) return { error };

  const supabase = await createClient();

  const { data: before } = await supabase.from(catalog.table).select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "Item not found." };

  const uniqueValue = values[catalog.uniqueField] as string;
  const { data: existing } = await supabase
    .from(catalog.table)
    .select("id")
    .ilike(catalog.uniqueField, uniqueValue)
    .neq("id", id)
    .maybeSingle();

  if (existing) {
    return { error: `A ${catalog.singular.toLowerCase()} with this ${catalog.uniqueField} already exists.` };
  }

  const { error: updateError } = await supabase.from(catalog.table).update(values).eq("id", id);
  if (updateError) return { error: updateError.message };

  if (catalog.hasModuleMapping) {
    const moduleIds = formData.getAll("module_ids").filter((v): v is string => typeof v === "string" && v.length > 0);
    await supabase.from("entry_source_module_map").delete().eq("entry_source_id", id);
    if (moduleIds.length > 0) {
      await supabase
        .from("entry_source_module_map")
        .insert(moduleIds.map((moduleId) => ({ entry_source_id: id, module_id: moduleId })));
    }
  }

  await writeAudit(supabase, user!.id, "update", catalog.table, id, before, values);

  revalidatePath(`/settings/catalogs/${slug}`);
  return {};
}

export async function setCatalogItemActive(
  slug: string,
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const catalog = getCatalogBySlug(slug);
  if (!catalog) return { error: "Unknown catalog." };

  const user = await getCurrentInternalUser();
  if (!canEditCatalogs(user)) return { error: "You don't have permission to edit this catalog." };

  const supabase = await createClient();

  const { data: before } = await supabase.from(catalog.table).select("*").eq("id", id).maybeSingle();
  if (!before) return { error: "Item not found." };

  const { error: updateError } = await supabase.from(catalog.table).update({ active }).eq("id", id);
  if (updateError) return { error: updateError.message };

  await writeAudit(
    supabase,
    user!.id,
    "soft_delete",
    catalog.table,
    id,
    before,
    { ...before, active },
  );

  revalidatePath(`/settings/catalogs/${slug}`);
  return {};
}
