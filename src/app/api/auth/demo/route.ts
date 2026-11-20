import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSandboxShop, resetSandboxShop } from "@/lib/auth/sandbox";
import {
  clearMerchantSessionCache,
  readSandboxId,
  resolveRequestMerchant,
  sandboxCookieOptions,
  SANDBOX_COOKIE,
  signSandbox,
  WORKSPACE_MODE_COOKIE,
  workspaceModeCookieOptions,
} from "@/lib/auth/session";
import { workspaceHomePath } from "@/lib/auth/workspace-routing";
import { PRO_CATEGORIES, WORKSPACE_MODES, type ProCategory, type WorkspaceMode } from "@/lib/pro/types";

const demoBodySchema = z
  .object({
    mode: z.enum(WORKSPACE_MODES).optional(),
    preset: z.enum(PRO_CATEGORIES).optional(),
  })
  .optional();

function withCookies(
  body: { ok: true; slug: string | null; workspaceMode: WorkspaceMode; proCategory: ProCategory | null; redirectTo: string },
  merchantId: string,
) {
  clearMerchantSessionCache();
  const response = NextResponse.json(body);
  response.cookies.set(SANDBOX_COOKIE, signSandbox(merchantId), sandboxCookieOptions());
  response.cookies.set(WORKSPACE_MODE_COOKIE, body.workspaceMode, workspaceModeCookieOptions());
  return response;
}

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => undefined);
    const parsed = demoBodySchema.safeParse(raw);
    const requestedMode: WorkspaceMode = parsed.success && parsed.data?.mode ? parsed.data.mode : "ecommerce";
    const requestedPreset: ProCategory | undefined = parsed.success ? parsed.data?.preset : undefined;

    const current = await resolveRequestMerchant();
    const matchesCurrent =
      current?.is_sandbox &&
      current.workspace_mode === requestedMode &&
      (!requestedPreset || current.pro_category === requestedPreset);

    if (matchesCurrent && current) {
      return withCookies(
        {
          ok: true,
          slug: current.slug,
          workspaceMode: current.workspace_mode,
          proCategory: current.pro_category,
          redirectTo: workspaceHomePath(current.workspace_mode),
        },
        current.id,
      );
    }

    const shop = await createSandboxShop({ mode: requestedMode, preset: requestedPreset });
    return withCookies(
      {
        ok: true,
        slug: shop.slug,
        workspaceMode: shop.workspace_mode,
        proCategory: shop.pro_category,
        redirectTo: workspaceHomePath(shop.workspace_mode),
      },
      shop.id,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not open the demo account";
    const hint = /column|schema|is_sandbox|reply_language/i.test(message)
      ? " Apply supabase/migrations/0004_seller_accounts.sql."
      : "";
    return NextResponse.json({ error: `${message}${hint}` }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const jar = await cookies();
    const id = readSandboxId(jar.get(SANDBOX_COOKIE)?.value);
    if (!id) return NextResponse.json({ error: "No demo account is open." }, { status: 400 });
    const shop = await resetSandboxShop(id);
    return withCookies(
      {
        ok: true,
        slug: shop.slug,
        workspaceMode: shop.workspace_mode,
        proCategory: shop.pro_category,
        redirectTo: workspaceHomePath(shop.workspace_mode),
      },
      shop.id,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reset the demo";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
