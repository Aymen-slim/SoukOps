import { NextResponse } from "next/server";
import { z } from "zod";
import { getPersona } from "@/lib/sim/personas";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ persona: z.enum(["new", "returning", "bad"]).default("new") });

/** Creates a simulator conversation for a persona against the demo merchant. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "invalid body" }, { status: 400 });

  const supabase = createAdminClient();
  const { data: merchant, error: merchantError } = await supabase
    .from("merchants")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .single();
  if (merchantError || !merchant) {
    return NextResponse.json({ error: "no merchant seeded (run npm run seed:catalog)" }, { status: 500 });
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
