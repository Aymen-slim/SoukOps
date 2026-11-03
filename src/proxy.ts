import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSandboxId } from "@/lib/auth/session";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some((cookie) => cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"));
}

function redirectToLogin(request: NextRequest, response: NextResponse): NextResponse {
  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.searchParams.set("next", request.nextUrl.pathname);
  const redirect = NextResponse.redirect(login);
  response.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

export async function proxy(request: NextRequest) {
  const sandbox = readSandboxId(request.cookies.get("wassalha_sandbox")?.value);
  if (sandbox) return NextResponse.next({ request });

  const authCookie = hasSupabaseAuthCookie(request);
  if (!authCookie) {
    return redirectToLogin(request, NextResponse.next({ request }));
  }

  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let hasSession = false;
  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    // Cookie read only. getUser() would call the Auth server before every dashboard navigation.
    // Route handlers still verify the user.
    try {
      const { data, error } = await supabase.auth.getSession();
      hasSession = !error && data.session != null;
    } catch {
      hasSession = false;
    }
  }

  if (!hasSession) return redirectToLogin(request, response);
  return response;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
