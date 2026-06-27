"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [linkStatus, setLinkStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [linkError, setLinkError] = useState("");

  const [passwordStatus, setPasswordStatus] = useState<
    "idle" | "submitting" | "error"
  >("idle");
  const [passwordError, setPasswordError] = useState("");

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setLinkStatus("sending");
    setLinkError("");

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setLinkStatus("error");
      setLinkError(error.message);
      return;
    }

    setLinkStatus("sent");
  }

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

        <input
          type="email"
          required
          placeholder="you@hipla.io"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-6 w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
        />

        <form onSubmit={handlePasswordLogin} className="mt-3 flex flex-col gap-3">
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

        <div className="my-4 flex items-center gap-2 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          or
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {linkStatus === "sent" ? (
          <p className="text-sm text-slate-700">
            Check your inbox at <strong>{email}</strong> for a sign-in link.
          </p>
        ) : (
          <form onSubmit={handleMagicLink}>
            <button
              type="submit"
              disabled={linkStatus === "sending"}
              className="w-full text-sm font-medium text-indigo-600 hover:underline disabled:opacity-50"
            >
              {linkStatus === "sending"
                ? "Sending..."
                : "Email me a sign-in link instead"}
            </button>
            {linkStatus === "error" && (
              <p className="mt-2 text-sm text-red-600">{linkError}</p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
