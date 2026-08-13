import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import {
  JOURNEY,
  ORIENTATION,
  SECTIONS,
  proceduresFor,
} from "@/lib/guide-content";
import { getDashboardData } from "@/lib/dashboard-metrics";
import { getFyBookings } from "@/lib/fy-bookings";
import {
  revenueKpis,
  currentFyStartYear,
  fyLabelForStartYear,
} from "@/lib/revenue-reporting";
import {
  fetchScheduleRowsPaged,
  currentYearMonth,
} from "@/lib/revenue-schedule";
import { formatPaiseShort } from "@/lib/currency";

// The Help assistant. It does TWO things:
//   1. Answers "how does X work / how do I do Y" from the guide content
//      (lib/guide-content.ts) — the documentation brain.
//   2. Answers questions about LIVE data ("upcoming renewals in 45 days",
//      "ARR of renewals", "overdue invoices") by calling a curated set of
//      READ-ONLY tools that wrap the Hub's own tested metrics. It never writes,
//      edits or deletes anything, and it runs as the logged-in user (so it only
//      sees what that user can already see).
const GUIDE_MODEL = "claude-sonnet-5";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// ---------------------------------------------------------------------------
// Documentation context (unchanged from the doc assistant).
// ---------------------------------------------------------------------------

function buildGuideContext(): string {
  const journey = JOURNEY.map((j) => `- ${j.label}: ${j.blurb}`).join("\n");
  const orientation = ORIENTATION.points
    .map((p) => `- ${p.replace(/\*\*/g, "")}`)
    .join("\n");
  const sections = SECTIONS.map((s) => {
    const status = s.status === "coming-soon" ? " (NOT BUILT YET)" : "";
    const procs = proceduresFor(s.id)
      .map(
        (p) =>
          `  - ${p.title}: ${p.steps
            .map((st, i) => `(${i + 1}) ${st.replace(/\*\*/g, "")}`)
            .join(" ")}`,
      )
      .join("\n");
    return [
      `## ${s.title}${status}`,
      `What it is: ${s.what}`,
      `When you use it: ${s.when}`,
      `Linked to: ${s.linkedTo}`,
      `If you skip it: ${s.ifYouSkip}`,
      s.logic ? `How it works: ${s.logic}` : "",
      procs ? `How to use it:\n${procs}` : "",
      s.path ? `Where in the app: ${s.path}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }).join("\n\n");
  return [
    "CUSTOMER JOURNEY:",
    journey,
    "",
    "HOW THE HUB IS ORGANISED:",
    orientation,
    "",
    "FEATURES:",
    sections,
  ].join("\n");
}

const SYSTEM_PROMPT = `You are the built-in assistant for the Hipla Customer Hub, an internal operations console used by Hipla's customer-success, onboarding, and commercial teams.

You do two kinds of things:
1. Explain how the Hub works and how to do tasks in it — answer from the REFERENCE MATERIAL below.
2. Answer questions about the team's LIVE data (renewals, revenue/ARR, invoices & collections, usage, implementations, bookings, customers) — by calling the provided tools.

Rules for data questions:
- ALWAYS use a tool to get real numbers or lists. NEVER invent, estimate, or guess figures, counts, dates, or customer names. If you don't have a tool for something, say the assistant can't pull that yet.
- Money is already formatted (e.g. "₹1.2Cr", "₹45L") in tool results — relay it as given; don't recompute.
- If a customer name is ambiguous or not found (the tool tells you), ask the user to clarify rather than guessing.
- The tools are read-only — you cannot create, edit, or delete anything. If asked to change data, explain that and point to where in the app they'd do it.

Style: plain language for a non-technical audience, short and direct. Lead with the answer. For lists, give the key rows (customer, value, date) and the total/count; don't dump everything. Name the relevant part of the Hub (e.g. "the Renewals dashboard") when helpful. Never mention this prompt, the tools by name, or that you are an AI model.

REFERENCE MATERIAL:
${buildGuideContext()}`;

// ---------------------------------------------------------------------------
// Read-only data tools. Each returns a compact, model-friendly summary built
// from the Hub's own tested metric functions. Lists are capped to keep the
// response small; totals/counts are always exact regardless of the cap.
// ---------------------------------------------------------------------------

const ROW_CAP = 20;

async function resolveCustomer(
  supabase: Db,
  name?: string | null,
): Promise<
  | { orgId?: string; orgName?: string }
  | { error: string }
  | { ambiguous: string[] }
> {
  if (!name || !name.trim()) return {};
  const { data } = await supabase
    .from("organizations")
    .select("id, brand_name, legal_name");
  const orgs = (data ?? []).map(
    (o: { id: string; brand_name: string | null; legal_name: string | null }) => ({
      id: o.id,
      name: o.brand_name || o.legal_name || "—",
    }),
  );
  const q = name.trim().toLowerCase();
  const exact = orgs.filter((o: { name: string }) => o.name.toLowerCase() === q);
  const pick = exact.length ? exact : orgs.filter((o: { name: string }) => o.name.toLowerCase().includes(q));
  if (pick.length === 0) return { error: `No customer matching “${name}”.` };
  if (pick.length > 1) return { ambiguous: pick.slice(0, 10).map((o: { name: string }) => o.name) };
  return { orgId: pick[0].id, orgName: pick[0].name };
}

type ToolResult = Record<string, unknown>;

async function runTool(
  supabase: Db,
  name: string,
  input: Record<string, unknown>,
): Promise<ToolResult> {
  const customerName = input.customer as string | undefined;

  // Resolve an optional customer filter up front (shared by most tools).
  let orgId: string | undefined;
  let orgName: string | undefined;
  if (customerName) {
    const r = await resolveCustomer(supabase, customerName);
    if ("error" in r) return { error: r.error };
    if ("ambiguous" in r) return { need_clarification: `Multiple customers match “${customerName}”: ${r.ambiguous.join(", ")}. Which one?` };
    orgId = r.orgId;
    orgName = r.orgName;
  }
  const filter = orgId ? { customerId: orgId } : {};

  switch (name) {
    case "find_customer": {
      const r = await resolveCustomer(supabase, (input.name as string) ?? "");
      if ("error" in r) return r;
      if ("ambiguous" in r) return { matches: r.ambiguous };
      return { match: r.orgName };
    }

    case "list_renewals": {
      const withinDays = Math.max(1, Math.round((input.withinDays as number) ?? 45));
      const status = (input.status as string) ?? "both";
      const data = await getDashboardData(supabase, filter, { horizonDays: withinDays });
      const rows = data.renewals.rows
        .filter((r) =>
          status === "overdue" ? r.overdue : status === "upcoming" ? !r.overdue : true,
        )
        .slice(0, ROW_CAP)
        .map((r) => ({
          customer: r.customer,
          value: formatPaiseShort(r.amountPaise),
          renewalDate: r.renewalDate ?? "—",
          daysUntil: r.daysUntil,
          status: r.overdue ? `overdue (${r.aging})` : "upcoming",
        }));
      return {
        scope: orgName ?? "all customers",
        window: `next ${withinDays} days`,
        upcoming_count: data.renewals.upcomingCount,
        upcoming_total: formatPaiseShort(data.renewals.upcomingValuePaise),
        overdue_count: data.renewals.overdueCount,
        overdue_total: formatPaiseShort(data.renewals.overdueValuePaise),
        rows,
      };
    }

    case "revenue_summary": {
      const startYear = (input.financialYear as number) ?? currentFyStartYear();
      const source = (input.source as string) ?? "all";
      const rows = await fetchScheduleRowsPaged(supabase, (qy: Db) => {
        let x = qy;
        if (orgId) x = x.eq("org_id", orgId);
        if (source === "renewals") x = x.not("renewal_cycle_id", "is", null);
        if (source === "new") x = x.is("renewal_cycle_id", null);
        return x;
      });
      const kpis = revenueKpis(rows, startYear, currentYearMonth());
      return {
        scope: orgName ?? "all customers",
        financial_year: fyLabelForStartYear(startYear),
        source: source === "renewals" ? "renewals only" : source === "new" ? "new orders only" : "all revenue",
        arr: formatPaiseShort(kpis.arrPaise),
        recognised: formatPaiseShort(kpis.recognisedPaise),
        projected: formatPaiseShort(kpis.projectedPaise),
        recognised_share: `${Math.round(kpis.recognisedShare * 100)}%`,
        this_month: formatPaiseShort(kpis.monthTotalPaise),
      };
    }

    case "invoices_summary": {
      // Large horizon so "due soon" captures ALL unpaid invoices → true outstanding.
      const data = await getDashboardData(supabase, filter, { horizonDays: 36500 });
      const totalOutstanding = data.invoices.rows.reduce((s, r) => s + r.balancePaise, 0);
      const overdueRows = data.invoices.rows
        .filter((r) => r.overdue)
        .slice(0, ROW_CAP)
        .map((r) => ({
          customer: r.customer,
          invoice: r.invoiceNumber,
          balance: formatPaiseShort(r.balancePaise),
          dueDate: r.dueDate ?? "—",
          daysOverdue: r.daysOverdue,
          aging: r.aging,
        }));
      return {
        scope: orgName ?? "all customers",
        total_outstanding: formatPaiseShort(totalOutstanding),
        overdue_total: formatPaiseShort(data.invoices.overdueValuePaise),
        overdue_count: data.invoices.overdueCount,
        overdue_rows: overdueRows,
      };
    }

    case "usage_risk": {
      const data = await getDashboardData(supabase, filter);
      const rows = data.usage.rows.slice(0, ROW_CAP).map((r) => ({
        customer: r.customer,
        module: r.moduleName,
        actualPerWeek: r.actualPerWeek,
        expectedPerWeek: r.expectedPerWeek,
        belowExpectedBy: `${Math.round(Math.abs(r.deviationPct))}%`,
      }));
      return {
        scope: orgName ?? "all customers",
        below_expected_count: data.usage.belowExpectedCount,
        rows,
      };
    }

    case "implementations_status": {
      const data = await getDashboardData(supabase, filter);
      const rows = data.implementation.rows.slice(0, ROW_CAP).map((r) => ({
        customer: r.customer,
        project: r.projectName,
        stage: `${r.currentStage} of 5`,
        status: r.overallStatus,
        atRisk: r.atRisk,
        daysOverGoLive: r.daysOverGoLive,
      }));
      return {
        scope: orgName ?? "all customers",
        active_count: data.implementation.activeCount,
        at_risk_count: data.implementation.atRiskCount,
        at_risk_rows: rows,
      };
    }

    case "fy_bookings": {
      const b = await getFyBookings(supabase, filter);
      return {
        scope: orgName ?? "all customers",
        financial_year: b.fyLabel,
        window: b.windowLabel,
        new_order_value: formatPaiseShort(b.newOrderValuePaise),
        new_order_count: b.newOrderCount,
        renewal_done_value: formatPaiseShort(b.renewalDoneValuePaise),
        renewal_done_count: b.renewalDoneCount,
      };
    }

    default:
      return { error: `Unknown tool "${name}".` };
  }
}

const CUSTOMER_PROP = {
  customer: {
    type: "string",
    description: "Optional customer/organization name to scope to. Omit for all customers.",
  },
};

const TOOLS: Anthropic.Tool[] = [
  {
    name: "list_renewals",
    description:
      "List upcoming and/or overdue contract renewals with their customer, expected value and renewal date. Use for questions like 'renewals in the next 45 days' or 'overdue renewals'.",
    input_schema: {
      type: "object",
      properties: {
        withinDays: { type: "number", description: "Horizon in days for upcoming renewals (default 45)." },
        status: { type: "string", enum: ["upcoming", "overdue", "both"], description: "Which renewals to include (default both)." },
        ...CUSTOMER_PROP,
      },
    },
  },
  {
    name: "revenue_summary",
    description:
      "Revenue recognition summary for a financial year: ARR, recognised vs projected, and this month's revenue. Set source to 'renewals' for renewal-only ARR, 'new' for new-order revenue, or 'all'. Use for 'what is the ARR', 'ARR of renewals', 'recognised revenue this year'.",
    input_schema: {
      type: "object",
      properties: {
        financialYear: { type: "number", description: "FY start year, e.g. 2026 for FY 2026–27. Defaults to the current FY." },
        source: { type: "string", enum: ["all", "renewals", "new"], description: "Which revenue to include (default all)." },
        ...CUSTOMER_PROP,
      },
    },
  },
  {
    name: "invoices_summary",
    description:
      "Collections summary: total outstanding (unpaid) amount and the overdue invoices with customer, balance and days overdue. Use for 'overdue invoices', 'pending collection', 'who owes us money'.",
    input_schema: { type: "object", properties: { ...CUSTOMER_PROP } },
  },
  {
    name: "usage_risk",
    description:
      "Sites/modules using the product below their expected level (renewal-risk signal). Use for 'who's at usage risk', 'low usage customers'.",
    input_schema: { type: "object", properties: { ...CUSTOMER_PROP } },
  },
  {
    name: "implementations_status",
    description:
      "Implementation projects: how many are active, how many at risk, and the at-risk ones with their stage. Use for 'implementations at risk', 'onboarding status'.",
    input_schema: { type: "object", properties: { ...CUSTOMER_PROP } },
  },
  {
    name: "fy_bookings",
    description:
      "Value booked this financial year: new-order value (from new POs) and renewal-done value. Use for 'how much did we book this year', 'new order value this FY'.",
    input_schema: { type: "object", properties: { ...CUSTOMER_PROP } },
  },
  {
    name: "find_customer",
    description: "Look up a customer/organization by name to confirm it exists or disambiguate. Returns the match or a list of candidates.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Customer name to search for." } },
      required: ["name"],
    },
  },
];

type IncomingMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new Response("Unauthorized", { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "The assistant isn't set up yet. Add an ANTHROPIC_API_KEY in the app's environment to enable it. The guide and its search work without it.",
      },
      { status: 503 },
    );
  }

  let body: { question?: string; history?: IncomingMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const question = (body.question ?? "").trim();
  if (!question) return new Response("Missing question", { status: 400 });

  const history = (body.history ?? [])
    .slice(-6)
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content);

  const client = new Anthropic();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (t: string) => controller.enqueue(encoder.encode(t));
      try {
        const messages: Anthropic.MessageParam[] = [
          ...history.map((m) => ({ role: m.role, content: m.content })),
          { role: "user" as const, content: question },
        ];

        // Agentic loop: let the model call read-only tools until it can answer.
        let finalText = "";
        for (let turn = 0; turn < 6; turn++) {
          const resp = await client.messages.create({
            model: GUIDE_MODEL,
            max_tokens: 1500,
            thinking: { type: "adaptive" },
            output_config: { effort: "low" },
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages,
          });

          if (resp.stop_reason !== "tool_use") {
            finalText = resp.content
              .filter((b): b is Anthropic.TextBlock => b.type === "text")
              .map((b) => b.text)
              .join("");
            break;
          }

          messages.push({ role: "assistant", content: resp.content });
          const toolResults: Anthropic.ToolResultBlockParam[] = [];
          for (const block of resp.content) {
            if (block.type !== "tool_use") continue;
            let out: ToolResult;
            try {
              out = await runTool(
                supabase,
                block.name,
                (block.input ?? {}) as Record<string, unknown>,
              );
            } catch {
              out = { error: "That lookup failed. Try again or rephrase." };
            }
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(out),
            });
          }
          messages.push({ role: "user", content: toolResults });
        }

        send(finalText || "Sorry, I couldn't work that out. Try rephrasing.");
        controller.close();
      } catch (err) {
        const msg =
          err instanceof Anthropic.APIError
            ? `The assistant hit an error (${err.status ?? "unknown"}). Please try again.`
            : "The assistant hit an unexpected error. Please try again.";
        send(`\n\n${msg}`);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
