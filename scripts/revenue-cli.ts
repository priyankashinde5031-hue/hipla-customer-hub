// Revenue engine command-line runner (spec §7, §13).
//
//   npx tsx scripts/revenue-cli.ts backfill    # rebuild the whole ledger
//   npx tsx scripts/revenue-cli.ts recompute   # nightly status refresh
//
// Run with the project env sourced so it has the service-role key:
//   set -a && source .env.local && set +a && npx tsx scripts/revenue-cli.ts backfill
//
// SAFETY: writes only to the revenue_schedule table. Reads existing tables to
// resolve anchors; never edits, moves, or deletes any customer-entered row.

import { createClient } from "@supabase/supabase-js";
import { backfillAllSchedules } from "../lib/revenue-schedule";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Run: set -a && source .env.local && set +a && npx tsx scripts/revenue-cli.ts <cmd>",
    );
    process.exit(1);
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function main() {
  const cmd = process.argv[2];
  const db = client();

  if (cmd === "backfill") {
    console.log("Rebuilding the revenue ledger from every line item + renewal…");
    const res = await backfillAllSchedules(db);
    console.log(
      `Done. ${res.lineItems} line items + ${res.renewals} renewals → ${res.rows} schedule rows.`,
    );
    return;
  }

  if (cmd === "recompute") {
    // Status is event-driven now (recognised once live / renewed), so there is
    // nothing time-based to recompute — a full rebuild is the reconcile op.
    console.log("Rebuilding the revenue ledger (status is event-driven)…");
    const res = await backfillAllSchedules(db);
    console.log(
      `Done. ${res.lineItems} line items + ${res.renewals} renewals → ${res.rows} schedule rows.`,
    );
    return;
  }

  console.error(`Unknown command "${cmd ?? ""}". Use "backfill" or "recompute".`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
