import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPaise } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import { getRenewalsDoneDetail } from "@/lib/fy-bookings";

// Drill-down for the "Renewal done value · FY" dashboard tile: every renewal
// marked "renewed" whose received date falls inside the current financial year,
// with the customer, the renewal value, and the date it was received. Whole
// portfolio, newest first.
export default async function RenewalsDonePage() {
  const supabase = await createClient();
  const data = await getRenewalsDoneDetail(supabase);

  return (
    <div>
      <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
        Renewals done · {data.fyLabel}
      </h1>
      <p className="mt-1 text-sm text-slate-500">{data.windowLabel}</p>

      <div className="mt-4 rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
          Total renewal done value
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
          {formatPaise(data.totalPaise)}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          {data.rows.length} {data.rows.length === 1 ? "renewal" : "renewals"} closed
        </p>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {data.rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">No renewals closed this financial year.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Customer</th>
                <th className="px-4 py-2 text-left font-medium">PO</th>
                <th className="px-4 py-2 text-left font-medium">Received</th>
                <th className="px-4 py-2 text-right font-medium">Renewal value</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 text-gray-900">{r.customer}</td>
                  <td className="px-4 py-2 text-slate-600">{r.label}</td>
                  <td className="px-4 py-2 text-slate-600">{formatDate(r.date)}</td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums text-gray-900">
                    {formatPaise(r.valuePaise)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.organizationId ? (
                      <Link
                        href={`/organizations/${r.organizationId}`}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        Open →
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
