import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSandboxId } from "@/lib/auth/session";
import { resolveWorkspaceRedirect, WORKSPACE_MODE_COOKIE } from "@/lib/auth/workspace-routing";

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

function enforceWorkspaceTrack(request: NextRequest, response: NextResponse): NextResponse {
  const modeCookie = request.cookies.get(WORKSPACE_MODE_COOKIE)?.value;
  const target = resolveWorkspaceRedirect(request.nextUrl.pathname, modeCookie);
  if (!target) return response;
  const dest = request.nextUrl.clone();
  dest.pathname = target;
  dest.search = "";
  const redirect = NextResponse.redirect(dest);
  response.cookies.getAll().forEach((cookie) => {
    redirect.cookies.set(cookie);
  });
  return redirect;
}

export async function proxy(request: NextRequest) {
  const sandbox = readSandboxId(request.cookies.get("wassalha_sandbox")?.value);
  if (sandbox) {
    return enforceWorkspaceTrack(request, NextResponse.next({ request }));
  }

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
    // Cookie read only. Route handlers still verify the user via getUser().
    try {
      const { data, error } = await supabase.auth.getSession();
      hasSession = !error && data.session != null;
    } catch {
      hasSession = false;
    }
  }

  if (!hasSession) return redirectToLogin(request, response);
  return enforceWorkspaceTrack(request, response);
}

export const config = {
  matcher: ["/dashboard/:path*", "/pro/:path*"],
};
