// Staff roles (spec §9). Kept in a server-free module so both server code
// (actions, RLS-facing helpers) and client components (the User Management
// dropdown) can import it without pulling in the server-only Supabase client.

export type UserRole = "admin" | "manager" | "cs_onboarding" | "read_only";

export const USER_ROLES: { value: UserRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "manager", label: "Manager" },
  { value: "cs_onboarding", label: "CS / Onboarding" },
  { value: "read_only", label: "Read-only" },
];
