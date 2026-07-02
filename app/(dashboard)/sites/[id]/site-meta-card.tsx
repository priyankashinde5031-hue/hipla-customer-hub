"use client";

import { useState } from "react";
import {
  SiteFormDialog,
  type SiteInitial,
} from "@/app/(dashboard)/organizations/[id]/site-form";

type Option = { id: string; name: string };

// One metadata field: its label, the display value (already formatted), and
// whether it's empty (so we can offer "Add" instead of an em-dash).
type Field = { label: string; display: string; empty: boolean };

export function SiteMetaCard({
  organizationId,
  siteId,
  canEdit,
  ownerOptions,
  regionDisplay,
  timezoneDisplay,
  gstDisplay,
  goLiveDisplay,
  onboardingOwnerDisplay,
  csOwnerDisplay,
  initial,
}: {
  organizationId: string;
  siteId: string;
  canEdit: boolean;
  ownerOptions: Option[];
  regionDisplay: string;
  timezoneDisplay: string;
  gstDisplay: string;
  goLiveDisplay: string;
  onboardingOwnerDisplay: string;
  csOwnerDisplay: string;
  initial: SiteInitial;
}) {
  const [open, setOpen] = useState(false);

  const fields: Field[] = [
    { label: "Region", display: regionDisplay, empty: !regionDisplay },
    { label: "Timezone", display: timezoneDisplay, empty: !timezoneDisplay },
    { label: "GST number", display: gstDisplay, empty: !gstDisplay },
    { label: "Go-live date", display: goLiveDisplay, empty: !goLiveDisplay },
    {
      label: "Onboarding owner",
      display: onboardingOwnerDisplay,
      empty: !onboardingOwnerDisplay,
    },
    { label: "CS owner", display: csOwnerDisplay, empty: !csOwnerDisplay },
  ];

  return (
    <>
      <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Site details
          </h2>
          {canEdit && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
            >
              Edit
            </button>
          )}
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-x-8 gap-y-4 text-sm">
          {fields.map((f) => (
            <div key={f.label}>
              <dt className="text-xs uppercase tracking-wide text-slate-500">
                {f.label}
              </dt>
              <dd className="mt-1 text-slate-900">
                {f.empty ? (
                  canEdit ? (
                    <button
                      type="button"
                      onClick={() => setOpen(true)}
                      className="text-slate-400 hover:text-indigo-600"
                    >
                      + Add
                    </button>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )
                ) : (
                  f.display
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      {open && (
        <SiteFormDialog
          open={open}
          onClose={() => setOpen(false)}
          organizationId={organizationId}
          ownerOptions={ownerOptions}
          mode="edit"
          siteId={siteId}
          initial={initial}
        />
      )}
    </>
  );
}
