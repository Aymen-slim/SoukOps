import { NextResponse } from "next/server";
import { z } from "zod";
import { requireMerchant } from "@/lib/dashboard/guard";
import { isReplyLanguage } from "@/lib/pipeline/seller-voice";

const bodySchema = z.object({
  replyLanguage: z.enum(["derja", "ar", "fr", "en"]),
  aiInstructions: z.string().trim().max(400),
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
  if (!parsed.success) return NextResponse.json({ error: "Pick a language template." }, { status: 400 });
  const gate = await requireMerchant();
  if ("error" in gate) return gate.error;
  const { error } = await gate.supabase
    .from("merchants")
    .update({
      reply_language: parsed.data.replyLanguage,
      ai_instructions: parsed.data.aiInstructions,
    })
    .eq("id", gate.merchant.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
