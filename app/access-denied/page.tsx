export default function AccessDeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6 text-center">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">
        Access denied
      </h1>
      <p className="mt-2 max-w-sm text-sm text-slate-500">
        This account isn&apos;t set up for the Hipla Customer Hub. Contact an
        admin to be added, then try signing in again.
      </p>
      <a href="/login" className="mt-6 text-sm font-medium text-indigo-600">
        Back to login
      </a>
    </main>
  );
}
