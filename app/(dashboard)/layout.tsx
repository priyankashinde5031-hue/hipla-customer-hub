import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white px-4 py-6">
        <div className="px-2 text-sm font-semibold tracking-tight text-slate-900">
          Hipla Customer Hub
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          <Link
            href="/"
            className="rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Dashboard
          </Link>
          <Link
            href="/organizations"
            className="rounded-md px-2 py-1.5 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900"
          >
            Organizations
          </Link>
        </nav>

        <div className="mt-auto px-2">
          <p className="truncate text-xs text-slate-400">{data.user.email}</p>
          <form action="/auth/signout" method="post">
            <button
              type="submit"
              className="mt-1 text-xs font-medium text-indigo-600 hover:underline"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="flex-1 px-10 py-8">{children}</main>
    </div>
  );
}
