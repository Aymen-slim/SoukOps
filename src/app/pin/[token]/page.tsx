import { Suspense } from "react";
import { AlertCircle, MarkerPin01 as MapPin } from "@untitledui/icons";
import { getPinSession } from "@/lib/pipeline/address";
import { createAdminClient } from "@/lib/supabase/admin";
import PinClient from "./pin-client";

async function PinContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createAdminClient();
  const session = await getPinSession(supabase, token);

  if (session.status === "ok") {
    // Public browser key (domain-restricted, see .env.example). Read on the
    // server so it can be rotated without a rebuild; null keeps the
    // Leaflet/OpenStreetMap fallback on the pin page.
    const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? null;
    return <PinClient token={token} pending={session.pending} mapsKey={mapsKey} />;
  }
  return (
    <main className="wassalha-public grid h-dvh place-items-center bg-[#FAFAF9] px-6">
      <div className="max-w-sm border border-[#E4E4E7] bg-white p-8 text-center">
        <div className="mx-auto flex size-12 items-center justify-center border border-utility-yellow-200 bg-warning-primary text-warning-primary">
          <AlertCircle className="size-6" aria-hidden="true" />
        </div>
        <p className="mt-4 font-mono text-[11px] font-medium tracking-[0.08em] text-[#71717A] uppercase">
          Wassalha · Delivery Pin
        </p>
        <h1 className="mt-2 text-2xl font-medium tracking-[-0.03em] text-[#09090B]">
          {session.status === "expired" ? "Link expired" : "Link not found"}
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-[#52525B]">
          {session.status === "expired"
            ? "This confirmation link expired (24 h) or was already used. Go back to the chat and ask for a new one."
            : "This confirmation link doesn't exist. Check the link you got in the chat."}
        </p>
      </div>
    </main>
  );
}

export default function PinPage({ params }: PageProps<"/pin/[token]">) {
  return (
    <Suspense
      fallback={
        <div className="wassalha-public grid h-dvh place-items-center text-base text-tertiary">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 animate-bounce text-brand-secondary" />
            <span>Opening the map…</span>
          </div>
        </div>
      }
    >
      <PinContent params={params} />
    </Suspense>
  );
}
