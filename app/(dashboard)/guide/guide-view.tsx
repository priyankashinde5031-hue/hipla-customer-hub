"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Building2,
  ChevronDown,
  Compass,
  Cpu,
  FileSignature,
  FileText,
  GitBranch,
  Info,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  Loader2,
  MapPin,
  ReceiptText,
  RefreshCw,
  Rocket,
  Search,
  Send,
  ScrollText,
  Settings,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  JOURNEY,
  ORIENTATION,
  SECTIONS,
  proceduresFor,
  sectionById,
  type GuideSection,
} from "@/lib/guide-content";

const ICONS: Record<string, LucideIcon> = {
  Activity,
  Building2,
  Compass,
  Cpu,
  FileSignature,
  FileText,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  ReceiptText,
  RefreshCw,
  Rocket,
  Settings,
  TrendingUp,
  Users,
};

function Icon({ name, className }: { name: string; className?: string }) {
  const Cmp = ICONS[name] ?? Info;
  return <Cmp className={className} />;
}

// ---- Smart search -----------------------------------------------------------
// Ranked, synonym- and typo-tolerant. Not a toy substring jump: it scores every
// section across all its text + keywords and returns the best matches.

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 1) return 2; // we only care about distance <= 1
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] =
        a[i - 1] === b[j - 1]
          ? prev
          : 1 + Math.min(prev, dp[i], dp[i - 1]);
      prev = tmp;
    }
  }
  return dp[m];
}

function fuzzyIncludes(haystackWords: string[], token: string): boolean {
  if (token.length < 4) return haystackWords.some((w) => w.startsWith(token));
  return haystackWords.some(
    (w) => w.includes(token) || (w.length >= 4 && levenshtein(w, token) <= 1),
  );
}

type Scored = { section: GuideSection; score: number };

function searchSections(query: string): Scored[] {
  const q = query.trim().toLowerCase();
  if (!q) return SECTIONS.map((section) => ({ section, score: 0 }));
  const tokens = q.split(/\s+/).filter(Boolean);

  return SECTIONS.map((section) => {
    const title = section.title.toLowerCase();
    const titleWords = title.split(/\W+/).filter(Boolean);
    const body = [section.what, section.when, section.linkedTo, section.ifYouSkip]
      .join(" ")
      .toLowerCase();
    const bodyWords = body.split(/\W+/).filter(Boolean);
    const keywordText = (section.keywords ?? []).join(" ").toLowerCase();
    const keywordWords = keywordText.split(/\W+/).filter(Boolean);

    let score = 0;
    for (const t of tokens) {
      if (title.includes(t)) score += 12;
      else if (fuzzyIncludes(titleWords, t)) score += 8;
      if (keywordText.includes(t)) score += 7;
      else if (fuzzyIncludes(keywordWords, t)) score += 5;
      if (body.includes(t)) score += 3;
      else if (fuzzyIncludes(bodyWords, t)) score += 1;
    }
    return { section, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);
}

// A short snippet showing why a section matched.
function matchSnippet(section: GuideSection, query: string): string {
  const q = query.trim().toLowerCase();
  const fields = [section.what, section.linkedTo, section.when, section.ifYouSkip];
  const hit = fields.find((f) => f.toLowerCase().includes(q));
  return hit ?? section.what;
}

const JOURNEY_STYLE =
  "inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700";

export function GuideView() {
  const [tab, setTab] = useState<"browse" | "manual" | "ask">("browse");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState<string>(SECTIONS[0].id);

  const results = useMemo(() => searchSections(query), [query]);
  const searching = query.trim().length > 0;

  // When searching, keep the active card on a matching section.
  const visibleSections = searching
    ? results.map((r) => r.section)
    : SECTIONS;
  const active =
    visibleSections.find((s) => s.id === activeId) ?? visibleSections[0];

  function select(id: string) {
    setActiveId(id);
    document
      .getElementById("guide-card")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="max-w-5xl">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
          Help &amp; guide
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          What each part of the Hub does, what it&apos;s linked to, and what
          happens if a step is skipped. Search, browse, or ask a question.
        </p>
      </header>

      <div className="mt-5 flex gap-1 border-b border-slate-200">
        <TabButton
          active={tab === "browse"}
          onClick={() => setTab("browse")}
          icon={<BookOpen className="h-4 w-4" />}
          label="Browse guide"
        />
        <TabButton
          active={tab === "manual"}
          onClick={() => setTab("manual")}
          icon={<ScrollText className="h-4 w-4" />}
          label="Full manual"
        />
        <TabButton
          active={tab === "ask"}
          onClick={() => setTab("ask")}
          icon={<Sparkles className="h-4 w-4" />}
          label="Ask a question"
        />
      </div>

      {tab === "manual" && (
        <div className="mt-6">
          <ManualView />
        </div>
      )}

      {tab === "ask" && (
        <div className="mt-6">
          <AskAssistant />
        </div>
      )}

      {tab === "browse" && (
        <div>
      {/* Customer journey — the spine */}
      <section className="mt-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          The customer journey
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {JOURNEY.map((stage, i) => {
            const first = SECTIONS.find((s) => s.journey === stage.id);
            return (
              <div key={stage.id} className="flex items-center gap-2">
                <button
                  type="button"
                  title={stage.blurb}
                  onClick={() => first && select(first.id)}
                  className={`${JOURNEY_STYLE} transition hover:bg-indigo-100`}
                >
                  {stage.label}
                </button>
                {i < JOURNEY.length - 1 && (
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Orientation */}
      <section className="mt-6 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-2 flex items-center gap-2">
          <Compass className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-semibold text-gray-900">
            {ORIENTATION.title}
          </h2>
        </div>
        <ul className="space-y-2">
          {ORIENTATION.points.map((p, i) => (
            <li key={i} className="text-sm leading-relaxed text-slate-600">
              <Bolded text={p} />
            </li>
          ))}
        </ul>
      </section>

      {/* Search */}
      <section className="mt-8">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the guide — e.g. renewal, go-live, invoice, AMC"
            aria-label="Search the guide"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
          />
        </div>
        {searching && (
          <p className="mt-2 text-xs text-slate-500">
            {results.length === 0
              ? "No section matches — try the “Ask a question” box above for a written answer."
              : `${results.length} matching section${results.length > 1 ? "s" : ""}.`}
          </p>
        )}
      </section>

      {/* Two-column: nav + active card */}
      <div className="mt-4 grid gap-4 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <nav className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2">
          {visibleSections.length === 0 && (
            <p className="px-2 py-3 text-xs text-slate-400">No matches.</p>
          )}
          {visibleSections.map((s) => {
            const isActive = active?.id === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => select(s.id)}
                className={`flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition ${
                  isActive
                    ? "bg-indigo-50 font-medium text-indigo-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Icon name={s.icon} className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="truncate">{s.title}</span>
                {s.status === "coming-soon" && (
                  <span className="ml-auto rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {active && (
          <SectionCard
            key={active.id}
            section={active}
            query={searching ? query : ""}
            onSelect={select}
          />
        )}
      </div>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition ${
        active
          ? "border-indigo-600 text-indigo-700"
          : "border-transparent text-slate-500 hover:text-gray-900"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ---- Full manual (long-form doc) -------------------------------------------

function ManualView() {
  const [open, setOpen] = useState<Set<string>>(() => new Set([SECTIONS[0].id]));

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openAndScroll = (id: string) => {
    setOpen((prev) => new Set(prev).add(id));
    requestAnimationFrame(() =>
      document
        .getElementById(`doc-${id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const stages = JOURNEY.map((j) => ({
    stage: j,
    items: SECTIONS.filter((s) => s.journey === j.id),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
      <nav className="md:sticky md:top-4 md:self-start">
        <div className="mb-3 flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setOpen(new Set(SECTIONS.map((s) => s.id)))}
            className="font-medium text-indigo-600 hover:underline"
          >
            Expand all
          </button>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            onClick={() => setOpen(new Set())}
            className="text-slate-500 hover:underline"
          >
            Collapse all
          </button>
        </div>
        <div className="space-y-3">
          {stages.map((g) => (
            <div key={g.stage.id}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                {g.stage.label}
              </p>
              <ul className="space-y-0.5">
                {g.items.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => openAndScroll(s.id)}
                      className="flex w-full items-center gap-2 rounded px-1.5 py-1 text-left text-sm text-slate-600 transition hover:bg-slate-100 hover:text-gray-900"
                    >
                      <Icon
                        name={s.icon}
                        className="h-3.5 w-3.5 shrink-0 text-slate-400"
                      />
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </nav>

      <div className="space-y-3">
        {SECTIONS.map((s) => (
          <ManualSection
            key={s.id}
            section={s}
            isOpen={open.has(s.id)}
            onToggle={() => toggle(s.id)}
            onNavigate={openAndScroll}
          />
        ))}
      </div>
    </div>
  );
}

function ManualSection({
  section,
  isOpen,
  onToggle,
  onNavigate,
}: {
  section: GuideSection;
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: (id: string) => void;
}) {
  const procs = proceduresFor(section.id);
  const related = section.related
    .map((id) => sectionById(id))
    .filter((s): s is GuideSection => Boolean(s));

  return (
    <section
      id={`doc-${section.id}`}
      className="scroll-mt-4 rounded-xl border border-slate-200 bg-white"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <div className="rounded-lg bg-indigo-50 p-2">
          <Icon name={section.icon} className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
            {section.title}
            {section.status === "coming-soon" && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                Coming soon
              </span>
            )}
          </h2>
          <p className="truncate text-sm text-slate-500">{section.what}</p>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-slate-400 transition ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="space-y-5 border-t border-slate-100 px-5 py-5">
          <ManualBlock label="Overview">{section.what}</ManualBlock>
          <ManualBlock label="When to use it">{section.when}</ManualBlock>

          {procs.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">
                How to use it — step by step
              </p>
              <div className="space-y-3">
                {procs.map((p, i) => (
                  <div
                    key={i}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <p className="mb-2 text-sm font-medium text-gray-900">
                      {p.title}
                    </p>
                    <ol className="ml-5 list-decimal space-y-1.5 text-sm leading-relaxed text-slate-700">
                      {p.steps.map((st, j) => (
                        <li key={j} className="pl-1">
                          {renderInline(st, `st-${section.id}-${i}-${j}`)}
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <ManualBlock label="Linked to">{section.linkedTo}</ManualBlock>
            <ManualBlock label="If you skip it" tone="warning">
              {section.ifYouSkip}
            </ManualBlock>
          </div>

          {section.logic && (
            <div>
              <p className="mb-1 text-xs font-medium text-slate-400">
                How it works — the full logic
              </p>
              <Markdown
                text={section.logic}
                className="text-sm leading-relaxed text-slate-700"
              />
            </div>
          )}

          {related.length > 0 && (
            <div className="border-t border-slate-100 pt-3">
              <p className="mb-2 text-xs font-medium text-slate-400">Related</p>
              <div className="flex flex-wrap gap-2">
                {related.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => onNavigate(r.id)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
                  >
                    <Icon name={r.icon} className="h-3.5 w-3.5" />
                    {r.title.split(" — ")[0]}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ManualBlock({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <div>
      <p
        className={`mb-1 text-xs font-medium ${
          tone === "warning" ? "text-amber-600" : "text-slate-400"
        }`}
      >
        {label}
      </p>
      <p className="text-sm leading-relaxed text-slate-700">{children}</p>
    </div>
  );
}

function SectionCard({
  section,
  query,
  onSelect,
}: {
  section: GuideSection;
  query: string;
  onSelect: (id: string) => void;
}) {
  const related = section.related
    .map((id) => SECTIONS.find((s) => s.id === id))
    .filter((s): s is GuideSection => Boolean(s));

  return (
    <article
      id="guide-card"
      className="rounded-xl border border-slate-200 bg-white p-5"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-indigo-50 p-2">
          <Icon name={section.icon} className="h-5 w-5 text-indigo-600" />
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">
            {section.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className={JOURNEY_STYLE}>
              <MapPin className="h-3 w-3" />
              {JOURNEY.find((j) => j.id === section.journey)?.label ??
                section.journey}
            </span>
            {section.status === "coming-soon" && (
              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                Coming soon
              </span>
            )}
            {section.path && section.status === "live" && (
              <Link
                href={section.path}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline"
              >
                Open it <ArrowRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        </div>
      </div>

      {query && (
        <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Matched: “{matchSnippet(section, query)}”
        </p>
      )}

      <dl className="mt-4 space-y-0">
        <Row
          icon={<Info className="h-4 w-4 text-slate-400" />}
          label="What it is"
          text={section.what}
        />
        <Row
          icon={<Sparkles className="h-4 w-4 text-slate-400" />}
          label="When you use it"
          text={section.when}
        />
        <Row
          icon={<Link2 className="h-4 w-4 text-indigo-500" />}
          label="Linked to"
          text={section.linkedTo}
        />
        <Row
          icon={<TriangleAlert className="h-4 w-4 text-amber-500" />}
          label="If you skip it"
          text={section.ifYouSkip}
        />
      </dl>

      {section.logic && (
        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <p className="mb-1 text-xs font-medium text-slate-500">
            How it works — the full logic
          </p>
          <Markdown
            text={section.logic}
            className="text-sm leading-relaxed text-slate-700"
          />
        </div>
      )}

      {related.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-xs font-medium text-slate-400">
            Related features
          </p>
          <div className="flex flex-wrap gap-2">
            {related.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onSelect(r.id)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <Icon name={r.icon} className="h-3.5 w-3.5" />
                {r.title.split(" — ")[0]}
                <ArrowRight className="h-3 w-3" />
              </button>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

function Row({
  icon,
  label,
  text,
}: {
  icon: React.ReactNode;
  label: string;
  text: string;
}) {
  return (
    <div className="flex gap-3 border-t border-slate-100 py-3 first:border-t-0 first:pt-0">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div>
        <dt className="text-xs text-slate-400">{label}</dt>
        <dd className="mt-0.5 text-sm leading-relaxed text-slate-700">{text}</dd>
      </div>
    </div>
  );
}

// Inline **bold** parsing.
function renderInline(text: string, keyPrefix: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <strong key={`${keyPrefix}-${i}`} className="font-medium text-gray-900">
        {p.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{p}</span>
    ),
  );
}

// Lightweight markdown: paragraphs, "- " bullet lists, and inline **bold**.
// Used for orientation, the "How it works" logic blocks, and assistant answers,
// so `**` never shows up as literal asterisks.
function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let tableRows: string[] = [];
  let k = 0;

  const flushBullets = () => {
    if (bullets.length === 0) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`ul-${k++}`} className="my-2 ml-4 list-disc space-y-1">
        {items.map((it, i) => (
          <li key={i}>{renderInline(it, `li-${k}-${i}`)}</li>
        ))}
      </ul>,
    );
  };

  const flushTable = () => {
    if (tableRows.length === 0) return;
    const parsed = tableRows.map((r) =>
      r.replace(/^\s*\|/, "").replace(/\|\s*$/, "").split("|").map((c) => c.trim()),
    );
    const isSep = (cells: string[]) => cells.every((c) => /^:?-{2,}:?$/.test(c));
    const rows = parsed.filter((cells) => !isSep(cells));
    tableRows = [];
    if (rows.length === 0) return;
    const [header, ...body] = rows;
    blocks.push(
      <div key={`tbl-${k++}`} className="my-2 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {header.map((h, i) => (
                <th
                  key={i}
                  className="border-b border-slate-200 px-2 py-1 text-left font-medium text-gray-900"
                >
                  {renderInline(h, `th-${k}-${i}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri}>
                {row.map((c, ci) => (
                  <td
                    key={ci}
                    className="border-b border-slate-100 px-2 py-1 align-top text-slate-700"
                  >
                    {renderInline(c, `td-${k}-${ri}-${ci}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  };

  const flush = () => {
    flushBullets();
    flushTable();
  };

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith("|") && line.endsWith("|")) {
      flushBullets();
      tableRows.push(line);
      continue;
    }
    if (line.startsWith("- ")) {
      flushTable();
      bullets.push(line.slice(2));
      continue;
    }
    flush();
    blocks.push(
      <p key={`p-${k++}`} className="my-2 first:mt-0 last:mb-0">
        {renderInline(line, `p-${k}`)}
      </p>,
    );
  }
  flush();

  return <div className={className}>{blocks}</div>;
}

// Back-compat single-line inline renderer for the orientation bullets.
function Bolded({ text }: { text: string }) {
  return <>{renderInline(text, "b")}</>;
}

// ---- Ask-a-question assistant ----------------------------------------------

type ChatMsg = { role: "user" | "assistant"; content: string };

const EXAMPLES = [
  "How is revenue recognition calculated per order?",
  "Why is a live site missing from renewals?",
  "How are invoices split from a payment term?",
  "What do the usage health categories mean?",
];

function AskAssistant() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const historyRef = useRef<ChatMsg[]>([]);

  async function ask(e?: React.FormEvent, explicit?: string) {
    e?.preventDefault();
    const question = (explicit ?? input).trim();
    if (!question || streaming) return;

    setError(null);
    setInput("");
    const priorHistory = historyRef.current;
    const withUser: ChatMsg[] = [...messages, { role: "user", content: question }];
    setMessages([...withUser, { role: "assistant", content: "" }]);
    setStreaming(true);

    try {
      const res = await fetch("/api/guide-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history: priorHistory }),
      });

      if (!res.ok) {
        let msg = "The assistant is unavailable right now.";
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* non-JSON error */
        }
        setError(msg);
        setMessages(messages); // roll back the empty assistant bubble
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let answer = "";
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += decoder.decode(value, { stream: true });
          setMessages([...withUser, { role: "assistant", content: answer }]);
        }
      }
      historyRef.current = [
        ...priorHistory,
        { role: "user" as const, content: question },
        { role: "assistant" as const, content: answer },
      ].slice(-6);
    } catch {
      setError("Couldn’t reach the assistant. Check your connection and retry.");
      setMessages(messages);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-indigo-600" />
        <h2 className="text-sm font-semibold text-gray-900">Ask a question</h2>
      </div>

      {messages.length === 0 && !error && (
        <div className="mb-3">
          <p className="mb-2 text-xs text-slate-500">
            Ask anything about how the Hub works. For example:
          </p>
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => ask(undefined, q)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <div className="mb-3 space-y-3">
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "whitespace-pre-wrap bg-indigo-600 text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {m.role === "user" ? (
                  m.content
                ) : m.content ? (
                  <Markdown text={m.content} />
                ) : streaming && i === messages.length - 1 ? (
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {error}
        </p>
      )}

      <form onSubmit={ask} className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(e as unknown as React.FormEvent);
            }
          }}
          rows={1}
          placeholder="e.g. A site went live but I don't see a renewal — why?"
          className="min-h-[40px] flex-1 resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {streaming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              Ask <Send className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </form>
      <p className="mt-2 text-[11px] text-slate-400">
        Answers come from this guide only. Double-check anything important
        against the actual screen.
      </p>
    </section>
  );
}
