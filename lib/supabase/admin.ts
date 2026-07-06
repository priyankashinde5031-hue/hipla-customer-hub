import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS and can call the Auth Admin API
// (create users, set passwords). SERVER-ONLY: the `server-only` import above
// makes the build fail if this is ever pulled into a client component, so the
// service-role key can never reach the browser. Use only inside Server Actions
// / Route Handlers, and never expose the returned client to the client.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
