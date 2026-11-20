import { NextResponse } from "next/server";
import { resolveRequestMerchant, WORKSPACE_MODE_COOKIE, workspaceModeCookieOptions } from "@/lib/auth/session";

export async function GET() {
  try {
    const merchant = await resolveRequestMerchant();
    if (!merchant) return NextResponse.json({ authenticated: false, kind: "guest" as const });
    const response = NextResponse.json({
      authenticated: true,
      kind: merchant.is_sandbox ? ("sandbox" as const) : ("seller" as const),
      name: merchant.name,
      slug: merchant.slug,
      isSandbox: merchant.is_sandbox,
      workspaceMode: merchant.workspace_mode,
      proCategory: merchant.pro_category,
    });
    response.cookies.set(WORKSPACE_MODE_COOKIE, merchant.workspace_mode, workspaceModeCookieOptions());
    return response;
  } catch {
    return NextResponse.json({ authenticated: false, kind: "guest" as const });
  }
}
