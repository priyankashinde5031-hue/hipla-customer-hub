# Hipla Customer Hub — Design System Spec

> **Purpose:** Single source of truth for all UI decisions in this repo.
> Claude Code: read this file before building or modifying any UI. Every color, font, spacing, and component decision must derive from this spec. If a new pattern is needed, extend this file first, then implement.

---

## 1. Design identity

**Product:** Internal B2B customer-lifecycle hub (POs, renewals, licenses, implementation, support) for Hipla's enterprise clients.

**Personality:** "Ledger, not dashboard." Calm, editorial, precise — like a well-kept account book. The serif display type is the brand signature; everything else stays quiet and disciplined. No gradients, no glassmorphism, no decorative illustration.

**Audience:** Internal team (CS, sales, delivery). Optimize for scanning dense financial/status data quickly, not for marketing appeal.

---

## 2. Color tokens

Define in `globals.css` as CSS variables and mirror in `tailwind.config` as semantic names. Never use raw Tailwind palette classes (`text-red-600`) in components — always the semantic token.

### Neutrals (ink scale)

| Token | Hex | Usage |
|---|---|---|
| `--color-paper` | `#FDFDFB` | Page background (warm off-white, not pure white) |
| `--color-surface` | `#FFFFFF` | Cards, tables, popovers |
| `--color-border` | `#E7E5E0` | Default borders, dividers |
| `--color-border-strong` | `#D6D3CC` | Table header rules, input borders |
| `--color-ink-muted` | `#8A867D` | Section labels, secondary text, empty states |
| `--color-ink-soft` | `#57534A` | Body text, table cells |
| `--color-ink` | `#1C1A17` | Headings, primary values, amounts |

### Accent

| Token | Hex | Usage |
|---|---|---|
| `--color-accent` | `#1E3A8A` | Primary buttons, links, active nav (deep indigo — matches existing link color) |
| `--color-accent-hover` | `#16307A` | Hover state |
| `--color-accent-soft` | `#EEF2FB` | Selected rows, active nav background, chips |

One accent only. Do not introduce a second brand color.

### Status colors (semantic, used ONLY in badges, dots, and metric tinting)

| Token | Base | Soft bg | Usage |
|---|---|---|---|
| `--status-live` | `#15803D` | `#EBF6EF` | Live sites, collected payments, renewed |
| `--status-progress` | `#1D4ED8` | `#EDF2FD` | New PO, onboarding, in-progress |
| `--status-warning` | `#B45309` | `#FBF3E7` | Pending invoice/payment, renewal ≤ 90 days |
| `--status-danger` | `#B91C1C` | `#FBEDED` | Outstanding > 0, expired, churned, renewal ≤ 30 days |
| `--status-neutral` | `#6B7280` | `#F3F4F5` | Paused, draft, unknown |

Rule: status color appears on the badge/dot/border only — never as full-card fills or large areas.

---

## 3. Typography

Two families via `next/font`. No third family, no italics except in empty-state hints.

| Role | Face | Where |
|---|---|---|
| **Display** | `Source Serif 4` via `next/font` (`--font-serif`, Tailwind `font-serif`) | Page titles, section headings, org/site names only |
| **Data/UI** | `Geist` via `next/font` (`--font-sans`, the default), tabular figures globally (`html { tabular-nums }`) | Everything else: table cells, metrics, labels, badges, buttons, forms, sidebar |

### Type scale

| Token | Size / weight / tracking | Usage |
|---|---|---|
| `type-page-title` | serif 30px / 600 | "Acme Corp - Pune Office" |
| `type-section` | serif 20px / 600 | "PO & Payments", "Licenses" |
| `type-label` | sans 11px / 500 / `tracking-wide uppercase` / `ink-muted` | Field labels, table headers, card labels |
| `type-metric` | sans 24px / 600 / `tabular-nums` / `ink` | Metric card values |
| `type-body` | sans 14px / 400 / `ink-soft` | Default text, table cells |
| `type-caption` | sans 12px / 400 / `ink-muted` | Timestamps, helper text, context lines |

Rules:
- All ₹ amounts and dates: `tabular-nums`, right-aligned in tables.
- ₹ formatting: `new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })` for whole amounts; 2 decimals only when paise exist.
- Dates: `30 Jun 2026` format (`d MMM yyyy` via date-fns). Never ISO in UI.

---

## 4. Spacing, radius, elevation

- **Spacing unit:** 4px base. Section vertical rhythm: `py-8` between sections, `p-5` inside cards, `gap-4` in grids. No section padding above `py-10`.
- **Radius:** `--radius-card: 12px` (cards, tables), `--radius-control: 8px` (buttons, inputs), `--radius-badge: 9999px` (pills).
- **Elevation:** flat by default. Cards: `border border-[--color-border]` + `shadow-sm`. Only popovers/modals get `shadow-lg`. No hover-lift shadows on static cards.
- **Max content width:** `max-w-[1200px]` centered, `px-8`.

---

## 5. Core components

### 5.1 StatusBadge
Pill, `radius-badge`, `text-xs font-medium`, soft bg + base text color from status tokens, `px-2.5 py-0.5`.
Variants map:
- Site: `live` (with 6px pulsing dot), `onboarding` → progress, `paused` → neutral, `churned` → danger
- PO: `new_po` → progress, `new_po_on_invoice` → warning, `renewed` → live, `pending_payment` → warning, `expired` → danger
One badge component, variant-driven. No ad-hoc colored spans.

### 5.2 DataTable (POs, hardware, tickets)
- Semantic `<table>`, sticky `<thead>` with `type-label` headers and `border-b border-border-strong`.
- Rows: `h-12`, `hover:bg-[--color-accent-soft]/40`, full row clickable, `cursor-pointer`.
- Amount column: right-aligned, `tabular-nums`, `ink`, `font-medium`.
- Row actions (Edit): icon button, visible on row hover / focus-within only.
- Empty table → EmptyState component (5.4), never a bare "no rows".

### 5.3 MetricCard
Label (`type-label`) → value (`type-metric`) → context line (`type-caption`).
Context line is mandatory (e.g. "Collected 0% of invoiced", "3 active POs", "Next renewal Jan 2027").
Conditional tint: Outstanding > 0 → value in `--status-danger`; fully collected → `--status-live`. Zero-because-empty → show "No invoices yet" caption instead of ₹0.00 as the hero value.

### 5.4 EmptyState
Centered in card: muted lucide icon (20px), one-line description (`type-caption`), ghost button "+ Add {thing}". Copy pattern: state what's missing + the action, e.g. "No billing address yet. + Add address". Never "Not recorded yet." as a dead end.

### 5.5 Buttons
- Primary: `bg-accent text-white h-9 px-4 text-sm rounded-[--radius-control]`, plus-icon for create actions.
- Secondary: `border border-border-strong bg-surface`.
- Ghost: text-accent, transparent, used in empty states and inline "Add".
- All: `focus-visible:ring-2 ring-accent/40 ring-offset-2`.

### 5.6 Sidebar
- 240px expanded / 64px collapsed (persisted in localStorage).
- Items: lucide icon + label, active = `bg-accent-soft text-accent` + 3px left accent bar.
- Footer: avatar initials circle + email + sign out.
- "Recent sites" list (last 5) under Organizations.

### 5.7 Sticky sub-header
Appears after 120px scroll: breadcrumb (Org → Site) + StatusBadge + anchor nav with scroll-spy. `sticky top-0 backdrop-blur-sm bg-[--color-paper]/85 border-b border-border`.

### 5.8 Skeleton & Toast
- Skeletons: shimmer on `--color-border` base, match final layout shape. Every async section renders a skeleton, never blank.
- Toasts: sonner, bottom-right; success uses `--status-live`, error uses `--status-danger`. Toast verb matches the button verb ("Saved", not "Success!").

---

## 6. Signature element

The one memorable device: **the renewal timeline rail**. On each site page (and later PO detail), a thin horizontal rail showing the 5-year PO→renewal cycle — PO date, go-live, each renewal milestone as ticks, "today" as an accent marker, next renewal labeled with countdown. Serif for the milestone year labels, sans for dates. This is the only place allowed a touch of expressive design; keep everything else per spec.

---

## 7. Interaction & accessibility floor

- Keyboard: every interactive element reachable, visible focus ring, `Esc` closes modals.
- `prefers-reduced-motion`: disable the pulsing Live dot and shimmer.
- Motion budget: 150–200ms ease-out transitions on hover/route only. No scroll-triggered animation in this product.
- Hit targets ≥ 36px.
- Contrast: all text on paper/surface must pass WCAG AA (the ink scale above does).

## 8. Copy rules

- Sentence case everywhere except `type-label` (uppercase by CSS, not in source).
- Buttons say the outcome: "Add PO", "Save changes", "Mark collected".
- Errors state what happened + how to fix: "Couldn't save the PO — check the amount field." Never "Something went wrong."
- Consistent nouns: Organization → Site → PO → License. Never mix "client/customer/account" in UI.

## 9. Do-not list

- No second accent color, no gradients, no glass effects.
- No emoji in UI.
- No raw hex or raw Tailwind palette classes in components — tokens only.
- No ISO dates, no unformatted numbers.
- No new card style variants — one card recipe (Section 4).
- No "Coming soon" full-size cards; upcoming modules live in one collapsed accordion.
