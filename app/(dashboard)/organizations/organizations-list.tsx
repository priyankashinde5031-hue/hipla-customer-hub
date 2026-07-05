"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Search, FileText, RefreshCw, ReceiptText, Hammer } from "lucide-react";
import { toast } from "sonner";
import { updateOrganizationStatus } from "./organization-actions";

export type OrgRow = {
  id: string;
  legalName: string;
  brandName: string | null;
  industry: string | null;
  status: string;
  totalPos: number;
  overdueRenewals: number;
  overdueInvoices: number;
  projectsInProgress: number;
};

type FilterKey = "noPos" | "overdueRenewals" | "overdueInvoices" | "underImplementation";

const FILTERS: { key: FilterKey; label: string; predicate: (o: OrgRow) => boolean }[] = [
  { key: "noPos", label: "No POs", predicate: (o) => o.totalPos === 0 },
  { key: "overdueRenewals", label: "Overdue renewal", predicate: (o) => o.overdueRenewals > 0 },
  { key: "overdueInvoices", label: "Invoice overdue", predicate: (o) => o.overdueInvoices > 0 },
  {
    key: "underImplementation",
    label: "Under implementation",
    predicate: (o) => o.projectsInProgress > 0,
  },
];

// One metric chip on the card. `tone` picks a neutral vs. warning colour so an
// overdue count reads as amber and everything else stays calm slate.
function Metric({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: typeof FileText;
  label: string;
  value: number;
  tone?: "neutral" | "warn";
}) {
  const active = tone === "warn" && value > 0;
  return (
    <div
      className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${
        active
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-slate-50 text-slate-600"
      }`}
      title={label}
    >
      <Icon className="size-3.5 shrink-0 opacity-70" />
      <span className="text-sm font-semibold tabular-nums">{value}</span>
      <span className="hidden text-xs text-slate-500 lg:inline">{label}</span>
    </div>
  );
}

function StatusControl({ org, canEdit }: { org: OrgRow; canEdit: boolean }) {
  const [status, setStatus] = useState(org.status);
  const [isPending, startTransition] = useTransition();

  // Only Live and Churn exist now (owner's ask). Anything else stored (legacy
  // "prospect") shows a neutral "Set status" placeholder rather than a badge —
  // it never renders the old label.
  const STYLES: Record<string, string> = {
    active: "border-green-200 bg-green-50 text-green-700",
    churned: "border-red-200 bg-red-50 text-red-700",
  };
  const isSet = status === "active" || status === "churned";

  if (!canEdit) {
    return (
      <span
        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
          STYLES[status] ?? "border-slate-200 bg-slate-100 text-slate-500"
        }`}
      >
        {status === "active" ? "Live" : status === "churned" ? "Churn" : "Set status"}
      </span>
    );
  }

  function change(next: "active" | "churned") {
    if (next === status) return;
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await updateOrganizationStatus(org.id, next);
      if (result.error) {
        setStatus(previous);
        toast.error(result.error);
        return;
      }
      toast.success(`${org.brandName || org.legalName} set to ${next === "active" ? "Live" : "Churn"}.`);
    });
  }

  return (
    <select
      value={isSet ? status : ""}
      onChange={(e) => change(e.target.value as "active" | "churned")}
      disabled={isPending}
      onClick={(e) => e.stopPropagation()}
      className={`cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 disabled:opacity-60 ${
        STYLES[status] ?? "border-slate-200 bg-slate-100 text-slate-500"
      }`}
    >
      {!isSet && (
        <option value="" disabled>
          Set status
        </option>
      )}
      <option value="active">Live</option>
      <option value="churned">Churn</option>
    </select>
  );
}

export function OrganizationsList({
  organizations,
  canEdit,
}: {
  organizations: OrgRow[];
  canEdit: boolean;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Set<FilterKey>>(new Set());

  const toggle = (key: FilterKey) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return organizations.filter((o) => {
      if (q) {
        const hay = `${o.brandName ?? ""} ${o.legalName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const f of FILTERS) {
        if (active.has(f.key) && !f.predicate(o)) return false;
      }
      return true;
    });
  }, [organizations, query, active]);

  return (
    <div className="mt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search organizations…"
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus-visible:border-indigo-400 focus-visible:ring-3 focus-visible:ring-indigo-500/20"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => {
            const on = active.has(f.key);
            return (
              <button
                key={f.key}
                onClick={() => toggle(f.key)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {filtered.map((org) => (
          <div
            key={org.id}
            className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 sm:w-64 sm:shrink-0">
              <Link
                href={`/organizations/${org.id}`}
                className="rounded font-medium text-gray-900 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
              >
                {org.brandName || org.legalName}
              </Link>
              <div className="truncate text-xs text-slate-400">
                {org.legalName}
                {org.industry ? ` · ${org.industry}` : ""}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Metric icon={FileText} label="POs" value={org.totalPos} />
              <Metric icon={RefreshCw} label="Overdue renewals" value={org.overdueRenewals} tone="warn" />
              <Metric icon={ReceiptText} label="Overdue invoices" value={org.overdueInvoices} tone="warn" />
              <Metric icon={Hammer} label="Implementing" value={org.projectsInProgress} />
            </div>

            <div className="flex justify-end sm:ml-auto">
              <StatusControl org={org} canEdit={canEdit} />
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="rounded-xl border border-gray-200 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm">
            {organizations.length === 0
              ? "No organizations yet."
              : "No organizations match your search and filters."}
          </p>
        )}
      </div>
    </div>
  );
}
