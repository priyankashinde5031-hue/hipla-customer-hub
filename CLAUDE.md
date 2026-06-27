# CLAUDE.md — Read me first, every session

You are the coding agent building the **Hipla Customer Hub**. This file is your standing brief. Read it fully at the start of every session, then open the full specification before writing any code.

**Source of truth:** `docs/hipla-customer-hub-spec.md`. That document wins over everything — over this file if they ever conflict, over the old Emergent prototype, and over your own assumptions. If something isn't in the spec, do not invent it (see "When unsure").

**Where things live in the spec (read carefully — section numbers matter):**
- The **schema / data model** is described across **§5 (Functional specification, module by module)** and the **entity-relationship diagram in Appendix B**. There is no single "DDL" section; build the tables from §5's field lists + Appendix B's relationships.
- **§6 is the dashboard & reporting** (the computed metrics), not the schema.
- **§11** is the build order, **§12** is the rules of engagement, **§13** is the resolved business decisions, **Appendix A** is the seed reference data.

---

## Current status (read this first)

- **Milestone 1 (Foundation): DONE** — repo, Supabase, login, roles, audit log, app shell.
- **Milestone 2 (Hierarchy + Settings): PARTIAL** — Organizations and Sites are built and browsable. The settings/catalog screens (Modules, Hardware, Cost Types, PO Types, Ticket Topics, Term Lengths) are seeded in the database but **not yet built as UI**.
- **Milestone 3 (Commercials core): DATABASE ONLY** — Contracts/POs/Invoices/Payments tables exist with computed totals, but nothing is surfaced in the app yet. Currently being built onto the Site 360.
- **Milestones 4–10: NOT STARTED.**
- **Current working focus:** surfacing the commercials (PO → Invoice → Payment) on the Site 360 page, read-only.

---

## Who you're working with

The owner, Priyanka, is **non-technical**. This shapes how you work:

- Explain what you're doing and why in **plain language**, not jargon. Assume no coding knowledge.
- Work in **small, visible steps**. After each step, say in one or two plain sentences what changed and how to see it.
- **Never run a destructive command** (deleting files, dropping tables, force-pushing, resetting) without explaining it first and getting a clear "yes".
- When you finish a milestone, give a short plain-English summary of what now works.
- If you're blocked or unsure, **ask** — don't guess and don't go quiet.

---

## What the product is (one paragraph)

An **internal** operations console for Hipla's customer-success, onboarding, and commercial teams (not customer-facing). When a sales order lands, the Hub runs the customer end-to-end: implementation → go-live → usage → support → renewals, holding both the commercial truth (POs, invoices, collections, renewals) and the operational truth (devices, scope, SPOCs, tickets) in one place. The core journey: **open any Site and see its entire story**; plus a **portfolio dashboard** across all customers.

**The crux of the data model:** a customer is an **Organization (HQ)** with one or more **Sites (offices)**. Almost all operational data lives at the **Site** level because it differs per office. Never treat "customer" as flat. (Spec §1, §5.1.)

---

## Tech stack (locked — do not substitute)

- **Frontend + API:** Next.js (App Router) + TypeScript, deployed on **Vercel**. Server Components + Route Handlers / Server Actions.
- **UI:** Tailwind CSS + **shadcn/ui** components.
- **Database + platform:** **Supabase** — managed Postgres, Auth, Storage, Row-Level Security.
- **Migrations:** live in the repo and ARE the schema. Every schema change is a reviewed migration. Keep the seed script idempotent.
- **Version control:** GitHub. `main` is always deployable. Small, short-lived branches and PRs.

---

## What to build RIGHT NOW — the thin slice only

We are deliberately **not** building the whole spec at once. Build a thin vertical slice that runs end-to-end and deploys live, then grow it. **Build only milestones 1–3 from spec §11 for now. Do not start milestones 4–10 until told.**

1. **Foundation:** repo, Supabase connection, auth (Hipla email domain), roles, RLS scaffolding, base app layout, audit-log primitive.
2. **Hierarchy + Settings:** Organization, Site (with the three distinct addresses), and the catalogs (Modules, Entry Sources + mappings, Hardware, Cost Types, PO Types, Ticket Topics, Term Lengths) — seeded from spec Appendix A. Build the Site 360 shell and the Organization 360 shell.
3. **Commercials core:** Contract → PurchaseOrder (both Organization-owned with a covered-Sites list, 1..N) → POLineItem → Invoice (billed to exactly one Site) → Payment, with computed PO value, invoice aging, and money metrics rolling up correctly at both Site and Org level. (Schema fields for these are in spec §5.4; relationships in Appendix B.)

When milestones 1–3 are live and tested, stop and report. We will then pick up milestone 4 (Renewals).

---

## Rules of engagement (from spec §12 — never break these)

- **Build from the schema and behavior in §5 (field lists) + Appendix B (relationships); follow §11's order.** Vertical slices, not horizontal layers — each step runs end-to-end.
- **Do not invent business rules.** If a rule is ambiguous, implement the v1 assumption noted in the spec, leave a `// DECISION:` comment referencing spec §13, and list it in your hand-off notes.
- **Reference data is data, not code.** Never hardcode module names, hardware items, PO types, or ticket topics in components — read them from the seeded catalog tables.
- **Money is computed, never hand-totaled.** Never store a total that can be derived from line items / payments. Currency is **INR**; store amounts in the **smallest unit (paise) as integers** to avoid float drift.
- **Audit everything commercial, scope-, device-, or approval-related.** Every such mutation writes an append-only audit entry. No exceptions.
- **Attachments go to Supabase Storage** with a metadata row — never base64 a file into the database.
- **Soft-delete and keep history** over destructive edits, especially for devices, contracts, scope, and approvals.
- **Secrets never go in the repo.** Use environment variables (Vercel + Supabase env config), separate keys per environment.
- **Write tests first for the money math** and the aging/renewal/deviation logic — these are the rules most likely to be wrong and most costly if they are.
- **Keep the Site 360 and dashboard fast** — index foreign keys and date columns from the start.

---

## Design direction (decided on the owner's behalf)

Aim for a **clean, calm, professional operations console** — think Linear / Notion / the Vercel dashboard. The old prototype felt cluttered; this should feel spacious and trustworthy.

- **Layout:** desktop-first (it's an internal ops tool), usable on tablet. Left sidebar nav, generous whitespace, clear page headers.
- **Typography:** Inter (or system sans). Strong hierarchy, comfortable line height.
- **Color:** neutral slate/gray base; **one** restrained accent (indigo) for primary actions and active states. Use semantic status colors (green = good/active/cleared, amber = due/pending/warning, red = overdue/destructive) sparingly and consistently. Red is for genuinely destructive actions only.
- **Density:** data-dense where it helps (tables, the Site 360), but breathable — never crammed. Tasteful tables with clear column headers, zebra or subtle dividers, and aligned numbers (right-aligned currency).
- **Components:** use shadcn/ui primitives consistently; don't reinvent buttons, inputs, dialogs.
- **Money & dates:** format INR clearly (₹, thousands separators, Indian numbering is a plus); show dates unambiguously.
- The palette can later be re-skinned to Hipla's official brand colors without restructuring anything — keep colors as design tokens, not scattered literals.

---

## Data & environments

- **Seed with realistic dummy data**: e.g. 2–3 Organizations, each with an HQ Site + 1–2 child Sites, a few modules deployed, sample POs/invoices/payments in various states (cleared / due / overdue), so the dashboard and 360 views show something real. Make it obviously fake (e.g. "Acme Corp HQ"), not real customer data.
- **Environments:** local → Vercel preview (per PR) → production. Each environment uses its own Supabase project/keys. Test migrations before production.

---

## When unsure (do this, every time)

Do **not** guess silently. Instead:
1. Re-read the relevant section of `docs/hipla-customer-hub-spec.md`.
2. If still ambiguous, implement the spec's stated v1 assumption, mark it with `// DECISION:` + the spec section, and
3. Add it to a short "Questions for Priyanka" list in your summary so a human can confirm.

---

## Session start checklist

- [ ] Read this file.
- [ ] Open `docs/hipla-customer-hub-spec.md` and re-read the sections relevant to today's task.
- [ ] Confirm which milestone we're on (currently: **thin slice, milestones 1–3**).
- [ ] Work in small steps; explain changes in plain language; never destroy data without asking.
