import { redirect } from "next/navigation";

// /revenue → the MRR page is the primary Revenue view (the unrecognised
// worklist is reachable from a chip there and from its own URL).
export default function RevenueIndex() {
  redirect("/revenue/mrr");
}
