"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Pencil,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatRelativeTime } from "@/lib/date";
import {
  STAGES,
  getStage,
  missingRequiredFields,
  type FileValue,
  type HardwareRow,
  type StageField,
} from "./stage-config";
import {
  createProject,
  renameProject,
  updateProjectPo,
  saveStage,
  autosaveStageDraft,
  uploadImplementationAttachment,
} from "../implementation-actions";

// ---- Types shared with the server page ------------------------------------

export type StageStatus = "not_started" | "in_progress" | "complete";
export type OverallStatus = "not_started" | "in_progress" | "completed";

export type StageRow = {
  stageNumber: number;
  stageStatus: StageStatus;
  data: Record<string, unknown>;
  updatedAt: string | null;
  updatedByName: string | null;
};
export type ProjectRow = {
  id: string;
  projectCode: string;
  projectName: string;
  overallStatus: OverallStatus;
  poId: string | null;
  poLabel: string | null;
  updatedAt: string | null;
  lastUpdatedByName: string | null;
  stages: StageRow[];
};
export type ModuleOption = { id: string; name: string };
export type SpocOption = { id: string; name: string; designation: string | null };
export type PoOption = { id: string; label: string };

// ---- Presentation helpers -------------------------------------------------

const inputClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const OVERALL_META: Record<
  OverallStatus,
  { label: string; pill: string }
> = {
  not_started: { label: "Not started", pill: "bg-slate-100 text-slate-600" },
  in_progress: { label: "In progress", pill: "bg-amber-50 text-amber-700" },
  completed: { label: "Completed", pill: "bg-emerald-50 text-emerald-700" },
};

const SEGMENT_COLOR: Record<StageStatus, string> = {
  complete: "bg-emerald-500",
  in_progress: "bg-amber-400",
  not_started: "bg-slate-200",
};

// A stage counts as "stale" if it's been in progress and untouched for a while.
const STALE_DAYS = 7;
function isStale(s: StageRow): boolean {
  if (s.stageStatus !== "in_progress" || !s.updatedAt) return false;
  const days = (Date.now() - new Date(s.updatedAt).getTime()) / 86_400_000;
  return days > STALE_DAYS;
}

function OverallPill({ status }: { status: OverallStatus }) {
  const m = OVERALL_META[status];
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${m.pill}`}>
      {m.label}
    </span>
  );
}

// 5 segments, one per stage — shows WHICH stages are done, not "2/5".
function ProgressSegments({ stages }: { stages: StageRow[] }) {
  return (
    <div className="flex gap-1" aria-label="Stage progress">
      {STAGES.map((def) => {
        const st = stages.find((s) => s.stageNumber === def.number);
        const status = st?.stageStatus ?? "not_started";
        return (
          <span
            key={def.number}
            title={`Stage ${def.number}: ${def.title} — ${status.replace("_", " ")}`}
            className={`h-1.5 w-7 rounded-full ${SEGMENT_COLOR[status]}`}
          />
        );
      })}
    </div>
  );
}

function StepperIcon({ status }: { status: StageStatus }) {
  if (status === "complete")
    return <Check className="h-4 w-4 text-emerald-600" strokeWidth={3} />;
  if (status === "in_progress")
    return <CircleDot className="h-4 w-4 text-amber-500" />;
  return <Circle className="h-4 w-4 text-slate-300" />;
}

// ---- Top-level view -------------------------------------------------------

export function ImplementationView({
  siteId,
  projects,
  modules,
  spocs,
  pos,
  canEdit,
}: {
  siteId: string;
  projects: ProjectRow[];
  modules: ModuleOption[];
  spocs: SpocOption[];
  pos: PoOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPoId, setNewPoId] = useState("");
  const [pending, startTransition] = useTransition();

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await createProject(siteId, name, newPoId || null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success("Project created");
      setNewName("");
      setNewPoId("");
      setCreating(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-6">
      {canEdit && (
        <div className="mb-4">
          {creating ? (
            <div className="flex flex-wrap items-center gap-2">
              <Input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Project name (e.g. HQ rollout — Phase 1)"
                className="h-8 max-w-sm"
              />
              <select
                value={newPoId}
                onChange={(e) => setNewPoId(e.target.value)}
                className={`${inputClass} max-w-xs`}
                title="Link this project to its Purchase Order"
              >
                <option value="">Link a PO (optional)</option>
                {pos.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.label}
                  </option>
                ))}
              </select>
              <Button size="sm" onClick={handleCreate} disabled={pending || !newName.trim()}>
                Create
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="mr-1.5 h-4 w-4" /> New project
            </Button>
          )}
        </div>
      )}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-500">
            No implementation projects yet.
            {canEdit ? " Create one when a sales order lands for this site." : ""}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              siteId={siteId}
              project={p}
              modules={modules}
              spocs={spocs}
              pos={pos}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---- One project card -----------------------------------------------------

function ProjectCard({
  siteId,
  project,
  modules,
  spocs,
  pos,
  canEdit,
}: {
  siteId: string;
  project: ProjectRow;
  modules: ModuleOption[];
  spocs: SpocOption[];
  pos: PoOption[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(project.overallStatus === "in_progress");
  const [activeStage, setActiveStage] = useState(1);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(project.projectName);
  const [editingPo, setEditingPo] = useState(false);
  const [, startTransition] = useTransition();

  function commitPo(poId: string) {
    setEditingPo(false);
    if ((poId || null) === project.poId) return;
    startTransition(async () => {
      const res = await updateProjectPo(project.id, siteId, poId || null);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  }

  function commitRename() {
    const name = nameDraft.trim();
    setEditingName(false);
    if (!name || name === project.projectName) {
      setNameDraft(project.projectName);
      return;
    }
    startTransition(async () => {
      const res = await renameProject(project.id, siteId, name);
      if (res.error) {
        toast.error(res.error);
        setNameDraft(project.projectName);
        return;
      }
      router.refresh();
    });
  }

  const activeStageRow =
    project.stages.find((s) => s.stageNumber === activeStage) ?? project.stages[0];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Collapsed header (always visible) */}
      <div className="flex items-start gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 rounded text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? (
            <ChevronDown className="h-5 w-5" />
          ) : (
            <ChevronRight className="h-5 w-5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {editingName && canEdit ? (
              <input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") {
                    setNameDraft(project.projectName);
                    setEditingName(false);
                  }
                }}
                className={`${inputClass} max-w-xs`}
              />
            ) : (
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-gray-900">
                  {project.projectName}
                </h3>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setNameDraft(project.projectName);
                      setEditingName(true);
                    }}
                    className="rounded text-slate-300 hover:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                    aria-label="Rename project"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
            <span className="font-mono text-xs text-slate-400">{project.projectCode}</span>
            <OverallPill status={project.overallStatus} />
          </div>

          {/* Linked PO — anchors this project's renewals (spec §5.4). */}
          <div className="mt-1.5 flex items-center gap-1.5 text-xs">
            {editingPo && canEdit ? (
              <select
                autoFocus
                defaultValue={project.poId ?? ""}
                onChange={(e) => commitPo(e.target.value)}
                onBlur={() => setEditingPo(false)}
                className={`${inputClass} max-w-xs`}
              >
                <option value="">No PO linked</option>
                {pos.map((po) => (
                  <option key={po.id} value={po.id}>
                    {po.label}
                  </option>
                ))}
              </select>
            ) : (
              <>
                <span className="text-slate-400">PO:</span>
                <span className={project.poLabel ? "text-slate-600" : "text-slate-400"}>
                  {project.poLabel ?? "Not linked"}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => setEditingPo(true)}
                    className="rounded text-slate-300 hover:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50"
                    aria-label="Change linked PO"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </>
            )}
          </div>

          <div className="mt-2.5">
            <ProgressSegments stages={project.stages} />
          </div>

          <p className="mt-2 text-xs text-slate-400">
            Last updated {formatRelativeTime(project.updatedAt)}
            {project.lastUpdatedByName ? ` by ${project.lastUpdatedByName}` : ""}
          </p>
        </div>
      </div>

      {/* Expanded: stepper + stage panel */}
      {expanded && (
        <div className="border-t border-gray-100">
          <div className="flex flex-wrap gap-1.5 p-3">
            {STAGES.map((def) => {
              const st = project.stages.find((s) => s.stageNumber === def.number);
              const status = st?.stageStatus ?? "not_started";
              const active = def.number === activeStage;
              return (
                <button
                  key={def.number}
                  type="button"
                  onClick={() => setActiveStage(def.number)}
                  className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                      : "border-gray-200 bg-white text-slate-600 hover:border-gray-300"
                  }`}
                >
                  <StepperIcon status={status} />
                  <span>
                    {def.number}. {def.title}
                  </span>
                  {st && isStale(st) && (
                    <span
                      title="No updates in over a week"
                      className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-400"
                    />
                  )}
                </button>
              );
            })}
          </div>

          {activeStageRow && (
            <StagePanel
              key={`${project.id}-${activeStage}`}
              siteId={siteId}
              projectId={project.id}
              overallStatus={project.overallStatus}
              stage={activeStageRow}
              modules={modules}
              spocs={spocs}
              canEdit={canEdit}
              onGoNext={
                activeStage < 5 ? () => setActiveStage(activeStage + 1) : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---- One stage's form panel ----------------------------------------------

function StagePanel({
  siteId,
  projectId,
  overallStatus,
  stage,
  modules,
  spocs,
  canEdit,
  onGoNext,
}: {
  siteId: string;
  projectId: string;
  overallStatus: OverallStatus;
  stage: StageRow;
  modules: ModuleOption[];
  spocs: SpocOption[];
  canEdit: boolean;
  onGoNext?: () => void;
}) {
  const router = useRouter();
  const def = getStage(stage.stageNumber)!;
  const [draft, setDraft] = useState<Record<string, unknown>>(stage.data);
  const [savedAt, setSavedAt] = useState<string | null>(stage.updatedAt);
  const [attempted, setAttempted] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const missing = missingRequiredFields(stage.stageNumber, draft);
  const missingKeys = new Set(missing.map((m) => m.key));

  // Debounced autosave on blur — draft only, never validates/completes.
  const scheduleAutosave = useCallback(() => {
    if (!canEdit) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      autosaveStageDraft(projectId, siteId, stage.stageNumber, draftRef.current).then(
        (res) => {
          if (!res.error) setSavedAt(new Date().toISOString());
        },
      );
    }, 800);
  }, [canEdit, projectId, siteId, stage.stageNumber]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function setField(key: string, value: unknown) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function handleSave() {
    setAttempted(true);
    startTransition(async () => {
      const res = await saveStage(projectId, siteId, stage.stageNumber, draftRef.current);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setSavedAt(new Date().toISOString());
      if (res.missing && res.missing.length > 0) {
        toast.message("Saved as in progress", {
          description: `Still needed: ${res.missing.map((m) => m.label).join(", ")}`,
        });
      } else {
        toast.success("Stage complete");
      }
      router.refresh();
    });
  }

  return (
    <div className="border-t border-gray-100 p-4">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900">
          Stage {def.number}: {def.title}
        </h4>
        <p className="mt-0.5 text-xs text-slate-500">{def.description}</p>
        {savedAt && (
          <p className="mt-1 text-xs text-slate-400">
            Draft saved {formatRelativeTime(savedAt)}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {def.fields.map((field) => (
          <FieldRenderer
            key={field.key}
            field={field}
            value={draft[field.key]}
            projectId={projectId}
            modules={modules}
            spocs={spocs}
            canEdit={canEdit}
            missing={attempted && missingKeys.has(field.key)}
            onChange={(v) => setField(field.key, v)}
            onBlur={scheduleAutosave}
          />
        ))}
      </div>

      {/* Stage 5 informational banner (no manual "complete" button). */}
      {stage.stageNumber === 5 && overallStatus === "completed" && (
        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          All stages complete — this project is now marked Completed.
        </div>
      )}

      {/* Inline missing-field summary after an attempted save (not blocking). */}
      {attempted && missing.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Saved, but this stage isn&apos;t complete yet. Still needed:{" "}
          {missing.map((m) => m.label).join(", ")}.
        </div>
      )}

      {canEdit && (
        <div className="sticky bottom-0 mt-4 flex items-center gap-3 border-t border-gray-100 bg-white pt-3">
          <Button size="sm" onClick={handleSave} disabled={pending}>
            Save stage
          </Button>
          {onGoNext && (
            <button
              type="button"
              onClick={() => {
                handleSave();
                onGoNext();
              }}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Save &amp; go to next stage →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Field renderers ------------------------------------------------------

function FieldRenderer({
  field,
  value,
  projectId,
  modules,
  spocs,
  canEdit,
  missing,
  onChange,
  onBlur,
}: {
  field: StageField;
  value: unknown;
  projectId: string;
  modules: ModuleOption[];
  spocs: SpocOption[];
  canEdit: boolean;
  missing: boolean;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}) {
  const label = (
    <label className="mb-1 block text-xs font-medium text-slate-600">
      {field.label}
      {field.help && <span className="ml-1 font-normal text-slate-400">· {field.help}</span>}
    </label>
  );

  // Hardware spans both columns.
  const wide = field.type === "hardware" || field.type === "textarea";

  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      {label}
      <FieldInput
        field={field}
        value={value}
        projectId={projectId}
        modules={modules}
        spocs={spocs}
        canEdit={canEdit}
        onChange={onChange}
        onBlur={onBlur}
      />
      {missing && (
        <p className="mt-1 text-xs text-amber-600">Required to complete this stage.</p>
      )}
    </div>
  );
}

function FieldInput({
  field,
  value,
  projectId,
  modules,
  spocs,
  canEdit,
  onChange,
  onBlur,
}: {
  field: StageField;
  value: unknown;
  projectId: string;
  modules: ModuleOption[];
  spocs: SpocOption[];
  canEdit: boolean;
  onChange: (v: unknown) => void;
  onBlur: () => void;
}) {
  const disabled = !canEdit;

  switch (field.type) {
    case "text":
    case "number":
    case "date":
      return (
        <input
          type={field.type === "text" ? "text" : field.type}
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          className={inputClass}
        />
      );

    case "textarea":
      return (
        <textarea
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          rows={2}
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      );

    case "yesno":
      return (
        <div className="flex gap-1.5">
          {["yes", "no"].map((opt) => {
            const active = value === opt;
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                onClick={() => {
                  onChange(active ? "" : opt);
                  onBlur();
                }}
                className={`h-8 flex-1 rounded-lg border text-sm capitalize transition-colors ${
                  active
                    ? opt === "yes"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-slate-300 bg-slate-100 text-slate-700"
                    : "border-gray-200 bg-white text-slate-500 hover:border-gray-300"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      );

    case "toggle":
      return (
        <div className="flex h-8 items-center gap-2">
          <Switch
            checked={value === true}
            disabled={disabled}
            onCheckedChange={(v) => {
              onChange(v);
              onBlur();
            }}
          />
          <span className="text-xs text-slate-500">{value === true ? "Yes" : "No"}</span>
        </div>
      );

    case "select":
      return (
        <select
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            onBlur();
          }}
          className={inputClass}
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );

    case "spoc":
      return (
        <select
          value={(value as string) ?? ""}
          disabled={disabled}
          onChange={(e) => {
            onChange(e.target.value);
            onBlur();
          }}
          className={inputClass}
        >
          <option value="">—</option>
          {spocs.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.designation ? ` · ${s.designation}` : ""}
            </option>
          ))}
        </select>
      );

    case "modules": {
      const selected = new Set((value as string[]) ?? []);
      if (modules.length === 0)
        return <p className="text-xs text-slate-400">No modules in the catalog yet.</p>;
      return (
        <div className="flex flex-wrap gap-1.5">
          {modules.map((m) => {
            const on = selected.has(m.id);
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  const next = new Set(selected);
                  if (on) next.delete(m.id);
                  else next.add(m.id);
                  onChange([...next]);
                  onBlur();
                }}
                className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                    : "border-gray-200 bg-white text-slate-500 hover:border-gray-300"
                }`}
              >
                {m.name}
              </button>
            );
          })}
        </div>
      );
    }

    case "file":
      return (
        <FileField
          projectId={projectId}
          value={value as FileValue}
          canEdit={canEdit}
          onChange={(v) => {
            onChange(v);
            onBlur();
          }}
        />
      );

    case "multifile": {
      const files = ((value as FileValue[]) ?? []).filter(Boolean) as NonNullable<FileValue>[];
      return (
        <div className="space-y-1.5">
          {files.map((f, i) => (
            <div
              key={f.attachmentId}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-2.5 py-1 text-xs"
            >
              <span className="truncate text-slate-600">{f.filename}</span>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => {
                    const next = files.filter((_, j) => j !== i);
                    onChange(next);
                    onBlur();
                  }}
                  className="text-slate-400 hover:text-red-600"
                  aria-label="Remove file"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <FileField
              projectId={projectId}
              value={null}
              canEdit={canEdit}
              addMode
              onChange={(v) => {
                if (v) {
                  onChange([...files, v]);
                  onBlur();
                }
              }}
            />
          )}
        </div>
      );
    }

    case "hardware":
      return (
        <HardwareField
          value={(value as HardwareRow[]) ?? []}
          canEdit={canEdit}
          onChange={onChange}
          onBlur={onBlur}
        />
      );

    default:
      return null;
  }
}

function FileField({
  projectId,
  value,
  canEdit,
  addMode,
  onChange,
}: {
  projectId: string;
  value: FileValue;
  canEdit: boolean;
  addMode?: boolean;
  onChange: (v: FileValue) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("file", file);
    const res = await uploadImplementationAttachment(fd);
    setUploading(false);
    if (res.error || !res.attachmentId) {
      toast.error(res.error ?? "Upload failed");
      return;
    }
    onChange({
      attachmentId: res.attachmentId,
      filename: res.filename!,
      storagePath: res.storagePath!,
    });
    toast.success("File uploaded");
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {value && !addMode ? (
        <div className="flex min-w-0 flex-1 items-center justify-between rounded-lg border border-gray-200 px-2.5 py-1 text-xs">
          <span className="truncate text-slate-600">{value.filename}</span>
          {canEdit && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="ml-2 text-slate-400 hover:text-red-600"
              aria-label="Remove file"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        canEdit && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            {uploading ? "Uploading…" : addMode ? "Add file" : "Upload"}
          </Button>
        )
      )}
    </div>
  );
}

function HardwareField({
  value,
  canEdit,
  onChange,
  onBlur,
}: {
  value: HardwareRow[];
  canEdit: boolean;
  onChange: (v: HardwareRow[]) => void;
  onBlur: () => void;
}) {
  const rows = value ?? [];

  function update(i: number, patch: Partial<HardwareRow>) {
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-1.5 text-left font-medium">Item</th>
                <th className="w-16 px-2 py-1.5 text-left font-medium">Qty</th>
                <th className="px-2 py-1.5 text-left font-medium">Serial / Esper ID / note</th>
                {canEdit && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-gray-100">
                  <td className="px-2 py-1">
                    <input
                      value={r.item ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => update(i, { item: e.target.value })}
                      onBlur={onBlur}
                      className="h-7 w-full rounded border-none bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring/50"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={String(r.qty ?? "")}
                      disabled={!canEdit}
                      onChange={(e) => update(i, { qty: e.target.value })}
                      onBlur={onBlur}
                      className="h-7 w-full rounded border-none bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring/50"
                    />
                  </td>
                  <td className="px-2 py-1">
                    <input
                      value={r.note ?? ""}
                      disabled={!canEdit}
                      onChange={(e) => update(i, { note: e.target.value })}
                      onBlur={onBlur}
                      className="h-7 w-full rounded border-none bg-transparent px-1 text-xs outline-none focus:ring-1 focus:ring-ring/50"
                    />
                  </td>
                  {canEdit && (
                    <td className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          onChange(rows.filter((_, j) => j !== i));
                          onBlur();
                        }}
                        className="text-slate-400 hover:text-red-600"
                        aria-label="Remove row"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {canEdit && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...rows, { item: "", qty: "", note: "" }])}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" /> Add hardware row
        </Button>
      )}
    </div>
  );
}
