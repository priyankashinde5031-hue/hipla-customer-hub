import Link from "next/link";

export default function DashboardHome() {
  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Dashboard
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Under construction — start with{" "}
        <Link href="/organizations" className="font-medium text-indigo-600">
          Organizations
        </Link>
        .
      </p>
    </div>
  );
}
