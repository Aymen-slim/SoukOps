import { NextResponse } from "next/server";
import { z } from "zod";
import { requestCanUseFd } from "@/lib/couriers/cloneSession";
import { readFdEtat, takeEtatSlot } from "@/lib/couriers/fdMock";
import { isFdState } from "@/lib/couriers/types";
import { createAdminClient } from "@/lib/supabase/admin";

const querySchema = z.object({ barcode: z.string().regex(/^FD\d{10}$/) });

export async function GET(request: Request) {
  if (!(await requestCanUseFd(request))) return NextResponse.json({ error: "non autorisé" }, { status: 401 });
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({ barcode: url.searchParams.get("barcode") });
  if (!parsed.success) return NextResponse.json({ error: "code-barres invalide" }, { status: 400 });
  if (!takeEtatSlot()) {
    return NextResponse.json({ error: "etat: maximum 1 requête par seconde" }, { status: 429 });
  }
  const row = await readFdEtat(createAdminClient(), parsed.data.barcode);
  if (!row) return NextResponse.json({ error: "code-barres inconnu" }, { status: 404 });
  if (!isFdState(row.state)) return NextResponse.json({ error: "état FD inconnu" }, { status: 500 });
  return NextResponse.json({ state: row.state });
}
