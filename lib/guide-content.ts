// Single source of truth for the in-app Help guide (/guide) AND the
// "Ask a question" assistant (app/api/guide-assistant). Editing a section here
// updates both the page and the answers the assistant gives — keep them in one
// place so they can never drift apart.
//
// Each section has TWO layers:
//   * the 4-part block (what / when / linkedTo / ifYouSkip) — the skimmable card
//   * `logic` — the end-to-end mechanics, grounded in the real code (lib/*.ts).
//     This is what makes the assistant able to answer "how is X calculated".
//     `logic` supports light markdown: **bold**, blank-line paragraphs, and
//     lines starting with "- " become bullets.
//
// When a NEW feature ships: add a section (fill the 4 fields + `logic`), list
// which existing sections it connects to in `related`, and the guide draws the
// links both ways automatically.

export type SectionStatus = "live" | "coming-soon";

export type GuideSection = {
  id: string;
  /** lucide-react icon component name */
  icon: string;
  title: string;
  /** Which stage of the customer journey this belongs to (see JOURNEY). */
  journey: string;
  status: SectionStatus;
  /** Plain-language: what this feature is. */
  what: string;
  /** When in the workflow you use it (the trigger). */
  when: string;
  /** What it connects to — the "what's linked to what". */
  linkedTo: string;
  /** The concrete consequence of skipping it. */
  ifYouSkip: string;
  /** The full end-to-end mechanics (markdown). Optional but expected. */
  logic?: string;
  /** ids of related sections; links are drawn both ways. */
  related: string[];
  /** Where it lives in the app, for a "Open it" link. Optional. */
  path?: string;
  /** Extra words the search should match (synonyms, acronyms, misspellings). */
  keywords?: string[];
};

// The customer journey — the spine the guide hangs off.
export const JOURNEY: { id: string; label: string; blurb: string }[] = [
  { id: "order", label: "Order lands", blurb: "A signed PO arrives and the commercial record begins." },
  { id: "implementation", label: "Implementation", blurb: "The site is onboarded stage by stage." },
  { id: "golive", label: "Go-live", blurb: "The site goes live — and the renewal + revenue clocks start." },
  { id: "usage", label: "Usage", blurb: "The customer uses what they bought; adoption is tracked." },
  { id: "support", label: "Support", blurb: "Tickets and contacts keep the site running." },
  { id: "renewal", label: "Renewal", blurb: "The contract comes up for renewal on schedule." },
];

export const ORIENTATION = {
  title: "How the Hub is organised",
  points: [
    "A customer is an **Organization (HQ)** with one or more **Sites (offices)**. Almost everything operational lives at the **Site**, because it differs per office — never treat a customer as one flat thing.",
    "There are two main views: the **Site 360** (one office's whole story) and the **Organization 360** (a roll-up across all of that customer's offices).",
    "**Money is never hand-typed.** Every total is computed from the small things you enter — line items, payments, renewals. Amounts are stored in **paise (whole numbers)**, in rupees (INR), ex-GST, so there's never any rounding drift.",
  ],
};

export const SECTIONS: GuideSection[] = [
  {
    id: "pos",
    icon: "FileText",
    title: "POs — contracts, invoices & payments",
    journey: "order",
    status: "live",
    what: "The commercial chain for a site: Contract → Purchase Order → line items → Invoice → Payment. The PO's value is added up from its line items, never typed by hand.",
    when: "As soon as a signed PO arrives from the customer. It's the first thing you record for a new order.",
    linkedTo:
      "Each invoice is billed to exactly one site and rolls up into that customer's total revenue and pending-collection figures. A payment clears its invoice. The PO also drives Renewals and the Revenue schedule once the order goes live.",
    ifYouSkip:
      "No PO means no invoices, no collection tracking, no renewal projection and no revenue schedule — the site looks empty everywhere.",
    logic: `**PO value** = the sum of its **line items** (each line = quantity × unit price). It is computed, never entered directly. GST is *recorded* (GST number + amount you type), not computed — the Hub doesn't generate tax invoices.

**Invoices are generated from the PO's payment term.** Two shapes:
- **Periodic** (e.g. Monthly, Quarterly): the number of invoices = invoices-per-year × contract-months ÷ 12. The PO value is split evenly in paise, with any leftover paise spread across the first invoices so the parts sum back to exactly the total. "Advance" bills at the start of each period, "arrears" at the end; the due date = issue date + the term's billing-schedule days.
- **Milestone** (e.g. 50% advance / 40% delivery / 10% go-live): the value is split by those percentages (rounding drift absorbed by the last one). Milestone dates start blank for you to fill, because they're event-driven.

**Invoice status is derived**, never set by hand: it moves through draft → raised → due → overdue → part-paid → cleared based on payments received and the due date (overdue = unpaid past its due date). An invoice is **cleared** when payments received ≥ its total.

**A payment** is cash received against one invoice; recording it is what advances that invoice toward cleared and reduces the site's pending-collection figure.`,
    related: ["implementation", "renewals", "revenue", "licenses", "invoices-dashboard"],
    path: "/sites",
    keywords: ["purchase order", "contract", "invoice", "billing", "payment", "collection", "GST", "line item", "money", "amount", "milestone", "periodic", "advance", "arrears", "overdue", "aging"],
  },
  {
    id: "revenue",
    icon: "TrendingUp",
    title: "Revenue recognition (ARR / MRR)",
    journey: "renewal",
    status: "live",
    what: "The engine that spreads each order's value across the months it's earned, and rolls those months up into ARR, recognised-vs-projected revenue, and monthly/quarterly reports.",
    when: "It runs automatically off your POs and renewals. You read it on the Revenue pages to see earned vs projected revenue.",
    linkedTo:
      "Built entirely from PO line items and renewals, anchored by the go-live date recorded in Implementation. Anything with no anchor lands in the Unrecognised worklist.",
    ifYouSkip:
      "You can't skip it directly — but if go-live isn't recorded or a line item has no recognition method, that revenue stays 'projected' or falls into the Unrecognised list instead of counting as earned.",
    logic: `Each **line item** is turned into month-by-month revenue rows by its **recognition method**:
- **SaaS** — value spread evenly across the coverage months.
- **Opex** — same even monthly spread.
- **Capex** — 80% recognised upfront in the anchor month, the remaining 20% ("tail") spread evenly over the coverage months.
- **One-Time** — the whole value in a single month (the anchor month).

Every spread divides in **paise**, floors each instalment, and drops the leftover on the first month, so the schedule always sums to exactly the line's value.

**The anchor month** (when recognition starts) comes from the PO's Implementation project: the **actual go-live** month if the site is live, otherwise the **expected-delivery** month. A line with neither has no anchor and appears in the **/revenue/unrecognised** worklist instead.

**Recognition status has two states and is event-driven — it does NOT depend on today's date:**
- **Recognised** — the order has gone live (or the renewal is marked done). *Every* month of that schedule counts as recognised, past and future.
- **Projected** — not delivered yet (still on an expected-delivery date, or a renewal not yet done).

**Renewals** feed the same engine as synthetic SaaS line items: value = the actual renewal value once done, else the expected value; coverage = the cycle's term; recognised once the renewal is marked done.

**ARR (how Hipla defines it):** the **total of every revenue component that falls inside a financial year** (Apr–Mar) — including the Capex upfront lump. It is NOT "recurring × 12". The current-month figure is likewise the total revenue landing in that month.

**PO cancellation** zeroes the months on/after the cancellation month and leaves earlier history intact. The **/revenue** page shows FY ARR, recognised vs projected, the 12 monthly bars and a quarterly table; **/revenue/mrr** and **/revenue/unrecognised** drill in.`,
    related: ["pos", "renewals", "implementation", "dashboards"],
    path: "/revenue",
    keywords: ["revenue", "recognition", "ARR", "MRR", "recognised", "projected", "saas", "capex", "opex", "one-time", "unrecognised", "schedule", "financial year", "FY", "run rate"],
  },
  {
    id: "licenses",
    icon: "KeyRound",
    title: "Licenses",
    journey: "order",
    status: "live",
    what: "The count of modules/licenses a site has, derived from its POs — not entered separately.",
    when: "You read it to see what a site has actually bought. It updates itself as POs change.",
    linkedTo: "Comes straight from the site's POs and the modules on them.",
    ifYouSkip: "Nothing to skip — it's automatic. But wrong or missing POs make the license counts wrong.",
    logic: "Licenses are a *read* of the modules attached to the site's POs — there's no separate place to type a license count. Fix it by fixing the underlying PO.",
    related: ["pos"],
    path: "/sites",
    keywords: ["licence", "modules", "seats", "entitlement"],
  },
  {
    id: "implementation",
    icon: "Rocket",
    title: "Implementation projects",
    journey: "implementation",
    status: "live",
    what: "A staged checklist that takes a site from sales order to live, one stage at a time. A site can have more than one project, and each links to a PO.",
    when: "Right after the PO — to onboard the customer and track go-live.",
    linkedTo:
      "Each project links a PO. Completing go-live stamps the go-live date, which anchors BOTH that PO's renewal dates and its revenue schedule.",
    ifYouSkip:
      "If go-live is never completed, renewal dates and the revenue schedule never anchor — the site silently drops off the Renewals dashboard and its revenue stays projected.",
    logic: `The project runs through **5 stages** (default template): Sales Order → Establish Contact → Hardware Provision → Customer Onboarding → Customer Success Handover. Each stage is a checklist of typed items.

**Scope is first-class:** the project holds a list of scope items, each with a status (planned / configured / pending / dropped). The onboarding stage's "scope configured %" is **computed** from those statuses, not typed.

**Go-live** is recorded here (not on the site banner) at the handover/go-live stage, and it requires a **linked PO**. Recording it does two things automatically:
- anchors that PO's **renewal dates** (renewal date = go-live + term), and
- anchors that PO's **revenue schedule** (revenue starts recognising from the go-live month, and flips from projected → recognised).

A project's overall status is computed from its stages.`,
    related: ["pos", "renewals", "revenue", "hardware", "scope", "implementations-dashboard"],
    path: "/sites",
    keywords: ["onboarding", "go live", "golive", "project", "stage", "rollout", "handover", "scope %"],
  },
  {
    id: "renewals",
    icon: "RefreshCw",
    title: "Renewals",
    journey: "renewal",
    status: "live",
    what: "Forward projections (Year 2–5) showing when each contract renews, its expected value, and — per year — whether hardware AMC is on the customer.",
    when: "Created automatically when the PO is set up; you review each one as its date approaches.",
    linkedTo:
      "Renewal dates anchor to the go-live date from Implementation. Expected value is computed from the PO's line items. Hardware ownership pre-fills the per-year AMC flag. Once done, a renewal feeds the Revenue engine.",
    ifYouSkip:
      "Skipping go-live or the PO link silently breaks the whole money forecast — this is where gaps elsewhere show up as missed renewals.",
    logic: `**When each renewal falls** (driven by the contract term in months, never hardcoded to a year):
- first renewal = go-live + the initial term;
- each next = previous + the renewal interval (default 12 months);
- rows are generated while the contract year is within the horizon (default 5 years).
So a 1-year term produces Years 2, 3, 4, 5; a 3-year term produces Years 4 and 5; a 5-year term produces none inside a 5-year horizon. The renewal **date** = go-live + offset months (no go-live → shown as "—").

**Expected value** is summed per line item under each line's renewal basis:
- **Recurring — flat** (or no basis): repeats at the same value.
- **Recurring — with escalation:** base × (1 + pct)^years-elapsed — it *compounds* each year.
- **AMC:** a flat maintenance fee = base × pct (e.g. 18%).
- **One-time:** contributes ₹0 (no renewal).
- **By category:** software-type lines escalate once over base (default 25%, held flat across years); everything else takes a flat AMC (default 18%).

**Deviation %** = (actual − expected) ÷ expected × 100 (0% when there's no expected baseline).

**History is protected.** A projected year worth ₹0 makes no row. When you later edit the PO, only *pristine* "upcoming" rows are recalculated — any renewal that's already marked **renewed**, has **invoices** raised, or has a **PO file** attached is treated as history and never rewritten.`,
    related: ["implementation", "pos", "revenue", "hardware", "renewals-dashboard"],
    path: "/renewals",
    keywords: ["renewal", "AMC", "year 2", "projection", "expiry", "term", "deviation", "escalation", "horizon"],
  },
  {
    id: "hardware",
    icon: "Cpu",
    title: "Hardware & devices",
    journey: "golive",
    status: "live",
    what: "The physical devices at a site — with their Esper ID, who owns them (customer or Hipla), and a replacement flow that keeps full history.",
    when: "When devices are provided, swapped, retired, or you need to know what's installed.",
    linkedTo:
      "Device ownership (customer vs Hipla) pre-fills the per-year renewal AMC flag. Replacements keep the outgoing device on record instead of deleting it.",
    ifYouSkip:
      "Skipped devices make the active-vs-replaced counts wrong and leave the renewal AMC question unanswered for that site.",
    logic: `Each **device** is one physical unit at a site, with its hardware type, **Esper ID**, and a "provided by" of customer or Hipla.

**Replacement is atomic** (a single database operation so the pair can never get out of sync): the outgoing device flips to *replaced*, a new device is created as *active*, and the reason and date are logged. Nothing is deleted — the history stays, so active-vs-replaced counts are always computed from device status.

**Ownership drives renewals:** whether hardware is owned by the customer or Hipla pre-fills the per-year "hardware AMC by customer?" yes/no on each renewal, which you can still override.`,
    related: ["renewals", "implementation"],
    path: "/sites",
    keywords: ["device", "esper", "tablet", "replacement", "swap", "AMC", "ownership", "serial"],
  },
  {
    id: "usage",
    icon: "Activity",
    title: "Usage tracking",
    journey: "usage",
    status: "live",
    what: "Per site + module activity, bucketed as No usage / Low / Healthy / Heavy against an expected level you set.",
    when: "Entered periodically to watch whether the customer is actually using what they bought.",
    linkedTo: "Compares actual entries against the expected level configured per site and module.",
    ifYouSkip:
      "No usage data means you can't spot renewal risk — a customer who paid for a module but isn't using it is the one most likely to churn.",
    logic: `Health is a comparison of **actual entries per week** against the **expected per week** set for that site + module:
- **No Usage** — 0 actual.
- **Low** — under half of expected (ratio < 0.5).
- **Healthy** — between half and 1.5× expected.
- **Heavy** — 1.5× expected or more.
- **Unknown** — no expected target has been set.

Low / No Usage show as warning/danger so they stand out as renewal risk.`,
    related: ["renewals", "usage-dashboard"],
    path: "/usage",
    keywords: ["adoption", "activity", "no usage", "low", "healthy", "heavy", "churn risk", "entries", "expected"],
  },
  {
    id: "support",
    icon: "LifeBuoy",
    title: "Support tickets",
    journey: "support",
    status: "live",
    what: "A simple log of tickets per site — ticket ID/subject with open and close dates; status (Open/Closed) is derived from those dates.",
    when: "To keep a record of issues raised for a site and see what's still open.",
    linkedTo: "Belongs to one site; feeds the total-tickets view.",
    ifYouSkip: "Without a log you're blind to a site's support load and can't see recurring problems.",
    logic: "This is a minimal v1 log: ticket ID, subject, opened date, closed date. Status is derived — a ticket with no close date is **Open**, otherwise **Closed**. Topic categories and CSV import are planned (see the coming-soon section).",
    related: ["contacts"],
    path: "/sites",
    keywords: ["ticket", "helpdesk", "issue", "support", "open", "closed"],
  },
  {
    id: "contacts",
    icon: "Users",
    title: "Contacts (SPOC)",
    journey: "support",
    status: "live",
    what: "The customer contacts for a site — name, role, and whether they've had Hipla training. (Recently renamed from 'Spox' to 'SPOC'.)",
    when: "When you need to know who to reach at a site, or a contact changes.",
    linkedTo:
      "Contacts belong to a site. Removing one is a soft-delete that requires you to name a replacement, so a site is never left with no one to reach.",
    ifYouSkip: "No SPOC means no named person to contact when something needs the customer's input.",
    logic: "Each contact carries a role (e.g. decision maker, approver, end user) and a has-taken-Hipla-training flag. Removal is a **soft-delete with a mandatory replacement** — you must nominate who takes over, so a live site always has a reachable contact. History is kept.",
    related: ["support", "scope"],
    path: "/sites",
    keywords: ["spoc", "spox", "contact", "point of contact", "customer contact", "decision maker", "training"],
  },
  {
    id: "scope",
    icon: "GitBranch",
    title: "Scope changes",
    journey: "implementation",
    status: "live",
    what: "A log of changes to what was agreed for a site — description, impact, and an approve/reject decision, kept as an auditable trail.",
    when: "Whenever the agreed scope shifts after the order (added module, timeline change, dropped item).",
    linkedTo:
      "Site-scoped and independent of the implementation project. Changes are approved or rejected inline; nothing is hard-deleted.",
    ifYouSkip: "Unlogged scope creep leads to disputes later and leaves no audit trail of what was agreed and when.",
    logic: "Each change records a description, its impact (e.g. 'timeline +2 weeks'), and a status (pending → approved / rejected). Approve/reject is inline. It's **site-scoped** (works before or after go-live, independent of the implementation project), and entries are soft-deleted, never removed, so the timeline stays complete.",
    related: ["implementation", "contacts"],
    path: "/sites",
    keywords: ["scope", "change request", "variation", "approval", "creep"],
  },
  {
    id: "agreements",
    icon: "FileSignature",
    title: "Agreements",
    journey: "order",
    status: "live",
    what: "A document store for a site — signed agreements and related files, organised by agreement type.",
    when: "When you receive a signed document you need to keep on record.",
    linkedTo: "Files attach to the site; the type comes from a managed list in Settings.",
    ifYouSkip: "Missing documents mean no signed record to fall back on if terms are questioned.",
    logic: "Files are stored per site with a metadata row (never embedded in the database). Each file is tagged with an agreement type from the Settings catalog. Uploads are capped at ~4 MB per file.",
    related: ["settings"],
    path: "/sites",
    keywords: ["agreement", "document", "contract file", "signed", "attachment", "upload"],
  },
  {
    id: "addresses",
    icon: "MapPin",
    title: "Addresses",
    journey: "order",
    status: "live",
    what: "The three distinct addresses a site can have: site/physical, billing, and shipping — because they often differ.",
    when: "When setting up a site or when an address changes.",
    linkedTo: "Billing address feeds invoicing; shipping address feeds hardware delivery.",
    ifYouSkip: "A wrong billing or shipping address means invoices and device deliveries go to the wrong place.",
    logic: "A site holds three separate addresses on purpose — the office location, where invoices are billed, and where hardware ships — plus its GST number, because these frequently differ per office.",
    related: ["pos", "hardware"],
    path: "/sites",
    keywords: ["address", "billing", "shipping", "GST", "location"],
  },
  {
    id: "org360",
    icon: "Building2",
    title: "Organization 360",
    journey: "order",
    status: "live",
    what: "The roll-up view of a whole customer: a list of its offices (sites) plus combined commercials — total revenue, pending collection and portfolio counts across all of them.",
    when: "When you click into a customer (the HQ) rather than a single office.",
    linkedTo: "Aggregates every site's POs, invoices, payments and renewals into one place.",
    ifYouSkip: "It's automatic — but it's only as complete as the underlying site data.",
    logic: "Every figure is a live sum across the customer's child sites: total revenue, pending collection, and counts of POs / invoices / renewals. Contracts and POs may cover one site or several; the roll-up always works because each invoice is still billed to exactly one site.",
    related: ["pos", "renewals"],
    path: "/organizations",
    keywords: ["organization", "org", "customer", "HQ", "roll up", "portfolio", "parent"],
  },
  {
    id: "dashboards",
    icon: "LayoutDashboard",
    title: "The dashboards",
    journey: "renewal",
    status: "live",
    what: "The home triage dashboard (money-first) plus focused portfolio pages that answer one question each across all customers.",
    when: "Daily, to see what needs attention across the whole book of business.",
    linkedTo:
      "Every number here is fed by the site-level work: POs feed the money tiles, go-live feeds Renewals and Revenue, usage entry feeds Usage, and so on.",
    ifYouSkip: "The dashboards only tell the truth if the underlying site data is kept up to date.",
    logic: `The home dashboard is money-first: KPI tiles plus panels for overdue renewals, outstanding invoices, implementations and usage, all filterable by period / customer / product.

Two standalone "booked this financial year" tiles are computed live:
- **New order value this FY** = the full line-item value of every PO whose received date falls in the current FY (Apr–Mar).
- **Renewal done value this FY** = the value of every renewal marked *renewed* with a received date in this FY.
These never overlap — new orders come from POs, renewals from the renewals table.

Everything is computed on read; nothing is stored.`,
    related: ["revenue", "renewals-dashboard", "implementations-dashboard", "usage-dashboard", "invoices-dashboard"],
    path: "/",
    keywords: ["dashboard", "home", "triage", "KPI", "overview", "portfolio", "booked", "financial year"],
  },
  {
    id: "renewals-dashboard",
    icon: "RefreshCw",
    title: "Renewals dashboard",
    journey: "renewal",
    status: "live",
    what: "The portfolio view of upcoming renewals across every customer.",
    when: "To plan renewal outreach and spot what's coming due.",
    linkedTo: "Fed by each site's renewal records, which are anchored by go-live dates.",
    ifYouSkip: "A site with no go-live date never appears here — the reminder is silently missed.",
    logic: "Lists renewals across all customers by due date. A renewal only appears once its date is anchored (go-live recorded), so a live site with no go-live date is invisible here.",
    related: ["renewals", "dashboards"],
    path: "/renewals",
    keywords: ["renewals list", "upcoming", "due", "expiry"],
  },
  {
    id: "implementations-dashboard",
    icon: "Rocket",
    title: "Implementations dashboard",
    journey: "implementation",
    status: "live",
    what: "The portfolio view of every implementation project in progress.",
    when: "To see which onboardings are moving, stalled, or done across all customers.",
    linkedTo: "Fed by each site's implementation projects.",
    ifYouSkip: "Projects not recorded on a site won't show here.",
    logic: "Aggregates every implementation project and its computed status, so you can see the onboarding pipeline and anything at risk across the whole book.",
    related: ["implementation", "dashboards"],
    path: "/implementations",
    keywords: ["implementations list", "onboarding pipeline", "at risk"],
  },
  {
    id: "usage-dashboard",
    icon: "Activity",
    title: "Usage dashboard",
    journey: "usage",
    status: "live",
    what: "The portfolio view of adoption health across sites and modules.",
    when: "To find customers who bought a module but aren't using it — the renewal-risk signal.",
    linkedTo: "Fed by the usage you enter per site and module.",
    ifYouSkip: "Without usage entry, this is blank and renewal risk stays hidden.",
    logic: "Rolls up the per-site usage-health buckets (No usage / Low / Healthy / Heavy) so you can filter for the risky ones across all customers.",
    related: ["usage", "dashboards"],
    path: "/usage",
    keywords: ["usage list", "adoption", "health"],
  },
  {
    id: "invoices-dashboard",
    icon: "ReceiptText",
    title: "Invoices dashboard",
    journey: "order",
    status: "live",
    what: "The portfolio view of invoices and collections across all customers.",
    when: "To see what's raised, due, overdue and cleared across the book.",
    linkedTo: "Fed by the invoices and payments recorded under each site's POs.",
    ifYouSkip: "Invoices not recorded on a site's PO won't show here.",
    logic: "Lists invoices across all customers with their derived status and aging (overdue = unpaid past due date), and the outstanding collection total. All computed from invoices + payments.",
    related: ["pos", "dashboards"],
    path: "/invoices",
    keywords: ["invoices list", "collections", "overdue", "aging", "pending"],
  },
  {
    id: "settings",
    icon: "Settings",
    title: "Settings & catalogs",
    journey: "order",
    status: "live",
    what: "The managed dropdown lists behind the whole app — modules, hardware, cost/PO types, payment terms, ticket topics, term lengths, agreement types — plus internal users.",
    when: "When a dropdown option is missing or needs changing. You edit lists here, not in code.",
    linkedTo: "These lists feed the dropdowns on POs, hardware, agreements, implementation and more.",
    ifYouSkip: "If a list is wrong, every screen that uses that dropdown is wrong too.",
    logic: `Reference data is *data, not code* — module names, hardware items, PO/cost types, payment terms, ticket topics, term lengths and agreement types all live in catalog tables you edit here.

Two catalogs carry real logic:
- **Payment terms** define how invoices split (periodic vs milestone, invoices-per-year, advance/arrears, billing days, milestone percentages) — see the POs section.
- **Term lengths** carry the renewal basis (flat / escalation / AMC / by-category) and its percentages — see Renewals.

The Users screen (/settings/users) manages internal Hipla users.`,
    related: ["pos", "renewals", "hardware", "agreements"],
    path: "/settings",
    keywords: ["settings", "catalog", "dropdown", "reference data", "users", "payment terms", "term length", "cost type", "PO type"],
  },
  {
    id: "usage-import",
    icon: "Activity",
    title: "Usage & ticket CSV import",
    journey: "usage",
    status: "coming-soon",
    what: "Bulk-importing usage counts and support tickets from a spreadsheet export, instead of typing them in.",
    when: "Planned — for now, usage and tickets are entered manually.",
    linkedTo: "Would feed the same Usage and Support screens that exist today.",
    ifYouSkip: "Until this ships, keep entering usage and tickets by hand.",
    logic: "Not built yet. The plan is a clean CSV import boundary (export from your helpdesk / product → upload) feeding the existing Usage and Support data, with manual entry remaining as the fallback.",
    related: ["usage", "support"],
    keywords: ["csv", "import", "bulk", "upload", "spreadsheet", "coming soon"],
  },
];

export function sectionById(id: string): GuideSection | undefined {
  return SECTIONS.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Step-by-step "how to use it in the app" walkthroughs, keyed by section id.
// Kept separate from SECTIONS so the short cards stay lean; the Full manual view
// and the assistant both read these. Steps use real screen/button labels and
// support **bold**. Site-level tasks all start from a Site 360 (open a customer,
// then one of its sites); the tab names are the Site 360 tabs.
// ---------------------------------------------------------------------------

export type Procedure = { title: string; steps: string[] };

export const PROCEDURES: Record<string, Procedure[]> = {
  pos: [
    {
      title: "Record a new purchase order",
      steps: [
        "Open the **Customers** list, click the customer, then open the **Site** the order is for (its Site 360).",
        "Go to the **POs** tab and click **Add purchase order**.",
        "Give the PO a **name** (e.g. “Acme HQ — VMS annual subscription”), then set **PO type**, **Cost type**, **Product / Category** and tick the **Modules covered**.",
        "Set the **Financial year**, **PO date**, **Payment terms**, **Contract time** and **Renewal term / basis**. Enter **GST %** (leave blank for 0%).",
        "Add one or more **line items** — Product, Qty and Amount (‘what is being purchased’). The **PO value adds up from these** automatically.",
        "Attach the signed **PO file**, then **Save**. Renewal projections and the revenue schedule are created from the PO.",
      ],
    },
    {
      title: "Generate invoices for a PO",
      steps: [
        "Open the PO on the **POs** tab.",
        "Click **Generate invoices** to build the schedule from the payment term — periodic terms split the value evenly across dated invoices; milestone terms split by percentage with blank dates for you to fill.",
        "Or click **Add single invoice** for a one-off.",
        "On each invoice set **Bill to site**, **Issue date**, **Due date**, and the **GST number / amount** (recorded for the record, not computed).",
        "Move the invoice from **Draft** to **Raised** when it's issued.",
      ],
    },
    {
      title: "Record a payment",
      steps: [
        "On the invoice, click **Record payment**.",
        "Enter the **Amount**, the **Received** date, the **Mode**, and a **Reference** (UTR / cheque no.).",
        "The invoice advances toward **Cleared** automatically once payments received reach its total, and the site's pending-collection figure drops.",
      ],
    },
  ],
  revenue: [
    {
      title: "Read the revenue picture",
      steps: [
        "Click **Revenue** in the left sidebar.",
        "See this financial year's **ARR**, **recognised vs projected** revenue, the 12 **monthly bars** and the **quarterly** table.",
        "Use **Revenue → MRR** and **Revenue → Unrecognised** to drill in.",
      ],
    },
    {
      title: "Fix revenue that isn't being recognised",
      steps: [
        "Open **Revenue → Unrecognised** to see line items with no schedule.",
        "The usual cause is **no anchor** — record the site's **go-live** in its Implementation project so recognition can start.",
        "The other cause is a line item with **no recognition method** (SaaS / Capex / Opex / One-Time) — set it on the PO line.",
      ],
    },
  ],
  implementation: [
    {
      title: "Run an implementation and record go-live",
      steps: [
        "On the Site 360, open the **Implementation** tab and create or open a project.",
        "**Link a PO** — click **Select a PO** (this is required before go-live).",
        "Work through the stages (Sales Order → Establish Contact → Hardware Provision → Customer Onboarding → Customer Success Handover), ticking the checklist items.",
        "At go-live, complete the go-live step (or use **Record a past go-live**) and set the **go-live date**.",
        "Recording go-live automatically anchors that PO's **renewal dates** and its **revenue schedule**.",
      ],
    },
  ],
  renewals: [
    {
      title: "Review a renewal and mark it done",
      steps: [
        "On the Site 360, open the renewals area (each PO shows its **Renewal / Expiry**).",
        "Each year shows the **Renewal date**, expected value, **Renewal basis** and **Deviation from expected**.",
        "To mark a year renewed, raise the **Renewal PO** (PO type = Renewal) capturing the actual value — this flips the year to *renewed* and feeds the Revenue engine.",
        "Committed years (renewed, invoiced, or with a PO file) are locked as history and aren't rewritten when you edit the original PO.",
      ],
    },
  ],
  hardware: [
    {
      title: "Add a device",
      steps: [
        "On the Site 360, open the **Hardware** tab and click **Add hardware**.",
        "Pick the hardware type, enter the **Esper ID** and name, and set **ownership** (customer or Hipla).",
      ],
    },
    {
      title: "Replace a device",
      steps: [
        "On the device, click **Replace device**.",
        "Enter the new unit's Esper ID under **Replaced by (new Esper ID)**, the reason, and the **Replaced on** date.",
        "The old device is kept as *replaced* (never deleted) — see **Replacement history**.",
      ],
    },
  ],
  usage: [
    {
      title: "Log a weekly usage entry",
      steps: [
        "Open **Usage** in the sidebar (or the Site 360 usage view) and click **Add new weekly entry**.",
        "Pick the module and week and enter the count.",
        "Set the **expected per week** for that site + module so the health category (No usage / Low / Healthy / Heavy) is meaningful.",
      ],
    },
  ],
  support: [
    {
      title: "Log a support ticket",
      steps: [
        "On the Site 360, open the **Support** tab and click **Log support ticket**.",
        "Enter the ticket ID, subject and opened date. Add the closed date when it's resolved — status (Open / Closed) is derived from that.",
      ],
    },
  ],
  contacts: [
    {
      title: "Add a contact",
      steps: [
        "On the Site 360, open the **Contacts** tab and add a contact.",
        "Enter name, role (decision maker / approver / end user) and whether they've had Hipla training.",
      ],
    },
    {
      title: "Replace a contact",
      steps: [
        "Remove the contact — you'll be asked to **nominate a replacement**, so the site is never left with no one to reach.",
        "The removed contact moves to **Former contacts** (kept, not deleted).",
      ],
    },
  ],
  scope: [
    {
      title: "Log a scope change",
      steps: [
        "On the Site 360, open the **Scope** tab (Scope Changes).",
        "Add the change with a description and its impact (e.g. ‘timeline +2 weeks’).",
        "**Approve** or **Reject** it inline — the entry stays as an auditable record either way.",
      ],
    },
  ],
  agreements: [
    {
      title: "Upload a signed agreement",
      steps: [
        "On the Site 360, open the **Agreements** tab and click **Add Agreement**.",
        "Choose the agreement type and upload the file (up to ~4 MB).",
      ],
    },
  ],
  addresses: [
    {
      title: "Set a site's addresses",
      steps: [
        "On the Site 360, open the **Addresses** tab.",
        "Fill the three addresses — site / physical, **billing** (used on invoices) and **shipping** (used for hardware) — plus the GST number.",
      ],
    },
  ],
  licenses: [
    {
      title: "See a site's licenses",
      steps: [
        "On the Site 360, open the **Licenses** tab — it lists the modules from the site's POs. There's nothing to enter; fix it by fixing the PO.",
      ],
    },
  ],
  org360: [
    {
      title: "View a customer roll-up",
      steps: [
        "Open **Customers** in the sidebar and click the customer (the HQ).",
        "See its list of sites plus combined revenue, pending collection and portfolio counts. Click any site to open its Site 360.",
      ],
    },
  ],
  dashboards: [
    {
      title: "Use the home dashboard",
      steps: [
        "Click **Dashboard** in the sidebar.",
        "Filter by period / customer / product at the top.",
        "Read the KPI tiles (incl. **new-order value** and **renewal-done value** this FY) and the panels for overdue renewals, outstanding invoices, implementations and usage.",
      ],
    },
  ],
  settings: [
    {
      title: "Edit a dropdown / catalog list",
      steps: [
        "Click **Settings** in the sidebar and open the catalog you want (Modules, Hardware, PO / Cost types, Payment terms, Ticket topics, Term lengths, Agreement types).",
        "Add or edit an option — every screen that uses that dropdown updates.",
        "Two carry logic: **Payment terms** control invoice splitting, and **Term lengths** carry the renewal basis and percentages.",
      ],
    },
    {
      title: "Manage internal users",
      steps: ["Open **Settings → Users** to add or manage internal Hipla users."],
    },
  ],
};

export function proceduresFor(id: string): Procedure[] {
  return PROCEDURES[id] ?? [];
}
