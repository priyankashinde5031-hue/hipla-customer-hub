// Single source of truth for the 5 implementation stages: which fields each
// stage has, and which of them are required for the stage to be marked
// `complete`. Business rules live here (not in UI logic) so they can change
// without touching the stepper — this is the redesign spec's
// STAGE_REQUIRED_FIELDS, expanded to also drive field rendering.
//
// Imported by BOTH the server action (validation) and the client view
// (rendering + inline hints), so keep it a plain, dependency-free module.

export type FieldType =
  | "text" // single-line free text
  | "textarea" // multi-line free text
  | "number" // numeric (e.g. scope configured %)
  | "date" // calendar date
  | "yesno" // yes / no toggle, stored as "yes" | "no"
  | "toggle" // boolean flag, stored as true / false
  | "select" // one choice from `options`
  | "modules" // multi-select of purchased modules (module ids), from catalog
  | "spoc" // one of the site's active Spox contacts (spox id)
  | "file" // single file → attachment reference
  | "multifile" // several files → attachment references
  | "hardware"; // Stage 3 asset rows (special-cased in the view)

export type StageField = {
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  options?: { value: string; label: string }[];
};

export type StageDef = {
  number: number;
  key: string;
  title: string;
  description: string;
  fields: StageField[];
};

// A stored file field: metadata only, bytes live in Storage (CLAUDE.md).
export type FileValue = {
  attachmentId: string;
  filename: string;
  storagePath: string;
} | null;

// A Stage 3 asset row (kept in the stage jsonb; real device records live in the
// separate Hardware feature, linked from the view).
export type HardwareRow = {
  item: string;
  qty: number | string;
  note: string; // serial / Esper ID / free note
};

// Field lists follow spec §5.3 (stage-by-stage). Required-ness is NOT encoded
// on the field — some rules are compound ("quotation OR PO") — so it lives in
// missingRequiredFields() below.
export const STAGES: StageDef[] = [
  {
    number: 1,
    key: "sales_order",
    title: "Sales Order",
    description: "What was sold, to which site, and the paperwork behind it.",
    fields: [
      { key: "modulesPurchased", label: "Modules purchased", type: "modules" },
      { key: "hardwareByCustomer", label: "Hardware provided by customer", type: "text" },
      { key: "hardwareByHipla", label: "Hardware provided by Hipla", type: "text" },
      { key: "finalQuotation", label: "Final quotation", type: "file" },
      { key: "poAttachment", label: "PO attachment", type: "file" },
      { key: "paymentTerms", label: "Payment terms", type: "text" },
      { key: "siteAddress", label: "Site address", type: "textarea" },
      { key: "spoc", label: "SPOC (site contact)", type: "spoc" },
      { key: "connectedToOnboarding", label: "Connected to onboarding team", type: "yesno" },
      { key: "expectedDeliveryDate", label: "Expected delivery date", type: "date" },
    ],
  },
  {
    number: 2,
    key: "establish_contact",
    title: "Establish Contact",
    description: "First touch with the customer and scheduling the visit.",
    fields: [
      { key: "welcomeEmailSent", label: "Welcome email w/ credentials sent", type: "yesno" },
      { key: "scheduleDiscussed", label: "Schedule-to-visit discussed", type: "yesno" },
      { key: "proofOfSchedule", label: "Proof of schedule", type: "file" },
      { key: "connectedOnCall", label: "Connected with customer on call", type: "yesno" },
    ],
  },
  {
    number: 3,
    key: "hardware_provision",
    title: "Hardware Provision",
    description: "Devices supplied to the customer and welcome collateral.",
    fields: [
      { key: "notApplicable", label: "No hardware for this site (N/A)", type: "toggle" },
      { key: "hardwareRows", label: "Hardware provided", type: "hardware" },
      { key: "welcomeFlyerRequested", label: "Welcome flyer requested from designer", type: "yesno" },
      { key: "welcomeFlyerSent", label: "Welcome flyer sent", type: "yesno" },
    ],
  },
  {
    number: 4,
    key: "customer_onboarding",
    title: "Customer Onboarding",
    description: "Installation, training, scope config, and going live.",
    fields: [
      { key: "hardwareInstalledProof", label: "Hardware installed confirmation", type: "file" },
      { key: "trainingProof", label: "Training confirmation", type: "file" },
      { key: "scopeConfiguredPct", label: "Scope configured (%)", type: "number" },
      { key: "pendingItems", label: "Pending scope items", type: "textarea" },
      { key: "goLiveDate", label: "Go-live date", type: "date", help: "Anchors this site's renewal dates." },
      { key: "goLiveEmailProof", label: "Go-live email proof", type: "file" },
      { key: "liveSitePhotos", label: "Live site pictures", type: "multifile" },
    ],
  },
  {
    number: 5,
    key: "cs_handover",
    title: "Customer Success Handover",
    description: "Sign-off after go-live and the handover note to CS.",
    fields: [
      { key: "salesScopeSignoff", label: "Sales scope signoff (after go-live)", type: "textarea" },
      { key: "customerHandoverNote", label: "Customer handover note", type: "file" },
    ],
  },
];

export function getStage(stageNumber: number): StageDef | undefined {
  return STAGES.find((s) => s.number === stageNumber);
}

export type StageData = Record<string, unknown>;

function hasText(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
function hasFile(v: unknown): boolean {
  return !!v && typeof v === "object" && "attachmentId" in (v as object);
}
function isYes(v: unknown): boolean {
  return v === "yes";
}

// Returns the required fields still missing for this stage, as {key, label}.
// Empty array = all required fields present, so an explicit Save may mark the
// stage `complete`. Compound rules (quotation OR PO; hardware OR N/A) live here.
export function missingRequiredFields(
  stageNumber: number,
  data: StageData,
): { key: string; label: string }[] {
  const missing: { key: string; label: string }[] = [];
  const need = (key: string, label: string, ok: boolean) => {
    if (!ok) missing.push({ key, label });
  };

  switch (stageNumber) {
    case 1: {
      const modules = data.modulesPurchased;
      need(
        "modulesPurchased",
        "At least one module purchased",
        Array.isArray(modules) && modules.length > 0,
      );
      need(
        "finalQuotation",
        "Final quotation or PO attachment",
        hasFile(data.finalQuotation) || hasFile(data.poAttachment),
      );
      need("siteAddress", "Site address", hasText(data.siteAddress));
      break;
    }
    case 2: {
      need("welcomeEmailSent", "Welcome email sent = Yes", isYes(data.welcomeEmailSent));
      need("scheduleDiscussed", "Schedule discussed = Yes", isYes(data.scheduleDiscussed));
      break;
    }
    case 3: {
      const rows = data.hardwareRows;
      const hasRow =
        Array.isArray(rows) && rows.some((r) => r && hasText((r as HardwareRow).item));
      need(
        "hardwareRows",
        "At least one hardware row, or mark N/A",
        hasRow || data.notApplicable === true,
      );
      break;
    }
    case 4: {
      need("goLiveDate", "Go-live date", hasText(data.goLiveDate));
      need("goLiveEmailProof", "Go-live email proof", hasFile(data.goLiveEmailProof));
      break;
    }
    case 5: {
      need("salesScopeSignoff", "Sales scope signoff", hasText(data.salesScopeSignoff));
      break;
    }
  }
  return missing;
}

// True when a stage has ANY value entered — used to distinguish "not_started"
// (untouched) from "in_progress" (some data, required not all filled).
export function stageHasAnyValue(stageNumber: number, data: StageData): boolean {
  const stage = getStage(stageNumber);
  if (!stage) return false;
  return stage.fields.some((f) => {
    const v = data[f.key];
    if (v === undefined || v === null || v === "") return false;
    if (Array.isArray(v)) return v.length > 0;
    if (f.type === "toggle") return v === true;
    return true;
  });
}
