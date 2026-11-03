import { Suspense } from "react";
import { ProductEditor } from "./product-editor";

async function ProductGate({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProductEditor id={id} />;
}

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-tertiary">Loading the product…</p>}>
      <ProductGate params={params} />
    </Suspense>
  );
}
