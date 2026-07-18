# Hipla Customer Hub

An **internal operations console** for Hipla's customer-success, onboarding, and commercial teams. Not customer-facing.

When a sales order lands, the Hub runs the customer end-to-end — implementation → go-live → usage → support → renewals — holding both the **commercial truth** (contracts, POs, invoices, collections, renewals) and the **operational truth** (devices, scope, SPOCs, tickets) in one place.

Two core journeys:
- **Site 360** — open any site and see its entire story.
- **Portfolio dashboard** — renewals due, collections vs pending, implementations in progress, across all customers.

---

## The one thing to understand first

**A customer is not a flat record.**

```
Organization (HQ, e.g. "Acme Corp Pvt Ltd")
  └── Site (office, e.g. "Acme Bengaluru HQ")
  └── Site (office, e.g. "Acme Pune Branch")
```

Almost all operational data lives at the **Site** level, because billing, product configuration, hardware, usage, and agreements differ per office. Contracts and POs are owned by the **Organization** but carry a list of the Sites they cover; an **Invoice** is always billed to exactly one Site.

Get this wrong and nothing else models correctly.

---

## The commercial chain

```
Contract → PurchaseOrder → POLineItem → Invoice → Payment
```

Two non-negotiable rules:

1. **Totals are always computed, never hand-stored.** PO value is the sum of its line items; invoice balance is total minus payments; status (due / overdue / part-paid / cleared) is derived from payments plus the due date. If a number can be derived, it is never stored.
2. **Money is stored as integer paise** (INR), never floats — avoids rounding drift. Convert to ₹ only for display.

---

## Tech stack

| Layer | Choice |
|---|---|
| Frontend + API | Next.js (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui (slate theme) |
| Database, auth, storage | Supabase (Postgres + RLS) |
| Hosting / CI-CD | Vercel |
| Version control | GitHub |

---

## Repository layout

```
├── CLAUDE.md                       # Standing brief for the AI coding agent — read first
├── docs/
│   └── hipla-customer-hub-spec.md  # THE SOURCE OF TRUTH (functional spec)
├── supabase/
│   ├── migrations/                 # The schema, as versioned SQL. The repo is the schema.
│   └── seed.sql                    # Reference catalogs + realistic dummy data
├── app/                            # Next.js routes and pages
├── components/                     # UI components
├── lib/                            # Supabase client and helpers
└── .env.example                    # Template of required env vars (no real values)
```

**`docs/hipla-customer-hub-spec.md` wins over everything.** Schema and behaviour live in §5 plus the ER diagram in Appendix B; §6 is the dashboard; §11 the build order; §12 the rules; §13 resolved decisions; Appendix A the seed reference data.

---

## Getting started

**Prerequisites:** Node.js 18+, Git, and access to the Supabase project.

```bash
git clone https://github.com/priyankashinde5031-hue/hipla-customer-hub.git
cd hipla-customer-hub
npm install
```

Create `.env.local` in the project root (never committed):

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

Two further values are used only for CLI/admin tasks from the terminal, never by the running app — keep them local and out of Vercel unless a feature genuinely needs them:

```
SUPABASE_SERVICE_ROLE_KEY=<admin key — powerful, handle with care>
SUPABASE_ACCESS_TOKEN=<Supabase CLI personal access token>
```

Run it:

```bash
npm run dev     # http://localhost:3000
npm run build   # production build
```

---

## Database & migrations

**The repo is the source of truth for the schema.** Never change tables by clicking around the Supabase dashboard — every schema change is a new migration file, reviewed and committed.

```bash
supabase link --project-ref <project-ref>
supabase db push                          # apply migrations
supabase db execute --linked --file supabase/seed.sql   # load seed data
```

The seed is idempotent and loads the Appendix A catalogs (modules, entry sources, hardware, cost types, PO types, ticket topics, term lengths) plus three fictional organizations with sites and one fully worked commercial example (contract → PO → two invoices, one paid and one overdue → one payment) so screens have something real to render.

---

## Environments & workflow

| Branch | Deploys to | Purpose |
|---|---|---|
| `staging` | Vercel preview URL | Build and test here |
| `main` | Production (`hipla-customer-hub.vercel.app`) | Always deployable |

**Anything merged to `main` goes live immediately.** The working rhythm:

```
build on staging → test on the preview URL → merge to main → live
```

Environment variables are set in Vercel for **both** Production and Preview — a variable missing from Preview will break staging deploys.

---

## Build order (milestones)

Built as thin vertical slices — data → read-only display → mutations — rather than whole milestones at once.

| # | Milestone | Status |
|---|---|---|
| 1 | Foundation — auth, roles, audit log, app shell | ✅ Done |
| 2 | Hierarchy + Settings — Organizations, Sites, catalogs | 🟡 In progress |
| 3 | Commercials core — Contract → PO → Invoice → Payment | 🟡 In progress |
| 4 | Renewals | ⬜ Not started |
| 5 | Customer users & usage tracking | ⬜ Not started |
| 6 | Hardware & device replacement | ⬜ Not started |
| 7 | Implementation projects | ⬜ Not started |
| 8 | Support tickets | ⬜ Not started |
| 9 | Scope changes | ⬜ Not started |
| 10 | Full portfolio dashboard | ⬜ Not started |

---

## Conventions

- **Reference data is data, not code.** Never hardcode module names, PO types, hardware items, or ticket topics — read them from the seeded catalog tables, managed via Settings.
- **Soft-delete over hard-delete.** Catalog items and records carry an `active` flag so historical records keep their references.
- **Audit everything commercial, scope-, device-, or approval-related.** Append-only, no exceptions.
- **Attachments go to Supabase Storage** with a metadata row — never base64 into the database.
- **Secrets never enter the repo.** `.env.local` is gitignored; use Vercel/Supabase env config, separate keys per environment.
- **Row-Level Security is on** for every table; access is scoped by the role on `internal_users`.

---

## Health check

Periodically (roughly every 5–6 merges to `main`), verify the project is in sync across all four places — local working copy, GitHub, Supabase, and the live app:

1. Working tree clean and fully pushed?
2. `main` and `staging` in sync?
3. Do the repo's migrations match what's actually applied in Supabase?
4. Does `.env.local` exist, gitignored, with the required variables also present in Vercel (Production **and** Preview)?
5. Does the app build cleanly?

Catching drift early is far cheaper than discovering it later.
