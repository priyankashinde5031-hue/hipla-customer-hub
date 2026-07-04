import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canEditCatalogs } from "@/lib/auth/current-user";
import { SupportView, type SupportTicketRow } from "./support-view";

export default async function SiteSupportPage({
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

  const { data: ticketsRaw } = await supabase
    .from("support_tickets")
    .select("id, ticket_ref, subject, opened_date, closed_date")
    .eq("site_id", id)
    .is("deleted_at", null)
    .order("opened_date", { ascending: false })
    .order("created_at", { ascending: false });

  const tickets: SupportTicketRow[] = (ticketsRaw || []).map((t) => ({
    id: t.id,
    ticketRef: t.ticket_ref,
    subject: t.subject,
    openedDate: t.opened_date,
    closedDate: t.closed_date,
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
          Support
        </h1>
        <span className="text-sm text-slate-500">
          {orgLabel} · {site.name}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Log support tickets raised for this site — what they were about, when they
        opened, and when they closed.
      </p>

      <SupportView siteId={site.id} tickets={tickets} canEdit={canEdit} />
    </div>
  );
}
