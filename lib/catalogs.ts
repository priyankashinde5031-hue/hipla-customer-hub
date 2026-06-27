// Settings catalogs registry (CLAUDE.md: "reference data is data, not
// code"). One config per seeded catalog table drives one shared UI pattern
// (list / add / edit / deactivate) instead of seven bespoke pages.

export type CatalogField = {
  key: string;
  label: string;
  type: "text" | "number" | "select";
  required: boolean;
  options?: string[];
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
    description: "Categories used to classify PO line items.",
    uniqueField: "name",
    fields: [{ key: "name", label: "Name", type: "text", required: true }],
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
];

export function getCatalogBySlug(slug: string): CatalogConfig | undefined {
  return CATALOGS.find((c) => c.slug === slug);
}
