import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import {
  AgreementsView,
  type AgreementRow,
  type AgreementTypeOption,
  type UserOption,
} from "./agreements-view";

// Supabase joins arrive as an object or a one-element array depending on the
// relationship; collapse to a single row (same helper used across the 360).
function flatten<T>(v: T | T[] | null): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export default async function SiteAgreementsPage({
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
  const organization = flatten(site.organization);

  const [{ data: agreementsRaw }, { data: agreementTypesRaw }, { data: usersRaw }] =
    await Promise.all([
      supabase
        .from("agreements")
        .select(
          `id, signed_date,
           agreement_type:agreement_types ( name ),
           signed_by:internal_users!agreements_signed_by_id_fkey ( name ),
           attachment:attachments!attachment_id ( storage_path, original_filename )`,
        )
        .eq("site_id", id)
        .is("deleted_at", null)
        .order("signed_date", { ascending: false })
        .order("created_at", { ascending: false }),
      // Only active types are offered in the picker (CLAUDE.md: only active
      // catalog items are selectable).
      supabase.from("agreement_types").select("id, name").eq("active", true).order("name"),
      supabase.from("internal_users").select("id, name").eq("is_active", true).order("name"),
    ]);

  // Sign private-bucket files so the table can link straight to them.
  const agreements: AgreementRow[] = await Promise.all(
    (agreementsRaw || []).map(async (a) => {
      const att = flatten(a.attachment);
      let attachment: AgreementRow["attachment"] = null;
      if (att?.storage_path) {
        const { data: signed } = await supabase.storage
          .from("agreement-attachments")
          .createSignedUrl(att.storage_path, 60 * 60);
        attachment = {
          filename: att.original_filename,
          url: signed?.signedUrl ?? null,
        };
      }
      return {
        id: a.id,
        signedDate: a.signed_date,
        typeName: flatten(a.agreement_type)?.name ?? null,
        signedByName: flatten(a.signed_by)?.name ?? null,
        attachment,
      };
    }),
  );

  const agreementTypes: AgreementTypeOption[] = (agreementTypesRaw || []).map((t) => ({
    id: t.id,
    name: t.name,
  }));
  const users: UserOption[] = (usersRaw || []).map((u) => ({ id: u.id, name: u.name }));

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
          Agreements
        </h1>
        <span className="text-sm text-slate-500">
          {orgLabel} · {site.name}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Store the signed agreements held for this site — NDAs, service agreements,
        PO agreements, and addenda.
      </p>

      <AgreementsView
        siteId={site.id}
        agreements={agreements}
        canEdit={canEdit}
        agreementTypes={agreementTypes}
        users={users}
      />
    </div>
  );
}
