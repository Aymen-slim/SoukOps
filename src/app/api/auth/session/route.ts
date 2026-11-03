import { NextResponse } from "next/server";
import { resolveRequestMerchant } from "@/lib/auth/session";

export async function GET() {
  try {
    const merchant = await resolveRequestMerchant();
    if (!merchant) return NextResponse.json({ authenticated: false, kind: "guest" as const });
    return NextResponse.json({
      authenticated: true,
      kind: merchant.is_sandbox ? ("sandbox" as const) : ("seller" as const),
      name: merchant.name,
      slug: merchant.slug,
      isSandbox: merchant.is_sandbox,
    });
  } catch {
    return NextResponse.json({ authenticated: false, kind: "guest" as const });
  }
}
