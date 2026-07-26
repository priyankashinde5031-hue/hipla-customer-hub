import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import {
  HardwareSection,
  type ActiveDevice,
  type ReplacementRow,
} from "../hardware-section";

export default async function SiteHardwarePage({
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

  // All non-deleted devices for this site, every replacement event, plus the
  // active hardware catalog + staff to populate the Add/Replace dropdowns.
  // Device "status" is derived (never stored): a device is active unless it's
  // the old side of a replacement; it's a replacement unit if it's the new side.
  const [deviceRes, replacementRes, hardwareOptionsRes, approverRes] = await Promise.all([
    supabase
      .from("devices")
      .select("id, esper_id, name_on_esper, hardware:hardware_catalog ( name )")
      .eq("site_id", id)
      .eq("is_deleted", false),
    supabase
      .from("device_replacements")
      .select(
        `id, old_device_id, new_device_id, replaced_at, notes,
         approver:internal_users!device_replacements_approved_by_fkey ( name )`,
      )
      .eq("site_id", id)
      .order("replaced_at", { ascending: false }),
    supabase.from("hardware_catalog").select("id, name").eq("active", true).order("name"),
    supabase.from("internal_users").select("id, name").eq("is_active", true).order("name"),
  ]);

  const deviceRows = deviceRes.data ?? [];
  const replacementRows = replacementRes.data ?? [];

  const replacedOldIds = new Set(replacementRows.map((r) => r.old_device_id));
  const replacementNewIds = new Set(replacementRows.map((r) => r.new_device_id));

  const hardwareName = (row: (typeof deviceRows)[number]) => {
    const hw = Array.isArray(row.hardware) ? row.hardware[0] : row.hardware;
    return hw?.name ?? "—";
  };
  const deviceById = new Map(deviceRows.map((d) => [d.id, d]));

  // Active = not deleted and not yet replaced (spec §2 derived status).
  const activeDevices: ActiveDevice[] = deviceRows
    .filter((d) => !replacedOldIds.has(d.id))
    .map((d) => ({
      id: d.id,
      hardwareName: hardwareName(d),
      esperId: d.esper_id,
      nameOnEsper: d.name_on_esper,
      isReplacementUnit: replacementNewIds.has(d.id),
    }));

  const replacements: ReplacementRow[] = replacementRows.map((r) => {
    const oldDevice = deviceById.get(r.old_device_id);
    const newDevice = deviceById.get(r.new_device_id);
    const approver = Array.isArray(r.approver) ? r.approver[0] : r.approver;
    return {
      id: r.id,
      oldHardwareName: oldDevice ? hardwareName(oldDevice) : "—",
      oldEsperId: oldDevice?.esper_id ?? "—",
      newEsperId: newDevice?.esper_id ?? "—",
      // replaced_at is a timestamptz; the table shows the calendar day only.
      replacedAt: typeof r.replaced_at === "string" ? r.replaced_at.slice(0, 10) : r.replaced_at,
      approverName: approver?.name ?? "—",
      notes: r.notes ?? null,
    };
  });

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
          Hardware &amp; Replacement
        </h1>
        <span className="text-sm text-slate-500">
          {orgLabel} · {site.name}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Devices installed at this site and their full replacement history. A
        replacement retires the old unit and records the new one — nothing is
        overwritten.
      </p>

      <HardwareSection
        siteId={site.id}
        canEdit={canEdit}
        activeDevices={activeDevices}
        replacements={replacements}
        hardwareOptions={hardwareOptionsRes.data ?? []}
        approverOptions={approverRes.data ?? []}
      />
    </div>
  );
}
