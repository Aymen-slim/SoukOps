import { z } from "zod";
import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { createFdParcel, readFdEtat, takeEtatSlot } from "./fdMock";
import { isFdState, parcelFieldsSchema, type ParcelFields } from "./types";

const createResponseSchema = z.object({
  barcode: z.string().min(1),
  printUrl: z.string().min(1),
  waybillPath: z.string().min(1).optional(),
});

const etatResponseSchema = z.object({
  state: z.number().int(),
});

function fdBase(): string {
  const env = getServerEnv();
  return (env.FD_API_BASE_URL || `${env.APP_BASE_URL}/api/fd-mock/v2`).replace(/\/$/, "");
}

/** True when create/etat should hit the in-process mock (avoids the dev server calling itself). */
export function isLocalFdMock(): boolean {
  const env = getServerEnv();
  if (!env.FD_API_BASE_URL) return true;
  return env.FD_API_BASE_URL.replace(/\/$/, "") === `${env.APP_BASE_URL.replace(/\/$/, "")}/api/fd-mock/v2`;
}

function authHeaders(): HeadersInit {
  const token = getServerEnv().FD_API_TOKEN;
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

let nextEtatAt = 0;

async function paceEtat(): Promise<void> {
  const wait = nextEtatAt - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  nextEtatAt = Date.now() + 1000;
}

export async function createShipment(parcel: ParcelFields): Promise<{ barcode: string; printUrl: string; waybillPath: string }> {
  if (isLocalFdMock()) {
    return createFdParcel(createAdminClient(), parcel);
  }
  const res = await fetch(`${fdBase()}/create`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(parcel),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `FD create failed (${res.status})`);
  const parsed = createResponseSchema.parse(body);
  return {
    barcode: parsed.barcode,
    printUrl: parsed.printUrl,
    waybillPath: parsed.waybillPath ?? `${parsed.barcode}.pdf`,
  };
}

/** /etat at most once per second. Unknown state codes are refused. */
export async function getShipmentState(barcode: string): Promise<{ state: number }> {
  await paceEtat();
  if (isLocalFdMock()) {
    if (!takeEtatSlot()) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      if (!takeEtatSlot()) throw new Error("etat: maximum 1 requête par seconde");
    }
    const row = await readFdEtat(createAdminClient(), barcode);
    if (!row) throw new Error("code-barres inconnu");
    if (!isFdState(row.state)) throw new Error(`état FD inconnu: ${row.state}`);
    return row;
  }
  const res = await fetch(`${fdBase()}/etat?barcode=${encodeURIComponent(barcode)}`, { headers: authHeaders() });
  const body = await res.json().catch(() => null);
  if (res.status === 429) throw new Error("etat: maximum 1 requête par seconde");
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : `FD etat failed (${res.status})`);
  const parsed = etatResponseSchema.parse(body);
  if (!isFdState(parsed.state)) throw new Error(`état FD inconnu: ${parsed.state}`);
  return parsed;
}

export const fdCreateBodySchema = parcelFieldsSchema;
