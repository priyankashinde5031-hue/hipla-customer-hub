import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ALLOWED_EMAIL_DOMAIN = "@hipla.io";
const PUBLIC_PATHS = ["/login", "/auth/callback", "/access-denied"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const { data } = await supabase.auth.getUser();
  const user = data.user;

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && !isPublicPath) {
    const email = user.email ?? "";

    if (!email.toLowerCase().endsWith(ALLOWED_EMAIL_DOMAIN)) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/access-denied";
      return NextResponse.redirect(url);
    }

    // Gate on a matching active internal_users row, regardless of whether
    // they signed in via magic link or password — both paths land here.
    const { data: internalUser } = await supabase
      .from("internal_users")
      .select("id, auth_user_id, is_active")
      .eq("email", email)
      .maybeSingle();

    if (!internalUser || !internalUser.is_active) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/access-denied";
      return NextResponse.redirect(url);
    }

    if (internalUser.auth_user_id !== user.id) {
      await supabase
        .from("internal_users")
        .update({ auth_user_id: user.id })
        .eq("id", internalUser.id);
    }
  }

  return supabaseResponse;
}
