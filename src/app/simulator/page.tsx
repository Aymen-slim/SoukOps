import { Suspense } from "react";
import { SiteBar } from "@/components/site-bar";
import { simulatorIsPublic } from "@/lib/security/simulatorGuard";
import SimulatorClient from "./simulator-client";

async function SimulatorWithQuery({ searchParams }: Pick<PageProps<"/simulator">, "searchParams">) {
  const sp = (await searchParams) as { conversation?: string | string[] };
  const raw = sp.conversation;
  const initialConversationId = typeof raw === "string" ? raw : null;
  return <SimulatorClient initialConversationId={initialConversationId} />;
}

export default function SimulatorPage({ searchParams }: PageProps<"/simulator">) {
  if (!simulatorIsPublic()) {
    return (
      <main className="min-h-screen bg-medina-grid">
        <SiteBar />
        <p className="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-muted-foreground sm:px-6">
          Simulateur fermé pour le moment. Réactivez <span className="font-mono">SIMULATOR_PUBLIC</span> pour rouvrir la démo.
        </p>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-medina-grid">
      <SiteBar />
      <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Loading the chat…</p>}>
        <SimulatorWithQuery searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
