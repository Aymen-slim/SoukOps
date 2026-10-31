import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { CLONE_COOKIE, cloneSessionToken } from "@/lib/couriers/cloneSession";

export async function GET() {
  const jar = await cookies();
  if (jar.get(CLONE_COOKIE)?.value !== cloneSessionToken()) {
    return NextResponse.json({ error: "session requise" }, { status: 401 });
  }
  return NextResponse.json({ ok: true });
}
