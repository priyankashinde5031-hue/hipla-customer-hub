"use client";

import { usePathname, useRouter } from "next/navigation";

// A single "← Back" control shown on every page except the Dashboard home.
// Lives in the dashboard layout so every page gets it automatically — there is
// no per-page markup to keep in sync. Uses browser history so it always
// returns to wherever you actually came from.
export function BackButton() {
  const pathname = usePathname();
  const router = useRouter();

  // The Dashboard home is the top of the app — nothing to go back to.
  if (pathname === "/") return null;

  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="mb-4 inline-flex items-center gap-1 rounded text-sm text-indigo-600 hover:text-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-2"
    >
      ← Back
    </button>
  );
}
