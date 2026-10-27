import { Suspense } from "react";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { providerStatus } from "@/lib/env";

function StatusBadge({ ok }: { ok: boolean }) {
  return <Badge variant={ok ? "default" : "secondary"}>{ok ? "Configuré" : "À configurer"}</Badge>;
}

async function StatusSection() {
  await connection();
  const status = providerStatus();
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Fournisseurs</CardTitle>
          <CardDescription>Présence des clés uniquement — aucun secret n&apos;est affiché.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span>Meta Model API ({status.models.spark}, {status.models.sam}, {status.models.asr})</span>
            <StatusBadge ok={status.metaModelApi} />
          </div>
          <div className="flex items-center justify-between">
            <span>Baseten — Muse Spark Open ({status.models.sparkOpen})</span>
            <StatusBadge ok={status.baseten} />
          </div>
          <div className="flex items-center justify-between">
            <span>Baseten — Perception Encoder (URL de prédiction)</span>
            <StatusBadge ok={status.basetenPe} />
          </div>
          <div className="flex items-center justify-between">
            <span>Supabase (client public)</span>
            <StatusBadge ok={status.supabase} />
          </div>
          <div className="flex items-center justify-between">
            <span>Supabase (clé secrète, serveur uniquement)</span>
            <StatusBadge ok={status.supabaseAdmin} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Réglages actifs</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          <Badge variant="outline">LLM_PROVIDER={status.llmProvider}</Badge>
          <Badge variant="outline">ASR_PROVIDER={status.asrProvider}</Badge>
          <Badge variant="outline">MATCHER={status.matcher}</Badge>
          <Badge variant="outline">AI_MODE={status.aiMode}</Badge>
        </CardContent>
      </Card>
    </>
  );
}

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Wassalha</h1>
        <p className="text-muted-foreground">
          Jour 1 — fondation, déploiement Baseten et tests smoke. Renseignez <code>.env.local</code>,
          puis lancez <code>npm run smoke</code>.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Chargement du statut…</p>}>
        <StatusSection />
      </Suspense>
    </main>
  );
}
