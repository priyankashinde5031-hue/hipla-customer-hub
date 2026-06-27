import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Hipla Customer Hub
      </h1>
      <p className="mt-3 text-sm text-slate-500">
        Under construction — nothing to see here yet.
      </p>
      <p className="mt-6 text-xs text-slate-400">
        Signed in as {data.user.email}
      </p>
      <form action="/auth/signout" method="post" className="mt-2">
        <button
          type="submit"
          className="text-xs font-medium text-indigo-600 hover:underline"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
