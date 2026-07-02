"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  usageCategory,
  usageCategoryTone,
  type UsageCategory,
  type StatusTone,
} from "@/lib/usage";
import { UsageChart, type ChartPoint } from "./usage-chart";
import { addUsageEntry, deleteUsageEntry, setUsageExpectation } from "../usage-actions";

export type DeployedModule = { moduleId: string; name: string };
export type UsageEntryRow = {
  id: string;
  moduleId: string;
  moduleName: string;
  entrySourceId: string;
  entrySourceName: string;
  year: number;
  month: number;
  week: number;
  entryCount: number;
  notes: string | null;
};
type EntrySource = { id: string; name: string };
type SourceModuleMap = { entry_source_id: string; module_id: string };

const inputClass =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const TONE_STYLES: Record<StatusTone, string> = {
  live: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
  neutral: "bg-slate-100 text-slate-600",
};

// A period as a single sortable ordinal: year → month(1–12) → week(1–5).
function ordinal(year: number, month: number, week: number): number {
  return (year * 12 + (month - 1)) * 5 + (week - 1);
}
function periodLabel(year: number, month: number, week: number): string {
  return `W${week} M${month}/${year}`;
}

function CategoryBadge({ category }: { category: UsageCategory }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-medium ${TONE_STYLES[usageCategoryTone(category)]}`}
    >
      {category}
    </span>
  );
}

export function UsageView({
  siteId,
  entries,
  expectations,
  deployedModules,
  entrySources,
  sourceModuleMap,
  canEdit,
}: {
  siteId: string;
  entries: UsageEntryRow[];
  expectations: Record<string, number>;
  deployedModules: DeployedModule[];
  entrySources: EntrySource[];
  sourceModuleMap: SourceModuleMap[];
  canEdit: boolean;
}) {
  const [moduleFilter, setModuleFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [range, setRange] = useState({
    fromWeek: "",
    fromMonth: "",
    fromYear: "",
    toWeek: "",
    toMonth: "",
    toYear: "",
  });

  // Filter entries by module, source and week-range.
  const filtered = useMemo(() => {
    const from =
      range.fromYear && range.fromMonth && range.fromWeek
        ? ordinal(+range.fromYear, +range.fromMonth, +range.fromWeek)
        : null;
    const to =
      range.toYear && range.toMonth && range.toWeek
        ? ordinal(+range.toYear, +range.toMonth, +range.toWeek)
        : null;
    return entries.filter((e) => {
      if (moduleFilter && e.moduleId !== moduleFilter) return false;
      if (sourceFilter && e.entrySourceId !== sourceFilter) return false;
      const o = ordinal(e.year, e.month, e.week);
      if (from !== null && o < from) return false;
      if (to !== null && o > to) return false;
      return true;
    });
  }, [entries, moduleFilter, sourceFilter, range]);

  const totalEntries = filtered.reduce((s, e) => s + e.entryCount, 0);

  // Expected-per-week for the current module scope (source filter doesn't change
  // the target — it's a per-module number). All modules → sum of the targets set
  // across this site's deployed modules; null if none set.
  const scopeExpected = useMemo<number | null>(() => {
    if (moduleFilter) {
      return moduleFilter in expectations ? expectations[moduleFilter] : null;
    }
    const set = deployedModules
      .map((m) => expectations[m.moduleId])
      .filter((v): v is number => typeof v === "number");
    return set.length ? set.reduce((a, b) => a + b, 0) : null;
  }, [moduleFilter, expectations, deployedModules]);

  // One chart point per period present in the filtered data, actual = summed
  // counts, expected = the constant scope target.
  const points: ChartPoint[] = useMemo(() => {
    const byPeriod = new Map<number, { label: string; actual: number }>();
    for (const e of filtered) {
      const o = ordinal(e.year, e.month, e.week);
      const cur = byPeriod.get(o) ?? {
        label: periodLabel(e.year, e.month, e.week),
        actual: 0,
      };
      cur.actual += e.entryCount;
      byPeriod.set(o, cur);
    }
    return Array.from(byPeriod.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({ label: v.label, actual: v.actual, expected: scopeExpected }));
  }, [filtered, scopeExpected]);

  // Overall category = the most recent week's actual vs the scope target.
  const overall = useMemo<UsageCategory>(() => {
    const last = points[points.length - 1];
    return usageCategory(last?.actual ?? 0, scopeExpected ?? 0);
  }, [points, scopeExpected]);

  // Sources selectable for a given module (via the catalog map); all active
  // sources when no module is chosen.
  const sourcesForModule = (moduleId: string) => {
    if (!moduleId) return entrySources;
    const allowed = new Set(
      sourceModuleMap.filter((m) => m.module_id === moduleId).map((m) => m.entry_source_id),
    );
    const scoped = entrySources.filter((s) => allowed.has(s.id));
    return scoped.length ? scoped : entrySources;
  };

  return (
    <div className="mt-6 space-y-6">
      {/* Overall category banner */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Overall usage category
          </p>
          <div className="mt-1">
            <CategoryBadge category={overall} />
          </div>
        </div>
        <div className="text-sm text-slate-600">
          Total entries:{" "}
          <span className="font-semibold text-gray-900">{totalEntries}</span>
        </div>
        {scopeExpected === null && (
          <div className="text-xs text-slate-400">
            No expected target set for this scope{canEdit ? " — set one below." : "."}
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-sm font-medium text-gray-900">Filter by week range</p>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <RangeRow
            label="From"
            week={range.fromWeek}
            month={range.fromMonth}
            year={range.fromYear}
            onChange={(k, v) => setRange((r) => ({ ...r, [`from${k}`]: v }))}
          />
          <RangeRow
            label="To"
            week={range.toWeek}
            month={range.toMonth}
            year={range.toYear}
            onChange={(k, v) => setRange((r) => ({ ...r, [`to${k}`]: v }))}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="module-filter">Filter by module</Label>
            <select
              id="module-filter"
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setSourceFilter("");
              }}
              className={inputClass}
            >
              <option value="">All modules</option>
              {deployedModules.map((m) => (
                <option key={m.moduleId} value={m.moduleId}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="source-filter">Filter by entry source</Label>
            <select
              id="source-filter"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className={inputClass}
            >
              <option value="">All sources</option>
              {sourcesForModule(moduleFilter).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <p className="text-lg font-serif font-semibold text-gray-900">
          Usage trend vs expected
        </p>
        <div className="mt-3">
          <UsageChart points={points} />
        </div>
      </div>

      {/* Expected targets editor */}
      {canEdit && (
        <ExpectationsEditor
          siteId={siteId}
          deployedModules={deployedModules}
          expectations={expectations}
        />
      )}

      {/* Add + list */}
      <AddAndList
        siteId={siteId}
        entries={entries}
        deployedModules={deployedModules}
        sourcesForModule={sourcesForModule}
        canEdit={canEdit}
      />
    </div>
  );
}

function RangeRow({
  label,
  week,
  month,
  year,
  onChange,
}: {
  label: string;
  week: string;
  month: string;
  year: string;
  onChange: (key: "Week" | "Month" | "Year", value: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1.5 grid grid-cols-3 gap-2">
        <Input
          type="number"
          min={1}
          max={5}
          placeholder="Week"
          value={week}
          onChange={(e) => onChange("Week", e.target.value)}
          className="h-8"
        />
        <Input
          type="number"
          min={1}
          max={12}
          placeholder="Month"
          value={month}
          onChange={(e) => onChange("Month", e.target.value)}
          className="h-8"
        />
        <Input
          type="number"
          placeholder="Year"
          value={year}
          onChange={(e) => onChange("Year", e.target.value)}
          className="h-8"
        />
      </div>
    </div>
  );
}

function ExpectationsEditor({
  siteId,
  deployedModules,
  expectations,
}: {
  siteId: string;
  deployedModules: DeployedModule[];
  expectations: Record<string, number>;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      deployedModules.map((m) => [
        m.moduleId,
        m.moduleId in expectations ? String(expectations[m.moduleId]) : "",
      ]),
    ),
  );
  const [pending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);

  if (deployedModules.length === 0) return null;

  const save = (moduleId: string) => {
    const raw = values[moduleId];
    const n = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Expected entries must be zero or more.");
      return;
    }
    setSavingId(moduleId);
    startTransition(async () => {
      const res = await setUsageExpectation(siteId, moduleId, n);
      setSavingId(null);
      if (res.error) toast.error(res.error);
      else toast.success("Expected usage saved.");
    });
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-gray-900">Expected entries per week</p>
      <p className="mt-1 text-xs text-slate-500">
        The weekly target this site is expected to hit per module. Drives the
        expected line and the usage category.
      </p>
      <div className="mt-3 space-y-2">
        {deployedModules.map((m) => (
          <div key={m.moduleId} className="flex items-center gap-3">
            <span className="w-48 shrink-0 text-sm text-slate-700">{m.name}</span>
            <Input
              type="number"
              min={0}
              placeholder="0"
              value={values[m.moduleId] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [m.moduleId]: e.target.value }))
              }
              className="h-8 w-28"
            />
            <span className="text-xs text-slate-400">/ week</span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => save(m.moduleId)}
              disabled={pending && savingId === m.moduleId}
            >
              {pending && savingId === m.moduleId ? "Saving…" : "Save"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AddAndList({
  siteId,
  entries,
  deployedModules,
  sourcesForModule,
  canEdit,
}: {
  siteId: string;
  entries: UsageEntryRow[];
  deployedModules: DeployedModule[];
  sourcesForModule: (moduleId: string) => EntrySource[];
  canEdit: boolean;
}) {
  const now = new Date();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    week: "1",
    entryCount: "0",
    moduleId: "",
    entrySourceId: "",
    notes: "",
  });
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedEntries = useMemo(
    () =>
      [...entries].sort(
        (a, b) =>
          ordinal(b.year, b.month, b.week) - ordinal(a.year, a.month, a.week),
      ),
    [entries],
  );

  const submit = () => {
    if (!form.moduleId) return toast.error("Choose a module.");
    if (!form.entrySourceId) return toast.error("Choose an entry source.");
    startTransition(async () => {
      const res = await addUsageEntry(siteId, {
        moduleId: form.moduleId,
        entrySourceId: form.entrySourceId,
        year: Number(form.year),
        month: Number(form.month),
        week: Number(form.week),
        entryCount: Number(form.entryCount),
        notes: form.notes || null,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Weekly entry added.");
      setShowForm(false);
      setForm((f) => ({ ...f, entryCount: "0", notes: "" }));
    });
  };

  const remove = (id: string) => {
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteUsageEntry(id, siteId);
      setDeletingId(null);
      if (res.error) toast.error(res.error);
      else toast.success("Entry deleted.");
    });
  };

  return (
    <div>
      {canEdit && !showForm && (
        <Button onClick={() => setShowForm(true)}>+ Add weekly entry</Button>
      )}

      {canEdit && showForm && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-medium text-gray-900">Add new weekly entry</p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Year">
              <Input
                type="number"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
                className="h-8"
              />
            </Field>
            <Field label="Month (1–12)">
              <Input
                type="number"
                min={1}
                max={12}
                value={form.month}
                onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
                className="h-8"
              />
            </Field>
            <Field label="Week number (1–5)">
              <select
                value={form.week}
                onChange={(e) => setForm((f) => ({ ...f, week: e.target.value }))}
                className={inputClass}
              >
                {[1, 2, 3, 4, 5].map((w) => (
                  <option key={w} value={w}>
                    Week {w}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Number of entries *">
              <Input
                type="number"
                min={0}
                value={form.entryCount}
                onChange={(e) => setForm((f) => ({ ...f, entryCount: e.target.value }))}
                className="h-8"
              />
            </Field>
            <Field label="Select module *">
              <select
                value={form.moduleId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, moduleId: e.target.value, entrySourceId: "" }))
                }
                className={inputClass}
              >
                <option value="">Choose module</option>
                {deployedModules.map((m) => (
                  <option key={m.moduleId} value={m.moduleId}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Select entry source *">
              <select
                value={form.entrySourceId}
                onChange={(e) =>
                  setForm((f) => ({ ...f, entrySourceId: e.target.value }))
                }
                className={inputClass}
              >
                <option value="">Choose source</option>
                {sourcesForModule(form.moduleId).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Notes (optional)" className="mt-4">
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Add any additional notes about this week's entries…"
              className="min-h-20 rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </Field>
          <div className="mt-4 flex gap-2">
            <Button onClick={submit} disabled={pending}>
              {pending ? "Adding…" : "Add entry"}
            </Button>
            <Button variant="outline" onClick={() => setShowForm(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <h2 className="mt-8 text-lg font-serif font-semibold text-gray-900">
        Weekly entries
      </h2>
      {sortedEntries.length === 0 ? (
        <p className="mt-2 text-sm text-slate-400">No weekly entries recorded yet.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {sortedEntries.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">
                    Week {e.week}, {e.month}/{e.year}
                  </span>
                  <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    {e.entryCount} entries
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {e.moduleName} · {e.entrySourceName}
                  {e.notes ? ` — ${e.notes}` : ""}
                </p>
              </div>
              {canEdit && (
                <button
                  onClick={() => remove(e.id)}
                  disabled={pending && deletingId === e.id}
                  aria-label="Delete entry"
                  className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}
