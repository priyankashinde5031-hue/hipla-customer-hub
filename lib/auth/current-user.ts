import { createClient } from "@/lib/supabase/server";

export type CurrentInternalUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "manager" | "cs_onboarding" | "read_only";
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
