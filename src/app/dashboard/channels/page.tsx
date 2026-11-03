"use client";

import { Alert } from "@/components/foundations/alert/alert";
import { useSessionInfo } from "@/lib/auth/client-session";
import { FacebookConnect, WhatsAppConnect } from "../settings/settings-client";

export default function ChannelsPage() {
  const session = useSessionInfo();
  const sandbox = Boolean(session?.isSandbox);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-secondary uppercase">Channels</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-primary sm:text-3xl">
          Instagram, WhatsApp, Messenger
        </h1>
        <p className="mt-0.5 text-sm text-tertiary">Connect the inboxes this shop&apos;s AI should answer.</p>
      </div>
      {sandbox ? (
        <Alert color="warning">
          The screens are here so you can see the desk. Live connect stays off until you sign up.
        </Alert>
      ) : null}
      <div className={`flex flex-col gap-6 ${sandbox ? "pointer-events-none opacity-70" : ""}`}>
        <WhatsAppConnect />
        <FacebookConnect />
      </div>
    </div>
  );
}
