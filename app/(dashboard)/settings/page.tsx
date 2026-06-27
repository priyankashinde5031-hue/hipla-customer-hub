import Link from "next/link";
import { CATALOGS } from "@/lib/catalogs";

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Settings
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage the shared reference-data catalogs used across the Hub.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4">
        {CATALOGS.map((catalog) => (
          <Link
            key={catalog.slug}
            href={`/settings/catalogs/${catalog.slug}`}
            className="rounded-lg border border-slate-200 bg-white p-4 hover:border-indigo-300 hover:shadow-sm"
          >
            <h2 className="text-sm font-medium text-slate-900">{catalog.label}</h2>
            <p className="mt-1 text-xs text-slate-500">{catalog.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
