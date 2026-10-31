import { Suspense } from "react";
import { OrderDetail } from "./order-detail";

async function Gate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail id={id} />;
}

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading the order…</p>}>
      <Gate params={params} />
    </Suspense>
  );
}
