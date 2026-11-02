import { Suspense } from "react";
import { ColisView } from "../../portal";

async function ColisGate({ params }: { params: Promise<{ barcode: string }> }) {
  const { barcode } = await params;
  return <ColisView barcode={barcode} />;
}

export default function ColisPage({ params }: { params: Promise<{ barcode: string }> }) {
  return (
    <Suspense fallback={<p className="text-sm text-tertiary">Loading parcel…</p>}>
      <ColisGate params={params} />
    </Suspense>
  );
}
