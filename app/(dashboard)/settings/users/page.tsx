import { createClient } from "@/lib/supabase/server";
import { getCurrentInternalUser, canManageUsers } from "@/lib/auth/current-user";
import { UsersManager, type StaffUser } from "./users-manager";

export default async function UsersPage() {
  const supabase = await createClient();
  const user = await getCurrentInternalUser();
  const canManage = canManageUsers(user);

  const { data: users, error } = await supabase
    .from("internal_users")
    .select("id, name, email, role, is_active")
    .order("name");

  return (
    <div>
      <h1 className="text-2xl font-serif font-semibold tracking-tight text-gray-900">
        Users
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Hipla staff who can log in. Their role drives what they can see and edit,
        and they populate approver / owner dropdowns across the Hub.
      </p>

      {error && (
        <p className="mt-6 text-sm text-red-600">
          Could not load users: {error.message}
        </p>
      )}

      <div className="mt-6">
        <UsersManager
          users={(users ?? []) as StaffUser[]}
          canManage={canManage}
          currentUserId={user?.id ?? null}
        />
      </div>
    </div>
  );
}
