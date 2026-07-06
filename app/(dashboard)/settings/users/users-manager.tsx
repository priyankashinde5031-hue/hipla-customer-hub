"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, KeyRound, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { USER_ROLES } from "@/lib/roles";
import { createUser, updateUser, setUserActive, resetUserPassword } from "./actions";

export type StaffUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
};

const roleLabel = (role: string) =>
  USER_ROLES.find((r) => r.value === role)?.label ?? role;

const selectClass =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MIN_PASSWORD_LENGTH = 8;

// A readable random suggestion for the "Generate" button — no ambiguous
// characters (0/O, 1/l/I) so it's easy to read out or type.
function suggestPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export function UsersManager({
  users,
  canManage,
  currentUserId,
}: {
  users: StaffUser[];
  canManage: boolean;
  currentUserId: string | null;
}) {
  const [dialogUser, setDialogUser] = useState<StaffUser | null | "new">(null);
  const [resetTarget, setResetTarget] = useState<StaffUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const close = () => setDialogUser(null);

  // Open the reset dialog pre-filled with a random suggestion the admin can
  // keep, edit, or replace with their own password.
  function openReset(u: StaffUser) {
    setNewPassword(suggestPassword());
    setResetTarget(u);
  }

  function confirmReset() {
    if (!resetTarget) return;
    const target = resetTarget;
    const password = newPassword.trim();
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast.error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    startTransition(async () => {
      const result = await resetUserPassword(target.id, password);
      if (result.error || !result.password) {
        toast.error(result.error ?? "Could not reset the password.");
        return;
      }
      setResetTarget(null);
      setCopied(false);
      setResetResult({ email: result.email ?? target.email, password: result.password });
    });
  }

  async function copyPassword() {
    if (!resetResult) return;
    try {
      await navigator.clipboard.writeText(resetResult.password);
      setCopied(true);
      toast.success("Password copied.");
    } catch {
      toast.error("Couldn't copy — select and copy it manually.");
    }
  }

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const result =
        dialogUser === "new"
          ? await createUser(formData)
          : await updateUser((dialogUser as StaffUser).id, formData);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(dialogUser === "new" ? "User added." : "User updated.");
      close();
    });
  }

  function toggleActive(u: StaffUser) {
    startTransition(async () => {
      const result = await setUserActive(u.id, !u.is_active);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(u.is_active ? "User deactivated." : "User activated.");
    });
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button
            className="h-9 gap-1.5 bg-indigo-600 px-4 text-sm text-white hover:bg-indigo-700"
            onClick={() => setDialogUser("new")}
          >
            <Plus className="size-4" />
            Add user
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Name
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Email
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Role
              </TableHead>
              <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Status
              </TableHead>
              {canManage && <TableHead className="text-xs font-medium uppercase tracking-wide text-gray-500" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => (
              <TableRow key={u.id} className={!u.is_active ? "opacity-50" : ""}>
                <TableCell className="text-slate-700">
                  {u.name}
                  {u.id === currentUserId && (
                    <span className="ml-2 text-xs text-slate-400">(you)</span>
                  )}
                </TableCell>
                <TableCell className="text-slate-600">{u.email}</TableCell>
                <TableCell className="text-slate-700">{roleLabel(u.role)}</TableCell>
                <TableCell>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      u.is_active
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {u.is_active ? "Active" : "Inactive"}
                  </span>
                </TableCell>
                {canManage && (
                  <TableCell>
                    <div className="flex items-center justify-end gap-3">
                      <Button variant="ghost" size="sm" onClick={() => setDialogUser(u)}>
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5 text-slate-600"
                        disabled={isPending}
                        onClick={() => openReset(u)}
                      >
                        <KeyRound className="size-3.5" />
                        Reset password
                      </Button>
                      <Switch
                        checked={u.is_active}
                        disabled={isPending || u.id === currentUserId}
                        onCheckedChange={() => toggleActive(u)}
                      />
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {users.length === 0 && (
          <p className="px-4 py-6 text-sm text-slate-500">
            No users yet{canManage ? " — add the first one above." : "."}
          </p>
        )}
      </div>

      <Dialog open={dialogUser !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialogUser === "new" ? "Add user" : "Edit user"}</DialogTitle>
            <DialogDescription>
              Staff accounts sign in with their Hipla email. Role controls their
              permissions.
            </DialogDescription>
          </DialogHeader>

          <form action={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">
                Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                name="name"
                required
                defaultValue={dialogUser && dialogUser !== "new" ? dialogUser.name : ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">
                Email <span className="text-red-500">*</span>
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                defaultValue={dialogUser && dialogUser !== "new" ? dialogUser.email : ""}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="role">
                Role <span className="text-red-500">*</span>
              </Label>
              <select
                id="role"
                name="role"
                required
                defaultValue={dialogUser && dialogUser !== "new" ? dialogUser.role : ""}
                className={selectClass}
              >
                <option value="" disabled>
                  Select role
                </option>
                {USER_ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
              <Button type="button" variant="outline" onClick={close}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isPending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                {isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Step 1 — confirm the reset */}
      <Dialog
        open={resetTarget !== null}
        onOpenChange={(open) => !open && setResetTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset password</DialogTitle>
            <DialogDescription>
              Set a new password for <strong>{resetTarget?.name}</strong> (
              {resetTarget?.email}). Their current password (if any) stops
              working immediately. Type your own or use the generated one.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-password">New password</Label>
            <div className="flex items-center gap-2">
              <Input
                id="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => setNewPassword(suggestPassword())}
              >
                Generate
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              At least {MIN_PASSWORD_LENGTH} characters. You&apos;ll see it once
              more on the next screen to copy and share.
            </p>
          </div>

          <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
            <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isPending || newPassword.trim().length < MIN_PASSWORD_LENGTH}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={confirmReset}
            >
              {isPending ? "Setting…" : "Set password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 2 — show the generated password once */}
      <Dialog
        open={resetResult !== null}
        onOpenChange={(open) => !open && setResetResult(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Temporary password</DialogTitle>
            <DialogDescription>
              Share this with <strong>{resetResult?.email}</strong>. It&apos;s
              shown only once — copy it now. Ask them to sign in and change it.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
            <code className="flex-1 font-mono text-base tracking-wide text-slate-900">
              {resetResult?.password}
            </code>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={copyPassword}
            >
              {copied ? <Check className="size-4 text-green-600" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <DialogFooter className="-mx-0 -mb-0 border-t-0 bg-transparent p-0 pt-2">
            <Button
              type="button"
              className="bg-indigo-600 text-white hover:bg-indigo-700"
              onClick={() => setResetResult(null)}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
