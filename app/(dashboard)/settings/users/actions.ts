"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentInternalUser, canManageUsers } from "@/lib/auth/current-user";
import { USER_ROLES, type UserRole } from "@/lib/roles";

type ActionResult = { error?: string };
type Role = UserRole;

// A readable-but-strong temporary password: mixed case + digits, no ambiguous
// characters (0/O, 1/l/I) so it's easy to read aloud or paste. ~14 chars.
function generateTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(14);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

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

// Find a Supabase Auth user by email. supabase-js has no getUserByEmail, so we
// page through listUsers. Our staff list is tiny, but we cap the scan so a
// large auth table can never hang the request.
async function findAuthUserIdByEmail(
  admin: ReturnType<typeof createAdminClient>,
  email: string,
): Promise<string | null> {
  const target = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

type ResetResult = { error?: string; password?: string; email?: string };

// Admin-triggered password reset. Sets a fresh temporary password on the
// person's login account and returns it ONCE so the admin can hand it over.
// The password is never stored or written to the audit log — we only record
// that a reset happened, by whom, for whom.
export async function resetUserPassword(id: string): Promise<ResetResult> {
  const actor = await getCurrentInternalUser();
  if (!canManageUsers(actor)) return { error: "Only admins can reset passwords." };

  // Password reset needs the service-role key. If it isn't configured on the
  // server (e.g. not set in Vercel), fail with a clear message instead of
  // letting the admin client throw and crash the page.
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error:
        "Password reset isn't configured on the server yet. Add SUPABASE_SERVICE_ROLE_KEY in Vercel (Production + Preview) and redeploy.",
    };
  }

  // The admin check has passed, so run the privileged read + write with the
  // service-role client. This avoids depending on RLS to fetch another staff
  // member's row, and is the client we need for the Auth Admin API anyway.
  const admin = createAdminClient();
  const { data: user } = await admin
    .from("internal_users")
    .select("id, email, name, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!user) return { error: "User not found." };

  const tempPassword = generateTempPassword();

  try {
    // Resolve the person's REAL Auth account. The stored auth_user_id can be
    // stale (e.g. the auth user was removed), so we verify it exists; if not,
    // we look it up by email. Either can come back empty for someone who has
    // never signed in — in that case we create the login account.
    let authId: string | null = null;
    if (user.auth_user_id) {
      const { data: byId } = await admin.auth.admin.getUserById(user.auth_user_id);
      if (byId?.user) authId = byId.user.id;
    }
    if (!authId) authId = await findAuthUserIdByEmail(admin, user.email);

    if (authId) {
      const { error } = await admin.auth.admin.updateUserById(authId, {
        password: tempPassword,
        email_confirm: true,
      });
      if (error) return { error: error.message };
    } else {
      // No login account yet — create one with the temporary password so they
      // can sign in immediately.
      const { data: created, error } = await admin.auth.admin.createUser({
        email: user.email,
        password: tempPassword,
        email_confirm: true,
      });
      if (error || !created?.user) {
        return { error: error?.message ?? "Could not create the login account." };
      }
      authId = created.user.id;
    }

    // Keep the stored link pointing at the real Auth account.
    if (authId && authId !== user.auth_user_id) {
      await admin.from("internal_users").update({ auth_user_id: authId }).eq("id", id);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not reset the password." };
  }

  // Audit the event — but never the password itself.
  const supabase = await createClient();
  await writeAudit(supabase, actor!.id, "password_reset", id, null, {
    email: user.email,
  });

  return { password: tempPassword, email: user.email };
}
