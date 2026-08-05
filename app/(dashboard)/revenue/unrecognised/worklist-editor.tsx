"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setLineItemRecognition } from "../../sites/[id]/revenue-actions";
import type { RecognitionMethod } from "@/lib/revenue-engine";

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "— pick method —" },
  { value: "saas", label: "SaaS — Renewal" },
  { value: "capex", label: "Capex — 80/20" },
  { value: "opex", label: "Opex — Spread" },
  { value: "one_time", label: "One-Time — Full" },
];

const inputClass =
  "rounded-md border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

// Inline method + coverage editor used on the /revenue/unrecognised worklist, so
// the whole historical backfill can be done from one screen (spec §9). siteId is
// the PO's origin site — the same action powers the PO Revenue tab, and it
// revalidates that site; here we also refresh the worklist so the row drops off.
export function WorklistLineEditor({
  lineItemId,
  siteId,
  initialMethod,
  initialCoverage,
}: {
  lineItemId: string;
  siteId: string;
  initialMethod: RecognitionMethod | null;
  initialCoverage: number;
}) {
  const [method, setMethod] = useState<RecognitionMethod | null>(initialMethod);
  const [coverage, setCoverage] = useState<number>(initialCoverage ?? 12);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function save(nextMethod: RecognitionMethod | null, nextCoverage: number) {
    startTransition(async () => {
      const res = await setLineItemRecognition({
        lineItemId,
        siteId,
        method: nextMethod,
        coverageMonths: nextCoverage,
      });
      if (res.error) {
        toast.error(res.error);
        setMethod(initialMethod);
        setCoverage(initialCoverage ?? 12);
      } else {
        toast.success("Saved.");
        router.refresh(); // re-run the worklist query so a fixed row drops off
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      <select
        className={inputClass}
        value={method ?? ""}
        disabled={pending}
        onChange={(e) => {
          const next = (e.target.value || null) as RecognitionMethod | null;
          setMethod(next);
          save(next, coverage);
        }}
      >
        {METHOD_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        aria-label="Coverage months"
        className={`${inputClass} w-16 text-right`}
        value={coverage}
        disabled={pending || method === "one_time"}
        onChange={(e) => setCoverage(Math.max(1, Number(e.target.value) || 1))}
        onBlur={() => {
          if (coverage !== (initialCoverage ?? 12)) save(method, coverage);
        }}
      />
      <span className="text-xs text-slate-400">mo</span>
    </div>
  );
}
