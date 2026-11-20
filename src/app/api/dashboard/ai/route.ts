import { NextResponse } from "next/server";
import { z } from "zod";
import { saveWorkspaceAiControls } from "@/lib/context/ai-controls";
import { requireMerchant } from "@/lib/dashboard/guard";
import { isReplyLanguage } from "@/lib/pipeline/seller-voice";

const bodySchema = z.object({
  replyLanguage: z.enum(["derja", "ar", "fr", "en"]).optional(),
  aiInstructions: z.string().trim().max(2000),
});

export async function GET() {
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  return NextResponse.json({
    replyLanguage: isReplyLanguage(gate.merchant.reply_language) ? gate.merchant.reply_language : "derja",
    aiInstructions: gate.merchant.ai_instructions,
  });
}

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI voice settings." }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;

  const patch: Record<string, unknown> = {
    ai_instructions: parsed.data.aiInstructions,
  };
  if (parsed.data.replyLanguage) {
    patch.reply_language = parsed.data.replyLanguage;
  }

  const { error } = await gate.supabase
    .from("merchants")
    .update(patch)
    .eq("id", gate.merchant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (parsed.data.replyLanguage) {
    await saveWorkspaceAiControls(gate.supabase, gate.merchant.id, {
      primaryLanguage: parsed.data.replyLanguage,
    }).catch(() => undefined);
  }

  return NextResponse.json({ ok: true });
}
