import { NextResponse } from "next/server";
import { createSandboxShop, resetSandboxShop } from "@/lib/auth/sandbox";
import {
  clearMerchantSessionCache,
  readSandboxId,
  resolveRequestMerchant,
  sandboxCookieOptions,
  SANDBOX_COOKIE,
  signSandbox,
} from "@/lib/auth/session";
import { cookies } from "next/headers";

function withCookie(body: { ok: true; slug: string | null }, merchantId: string) {
  clearMerchantSessionCache();
  const response = NextResponse.json(body);
  response.cookies.set(SANDBOX_COOKIE, signSandbox(merchantId), sandboxCookieOptions());
  return response;
}

export async function POST() {
  try {
    const current = await resolveRequestMerchant();
    if (current?.is_sandbox) {
      return withCookie({ ok: true, slug: current.slug }, current.id);
    }
    const shop = await createSandboxShop();
    return withCookie({ ok: true, slug: shop.slug }, shop.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not open the demo account";
    const hint = /column|schema|is_sandbox|reply_language/i.test(message)
      ? " Apply supabase/migrations/0004_seller_accounts.sql."
      : "";
    return NextResponse.json({ error: `${message}.${hint}` }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const jar = await cookies();
    const id = readSandboxId(jar.get(SANDBOX_COOKIE)?.value);
    if (!id) return NextResponse.json({ error: "No demo account is open." }, { status: 400 });
    const shop = await resetSandboxShop(id);
    return withCookie({ ok: true, slug: shop.slug }, shop.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reset the demo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
