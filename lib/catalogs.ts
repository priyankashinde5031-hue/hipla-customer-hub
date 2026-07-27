// Settings catalogs registry (CLAUDE.md: "reference data is data, not
// code"). One config per seeded catalog table drives one shared UI pattern
// (list / add / edit / deactivate) instead of seven bespoke pages.

import { RENEWAL_LOGIC } from "@/lib/renewals";
import { COST_RECURRENCE } from "@/lib/cost-types";

export type CatalogField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  required: boolean;
  options?: string[];
  // Show this field only when another field's value is one of `in`. Used e.g.
  // to reveal Escalation % only for escalating renewal terms. When hidden, the
  // field is not submitted and its column is cleared to null.
  showWhen?: { field: string; in: string[] };
};

export type CatalogConfig = {
  slug: string;
  table: string;
  label: string;
  singular: string;
  description: string;
  uniqueField: string;
  fields: CatalogField[];
  hasModuleMapping?: boolean;
};

export const CATALOGS: CatalogConfig[] = [
  {
    slug: "modules",
    table: "modules",
    label: "Modules",
    singular: "Module",
    description: "Product modules that can be deployed at a Site.",
    uniqueField: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "short_code", label: "Short code", type: "text", required: false },
      { key: "description", label: "Description", type: "text", required: false },
    ],
  },
  {
    slug: "entry-sources",
    table: "entry_sources",
    label: "Entry Sources",
    singular: "Entry Source",
    description: "Where a patient/customer entry originated. Each can map to one or more Modules.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
    hasModuleMapping: true,
  },
  {
    slug: "hardware",
    table: "hardware_catalog",
    label: "Hardware",
    singular: "Hardware item",
    description: "Devices that can be deployed at a Site.",
    uniqueField: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      {
        key: "category",
        label: "Category",
        type: "select",
        required: true,
        options: ["Tablet", "Mount", "Accessory"],
      },
    ],
  },
  {
    slug: "cost-types",
    table: "cost_types",
    label: "Cost Types",
    singular: "Cost Type",
    description:
      "Categories used to classify PO line items. Billing basis decides ARR and revenue recognition: recurring values spread over 12 months from go-live; one-time values are recognised in full in the go-live month.",
    uniqueField: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      {
        key: "recurrence",
        label: "Billing basis",
        type: "select",
        required: true,
        options: [COST_RECURRENCE.recurring, COST_RECURRENCE.oneTime],
      },
    ],
  },
  {
    slug: "products",
    table: "products",
    label: "Products",
    singular: "Product",
    description:
      "The catalogue of things that can be purchased on a PO line item — the “what is being purchased” list.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "product-categories",
    table: "product_categories",
    label: "Product Categories",
    singular: "Product Category",
    description:
      "How a PO line item is classified — e.g. Software, Hardware, Change Request.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "renewal-terms",
    table: "renewal_terms",
    label: "Renewal Terms",
    singular: "Renewal Term",
    description:
      "The renewal basis for a PO line item — e.g. Annually — 12% escalation, Hardware — one-time, Hardware with AMC.",
    uniqueField: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      {
        key: "logic",
        label: "Renewal logic",
        type: "select",
        required: true,
        options: [
          RENEWAL_LOGIC.escalation,
          RENEWAL_LOGIC.flat,
          RENEWAL_LOGIC.oneTime,
          RENEWAL_LOGIC.amc,
        ],
      },
      {
        key: "escalation_pct",
        label: "Escalation % (per year)",
        type: "number",
        required: false,
        showWhen: { field: "logic", in: [RENEWAL_LOGIC.escalation] },
      },
      {
        key: "amc_pct",
        label: "AMC % (of line total)",
        type: "number",
        required: false,
        showWhen: { field: "logic", in: [RENEWAL_LOGIC.amc] },
      },
    ],
  },
  {
    slug: "po-types",
    table: "po_types",
    label: "PO Types",
    singular: "PO Type",
    description: "Types of Purchase Orders raised against a Contract.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "renewal-po-types",
    table: "renewal_po_types",
    label: "Renewal PO Types",
    singular: "Renewal PO Type",
    description: "Types of Purchase Order raised for a renewal year — recorded on the renewal card.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "ticket-topics",
    table: "ticket_topics",
    label: "Ticket Topics",
    singular: "Ticket Topic",
    description: "Topics used to classify support tickets.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "term-lengths",
    table: "term_lengths",
    label: "Term Lengths",
    singular: "Term Length",
    description: "Contract term lengths, e.g. 1 year, 3 years.",
    uniqueField: "label",
    fields: [
      { key: "label", label: "Label", type: "text", required: true },
      { key: "months", label: "Months", type: "number", required: true },
    ],
  },
  {
    slug: "financial-years",
    table: "financial_years",
    label: "Financial Years",
    singular: "Financial Year",
    description: "Financial years selectable on a Purchase Order, e.g. FY2025-26.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  // NOTE: "Payment Terms" is intentionally NOT a generic catalog — it carries
  // a split definition (per-year count or milestone %s) and a billing-schedule
  // day count, so it has its own editor at /settings/payment-terms.
  {
    slug: "contract-times",
    table: "contract_times",
    label: "Contract Times",
    singular: "Contract Time",
    description: "Contract durations selectable on a Purchase Order, e.g. 1 year.",
    uniqueField: "name",
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "months", label: "Length in months", type: "number", required: true },
    ],
  },
  {
    slug: "internal-teams",
    table: "internal_teams",
    label: "Internal Teams",
    singular: "Internal Team",
    description:
      "Hipla teams that can own a customer relationship — the “internal owner” on a Spox contact.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "spox-roles",
    table: "spox_roles",
    label: "Spox Roles",
    singular: "Spox Role",
    description:
      "The role a customer contact plays — the grouping and label used on the Spox card.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
  {
    slug: "agreement-types",
    table: "agreement_types",
    label: "Agreement Types",
    singular: "Agreement Type",
    description:
      "Kinds of agreement stored against a Site, e.g. NDA, Service Agreement, PO Agreement, Addendum.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
  },
];

export function getCatalogBySlug(slug: string): CatalogConfig | undefined {
  return CATALOGS.find((c) => c.slug === slug);
}
