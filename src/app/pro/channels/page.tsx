"use client";

import { FacebookConnect, WhatsAppConnect } from "@/app/dashboard/settings/settings-client";
import { Alert } from "@/components/foundations/alert/alert";
import { useSessionInfo } from "@/lib/auth/client-session";

export default function ProChannelsPage() {
  const session = useSessionInfo();
  const sandbox = Boolean(session?.isSandbox);

  return (
    <div className="flex flex-col gap-6">
      <div className="border-b border-[#E4E4E7] pb-5">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[#52525B]">
          Connected Channels
        </p>
        <h1 className="mt-1.5 text-2xl font-medium tracking-[-0.03em] text-[#09090B] sm:text-3xl">
          WhatsApp, Instagram &amp; Messenger
        </h1>
        <p className="mt-1 text-sm text-[#52525B]">
          Connect the social DMs and WhatsApp inbox your personal assistant replies to — including Derja voice notes.
        </p>
      </div>

      {sandbox ? (
        <Alert color="warning">
          Channel connection screens are visible in preview mode. Sign up for a free Creator &amp; Pro account to link live WhatsApp, Instagram, or Messenger accounts.
        </Alert>
      ) : null}

      <div className={`flex flex-col gap-6 ${sandbox ? "pointer-events-none opacity-70" : ""}`}>
        <WhatsAppConnect />
        <FacebookConnect />
      </div>
    </div>
  );
}
