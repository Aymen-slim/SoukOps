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
    return <PinClient token={token} pending={session.pending} />;
  }
  return (
    <main className="grid h-dvh place-items-center bg-dot-grid px-6">
      <div className="max-w-sm rounded-3xl border border-secondary bg-primary p-8 text-center shadow-lg">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warning-primary text-warning-primary ring-1 ring-utility-yellow-200">
          <AlertCircle className="size-6" />
        </div>
        <p className="mt-4 text-[11px] font-semibold tracking-[0.18em] text-tertiary uppercase">
          Wassalha · Delivery Pin
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-primary">
          {session.status === "expired" ? "Link expired" : "Link not found"}
        </h1>
        <p className="mt-2.5 text-sm leading-relaxed text-tertiary">
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
        <div className="grid h-dvh place-items-center bg-secondary text-sm text-tertiary">
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
