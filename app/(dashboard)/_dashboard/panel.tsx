import Link from "next/link";

// A dashboard action panel (spec §1 Rows 2–3): a titled box of dense rows with a
// "View all →" to the pre-filtered module page. NOT a fat card — tight vertical
// rhythm, table-like. Rows are capped by the caller (PANEL_ROW_CAP).
//
// When there is nothing to act on, callers pass `empty` so the panel collapses
// to a slim one-line strip instead of reserving a full-height blank card
// (spec §4: "Empty states are directive and collapse").
export function Panel({
  title,
  count,
  viewAllHref,
  empty,
  children,
}: {
  title: string;
  count?: number;
  viewAllHref: string;
  empty?: string | null;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {title}
          {typeof count === "number" && count > 0 ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium tabular-nums text-slate-600">
              {count}
            </span>
          ) : null}
        </h2>
        <Link
          href={viewAllHref}
          className="rounded text-xs font-medium text-indigo-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
        >
          View all →
        </Link>
      </div>
      {empty ? (
        <p className="px-4 py-3 text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="divide-y divide-slate-100">{children}</div>
      )}
    </section>
  );
}

// One dense row inside a Panel. `href` makes the whole row open the record; the
// caller supplies the primary inline action as `action` (kept out of the link).
export function PanelRow({
  href,
  children,
  action,
}: {
  href: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50">
      <Link
        href={href}
        className="flex min-w-0 flex-1 items-center gap-3 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
      >
        {children}
      </Link>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
