"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "submitting" | "error"
  >("idle");
  const [passwordError, setPasswordError] = useState("");

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus("submitting");
    setPasswordError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setPasswordStatus("error");
      setPasswordError(error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">
          Hipla Customer Hub
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Internal staff login — @hipla.io emails only.
        </p>

        <form onSubmit={handlePasswordLogin} className="mt-6 flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@hipla.io"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
          <Button type="submit" disabled={passwordStatus === "submitting"}>
            {passwordStatus === "submitting" ? "Signing in..." : "Sign in"}
          </Button>
          {passwordStatus === "error" && (
            <p className="text-sm text-red-600">{passwordError}</p>
          )}
        </form>
      </div>
    </main>
  );
}
