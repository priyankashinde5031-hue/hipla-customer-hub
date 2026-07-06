import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 See Other so the browser follows up with a GET to /login. A default
  // (307) redirect would re-issue the POST to /login and get a 405.
  return NextResponse.redirect(new URL("/login", request.url), 303);
}
