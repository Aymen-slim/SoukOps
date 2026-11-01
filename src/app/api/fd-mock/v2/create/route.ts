import { NextResponse } from "next/server";
import { requestCanUseFd } from "@/lib/couriers/cloneSession";
import { createFdParcel } from "@/lib/couriers/fdMock";
import { parcelFieldsSchema } from "@/lib/couriers/types";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  if (!(await requestCanUseFd(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = parcelFieldsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    const key = parsed.error.issues[0]?.path[0];
    const reason =
      key === "localityId"
        ? "locality_id manquant : obligatoire pour First Delivery depuis juin 2026."
        : key === "prixMillimes"
          ? "Price out of range: total must be between 0 and 999 DT, delivery included."
          : "Colis incomplet.";
    return NextResponse.json({ error: reason }, { status: 422 });
  }
  try {
    const created = await createFdParcel(createAdminClient(), parsed.data);
    return NextResponse.json({ barcode: created.barcode, printUrl: created.printUrl, waybillPath: created.waybillPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "create failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
