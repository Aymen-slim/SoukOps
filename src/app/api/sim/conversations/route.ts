import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopBySlug, getDemoMerchant } from "@/lib/dashboard/merchant";
import { getPersona } from "@/lib/sim/personas";
import { simulatorGuard } from "@/lib/security/simulatorGuard";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({
  persona: z.enum(["new", "returning", "bad"]).default("new"),
  slug: z.string().trim().min(2).max(48).nullable().optional(),
});

/** Creates a simulator conversation for a persona against the demo merchant. */
export async function POST(request: Request) {
  const blocked = simulatorGuard(request, "sim-conversations", 30);
  if (blocked) return blocked;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createAdminClient();
  const slug = parsed.data.slug ?? null;
  const merchant = slug ? await getShopBySlug(supabase, slug) : await getDemoMerchant(supabase);
  if (!merchant) {
    return NextResponse.json({ error: "no merchant seeded (run npm run seed:catalog)" }, { status: slug ? 404 : 500 });
  }

  // A shop's own demo stores the buyer the seller types in chat, not a preset persona.
  if (slug) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ merchant_id: merchant.id, name: null, phone: null })
      .select("id")
      .single();
    if (customerError || !customer) {
      return NextResponse.json({ error: `customer create failed: ${customerError?.message}` }, { status: 500 });
    }
    const { data: conversation, error: convError } = await supabase
      .from("conversations")
      .insert({ merchant_id: merchant.id, customer_id: customer.id, channel: "simulator" })
      .select("id")
      .single();
    if (convError || !conversation) {
      return NextResponse.json({ error: `conversation create failed: ${convError?.message}` }, { status: 500 });
    }
    return NextResponse.json({
      conversationId: conversation.id,
      persona: "new",
      customerName: null,
      phone: null,
    });
  }

  const persona = getPersona(parsed.data.persona);
  const { data: existingCustomer } = await supabase
    .from("customers")
    .select("id")
    .eq("merchant_id", merchant.id)
    .eq("phone", persona.phone)
    .maybeSingle();

  let customerId = existingCustomer?.id as string | undefined;
  if (!customerId) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .insert({ merchant_id: merchant.id, name: persona.customerName, phone: persona.phone })
      .select("id")
      .single();
    if (customerError || !customer) {
      return NextResponse.json({ error: `customer create failed: ${customerError?.message}` }, { status: 500 });
    }
    customerId = customer.id;
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .insert({ merchant_id: merchant.id, customer_id: customerId, channel: "simulator" })
    .select("id")
    .single();
  if (convError || !conversation) {
    return NextResponse.json({ error: `conversation create failed: ${convError?.message}` }, { status: 500 });
  }

  return NextResponse.json({
    conversationId: conversation.id,
    persona: persona.id,
    customerName: persona.customerName,
    phone: persona.phone,
  });
}
