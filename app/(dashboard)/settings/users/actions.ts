"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canManageUsers } from "@/lib/auth/current-user";
import { USER_ROLES, type UserRole } from "@/lib/roles";

type ActionResult = { error?: string };
type Role = UserRole;

const VALID_ROLES = new Set<string>(USER_ROLES.map((r) => r.value));
// Loose email shape check — the login flow enforces the Hipla domain; here we
// only guard against obvious typos so an unreachable account isn't created.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function writeAudit(
  supabase: Awaited<ReturnType<typeof createClient>>,
  actorId: string,
  action: string,
  entityId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
) {
  await supabase.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: "internal_user",
    entity_id: entityId,
    before,
    after,
  });
}

function parse(formData: FormData): { name: string; email: string; role: string } {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: String(formData.get("role") ?? "").trim(),
  };
}

export async function createUser(formData: FormData): Promise<ActionResult> {
  const actor = await getCurrentInternalUser();
  if (!canManageUsers(actor)) return { error: "Only admins can manage users." };

  const { name, email, role } = parse(formData);
  if (!name) return { error: "Enter the person's name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!VALID_ROLES.has(role)) return { error: "Choose a role." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("internal_users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (existing) return { error: "A user with this email already exists." };

  const row = { name, email, role: role as Role };
  const { data: inserted, error } = await supabase
    .from("internal_users")
    .insert(row)
    .select("id")
    .single();
  if (error || !inserted) return { error: error?.message ?? "Could not add the user." };

  await writeAudit(supabase, actor!.id, "create", inserted.id, null, row);
  revalidatePath("/settings/users");
  return {};
}

export async function updateUser(id: string, formData: FormData): Promise<ActionResult> {
  const actor = await getCurrentInternalUser();
  if (!canManageUsers(actor)) return { error: "Only admins can manage users." };

  const { name, email, role } = parse(formData);
  if (!name) return { error: "Enter the person's name." };
  if (!EMAIL_RE.test(email)) return { error: "Enter a valid email address." };
  if (!VALID_ROLES.has(role)) return { error: "Choose a role." };

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("internal_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "User not found." };

  const { data: clash } = await supabase
    .from("internal_users")
    .select("id")
    .ilike("email", email)
    .neq("id", id)
    .maybeSingle();
  if (clash) return { error: "A user with this email already exists." };

  const row = { name, email, role: role as Role };
  const { error } = await supabase.from("internal_users").update(row).eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(supabase, actor!.id, "update", id, before, { ...before, ...row });
  revalidatePath("/settings/users");
  return {};
}

// Deactivate / reactivate a staff account. We keep the row (history, audit
// trail, existing references as approver/owner) rather than deleting it.
export async function setUserActive(id: string, isActive: boolean): Promise<ActionResult> {
  const actor = await getCurrentInternalUser();
  if (!canManageUsers(actor)) return { error: "Only admins can manage users." };
  if (actor!.id === id && !isActive) {
    return { error: "You can't deactivate your own account." };
  }

  const supabase = await createClient();
  const { data: before } = await supabase
    .from("internal_users")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { error: "User not found." };

  const { error } = await supabase
    .from("internal_users")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) return { error: error.message };

  await writeAudit(supabase, actor!.id, "update", id, before, {
    ...before,
    is_active: isActive,
  });
  revalidatePath("/settings/users");
  return {};
}
