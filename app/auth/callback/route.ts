import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALLOWED_EMAIL_DOMAIN = "@hipla.io";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const email = data.user.email ?? "";

  if (!email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/access-denied`);
  }

  // Link this Supabase Auth account to its pre-provisioned internal_users
  // row (added by an admin ahead of time) so role-based access works.
  const { data: internalUser } = await supabase
    .from("internal_users")
    .select("id, is_active")
    .eq("email", email)
    .maybeSingle();

  if (!internalUser || !internalUser.is_active) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/access-denied`);
  }

  await supabase
    .from("internal_users")
    .update({ auth_user_id: data.user.id })
    .eq("id", internalUser.id);

  return NextResponse.redirect(`${origin}/`);
}
