import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/roles";

export type CurrentInternalUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export async function getCurrentInternalUser(): Promise<CurrentInternalUser | null> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const email = auth.user?.email;
  if (!email) return null;

  const { data } = await supabase
    .from("internal_users")
    .select("id, email, name, role")
    .eq("email", email)
    .maybeSingle();

  return (data as CurrentInternalUser) ?? null;
}

export function canEditCatalogs(user: CurrentInternalUser | null): boolean {
  return user?.role === "admin" || user?.role === "manager";
}

// Managing staff accounts (and therefore roles) is admin-only. Mirrors the
// is_admin() RLS helper so the UI gate matches what the database enforces.
export function canManageUsers(user: CurrentInternalUser | null): boolean {
  return user?.role === "admin";
}
