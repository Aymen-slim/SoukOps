import { NextResponse } from "next/server";
import { z } from "zod";
import { CLONE_COOKIE, cloneSessionToken, credentialsMatch } from "@/lib/couriers/cloneSession";

const bodySchema = z.object({
  user: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(80),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "identifiants invalides" }, { status: 400 });
  if (!credentialsMatch(parsed.data.user, parsed.data.password)) {
    return NextResponse.json({ error: "identifiants refusés" }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(CLONE_COOKIE, cloneSessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}
