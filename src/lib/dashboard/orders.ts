import { createAdminClient } from "@/lib/supabase/admin";
import type { JobResult } from "@/lib/couriers/types";

type Admin = ReturnType<typeof createAdminClient>;

export interface QueueJob {
  id: string;
  status: string;
  diffs: string[];
  screenshotUrl: string | null;
  error: string | null;
}

export interface QueueOrder {
  id: string;
  status: string;
  totalMillimes: number;
  subtotalMillimes: number;
  discountMillimes: number;
  deliveryFeeMillimes: number;
  riskScore: number | null;
  riskLevel: string | null;
  riskReasons: string[];
  customerName: string | null;
  phone: string | null;
  designation: string | null;
  cropUrl: string | null;
  lat: number | null;
  lng: number | null;
  landmark: string | null;
  governorate: string | null;
  floor: string | null;
  driverNote: string | null;
  conversationId: string | null;
  job: QueueJob | null;
  shipment: { barcode: string; printUrl: string; fdState: number | null } | null;
  dispatchReconfirm: { status: string; orderId: string } | null;
  createdAt: string;
}

export interface TranscriptLine {
  id: string;
  direction: string;
  body: string;
  createdAt: string;
}

interface OrderRow {
  id: string;
  status: string;
  total_millimes: number;
  subtotal_millimes: number;
  discount_millimes: number;
  delivery_fee_millimes: number;
  risk_score: number | null;
  risk_level: string | null;
  risk_reasons: unknown;
  customer_id: string | null;
  address_id: string | null;
  conversation_id: string | null;
  created_at: string;
}

function asStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function messagePreview(kind: string, body: string | null): string {
  if (!body) {
    if (kind === "image") return "Image";
    if (kind === "audio") return "Vocal";
    return "";
  }
  if (kind === "buttons" || kind === "pin_link") {
    try {
      const parsed = JSON.parse(body) as { text?: string };
      return parsed.text ?? body;
    } catch {
      return body;
    }
  }
  return body;
}

async function sign(supabase: Admin, bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

async function hydrate(supabase: Admin, rows: OrderRow[]): Promise<QueueOrder[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const customerIds = [...new Set(rows.map((row) => row.customer_id).filter((id): id is string => Boolean(id)))];
  const addressIds = [...new Set(rows.map((row) => row.address_id).filter((id): id is string => Boolean(id)))];

  const conversationIds = [...new Set(rows.map((row) => row.conversation_id).filter((id): id is string => Boolean(id)))];
  const [{ data: items }, { data: jobs }, { data: shipments }, { data: customers }, { data: addresses }, { data: conversations }] = await Promise.all([
    supabase.from("order_items").select("order_id, product_id, name_snapshot").in("order_id", ids),
    supabase
      .from("courier_jobs")
      .select("id, order_id, status, screenshot_path, result, created_at")
      .in("order_id", ids)
      .order("created_at", { ascending: false }),
    supabase.from("shipments").select("order_id, barcode, fd_state").in("order_id", ids),
    customerIds.length
      ? supabase.from("customers").select("id, name, phone").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string | null }[] }),
    addressIds.length
      ? supabase.from("addresses").select("id, lat, lng, landmark, governorate, floor, driver_note").in("id", addressIds)
      : Promise.resolve({ data: [] as { id: string; lat: number | null; lng: number | null; landmark: string | null; governorate: string | null; floor: string | null; driver_note: string | null }[] }),
    conversationIds.length
      ? supabase.from("conversations").select("id, slots").in("id", conversationIds)
      : Promise.resolve({ data: [] as Array<{ id: string; slots: Record<string, unknown> | null }> }),
  ]);

  const productIds = [...new Set((items ?? []).map((item) => item.product_id).filter((id): id is string => Boolean(id)))];
  const { data: images } = productIds.length
    ? await supabase.from("product_images").select("product_id, crop_path").in("product_id", productIds).eq("is_primary", true)
    : { data: [] as { product_id: string; crop_path: string | null }[] };

  const cropByProduct = new Map<string, string | null>();
  for (const image of images ?? []) {
    if (!cropByProduct.has(image.product_id as string)) cropByProduct.set(image.product_id as string, image.crop_path as string | null);
  }

  const signedCrops = new Map<string, string | null>();
  await Promise.all(
    [...cropByProduct.entries()].map(async ([productId, cropPath]) => {
      signedCrops.set(productId, await sign(supabase, "crops", cropPath));
    }),
  );

  return Promise.all(
    rows.map(async (row) => {
      const item = (items ?? []).find((entry) => entry.order_id === row.id);
      const job = (jobs ?? []).find((entry) => entry.order_id === row.id);
      const shipment = (shipments ?? []).find((entry) => entry.order_id === row.id);
      const customer = (customers ?? []).find((entry) => entry.id === row.customer_id);
      const address = (addresses ?? []).find((entry) => entry.id === row.address_id);
      const result = (job?.result ?? null) as JobResult | null;
      const productId = (item?.product_id as string | null) ?? null;
      return {
        id: row.id,
        status: row.status,
        totalMillimes: row.total_millimes,
        subtotalMillimes: row.subtotal_millimes,
        discountMillimes: row.discount_millimes,
        deliveryFeeMillimes: row.delivery_fee_millimes,
        riskScore: row.risk_score,
        riskLevel: row.risk_level,
        riskReasons: asStrings(row.risk_reasons),
        customerName: (customer?.name as string | null) ?? null,
        phone: (customer?.phone as string | null) ?? null,
        designation: (item?.name_snapshot as string | null) ?? null,
        cropUrl: productId ? (signedCrops.get(productId) ?? null) : null,
        lat: (address?.lat as number | null) ?? null,
        lng: (address?.lng as number | null) ?? null,
        landmark: (address?.landmark as string | null) ?? null,
        governorate: (address?.governorate as string | null) ?? null,
        floor: (address?.floor as string | null) ?? null,
        driverNote: (address?.driver_note as string | null) ?? null,
        conversationId: row.conversation_id,
        job: job
          ? {
              id: job.id as string,
              status: job.status as string,
              diffs: asStrings(result?.diffs),
              screenshotUrl: await sign(supabase, "waybills", (job.screenshot_path as string | null) ?? null),
              error: result?.error ?? null,
            }
          : null,
        shipment: shipment?.barcode
          ? {
              barcode: shipment.barcode as string,
              printUrl: `/api/fd-mock/v2/waybill/${shipment.barcode as string}`,
              fdState: (shipment.fd_state as number | null) ?? null,
            }
          : null,
        dispatchReconfirm: (() => {
          const conversation = (conversations ?? []).find((entry) => entry.id === row.conversation_id);
          const raw = (conversation?.slots as Record<string, unknown> | undefined)?.dispatchReconfirm as
            | { status?: unknown; orderId?: unknown }
            | undefined;
          return raw && typeof raw.status === "string" && raw.orderId === row.id
            ? { status: raw.status, orderId: row.id }
            : null;
        })(),
        createdAt: row.created_at,
      };
    }),
  );
}

const ORDER_COLUMNS =
  "id, status, total_millimes, subtotal_millimes, discount_millimes, delivery_fee_millimes, risk_score, risk_level, risk_reasons, customer_id, address_id, conversation_id, created_at";

export async function loadOrderQueue(supabase: Admin, merchantId: string): Promise<QueueOrder[]> {
  const filtered = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("merchant_id", merchantId)
    .neq("status", "CANCELLED")
    .is("hidden_at", null)
    .order("created_at", { ascending: false })
    .limit(40);
  if (!filtered.error) return hydrate(supabase, (filtered.data ?? []) as OrderRow[]);
  if (!/hidden_at/i.test(filtered.error.message)) throw new Error(filtered.error.message);
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("merchant_id", merchantId)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(error.message);
  return hydrate(supabase, (data ?? []) as OrderRow[]);
}

export async function loadOrderDetail(
  supabase: Admin,
  merchantId: string,
  orderId: string,
): Promise<(QueueOrder & { messages: TranscriptLine[] }) | null> {
  const { data, error } = await supabase
    .from("orders")
    .select(ORDER_COLUMNS)
    .eq("merchant_id", merchantId)
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const [order] = await hydrate(supabase, [data as OrderRow]);
  if (!order) return null;
  if (!order.conversationId) return { ...order, messages: [] };
  const { data: messages } = await supabase
    .from("messages")
    .select("id, direction, kind, body, created_at")
    .eq("conversation_id", order.conversationId)
    .order("created_at", { ascending: true })
    .limit(40);
  return {
    ...order,
    messages: (messages ?? []).map((message) => ({
      id: message.id as string,
      direction: message.direction as string,
      body: messagePreview(message.kind as string, message.body as string | null),
      createdAt: message.created_at as string,
    })),
  };
}
