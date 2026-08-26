import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { detectAts, type AtsDetection } from "@/lib/ingest/ats-detect";

export const Route = createFileRoute("/_conta/admin/descobrir-ats")({
  component: DescobrirAts,
});

function DescobrirAts() {
  const [url, setUrl] = useState("");
  const [result, setResult] = useState<AtsDetection | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Descobrir ATS"
        subtitle="Cole a URL da página de carreiras. Só criamos adapter novo depois de confirmar endpoint público e estável."
      />

      <form
        className="flex flex-col gap-2 border border-divider bg-bg p-4 md:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setResult(detectAts(url));
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://boards.greenhouse.io/empresa"
          aria-label="URL da página de carreiras"
        />
        <Button type="submit">Identificar</Button>
      </form>

      {result ? (
        <div className="flex flex-col gap-3 border border-divider bg-bg p-4">
          <div className="flex items-center gap-2">
            <span className="font-display text-lg uppercase tracking-wide">{result.label}</span>
            <Badge variant={result.supported ? "default" : "neutral"}>
              {result.supported ? "adapter disponível" : "sem adapter"}
            </Badge>
          </div>
          <dl className="grid gap-2 font-mono text-[13px] md:grid-cols-2">
            <div>
              <dt className="text-text-muted">board_token sugerido</dt>
              <dd>{result.board_token ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-text-muted">adapter</dt>
              <dd>{result.adapter ?? "—"}</dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-text-muted">endpoint público</dt>
              <dd className="break-all">{result.api_endpoint ?? "não confirmado"}</dd>
            </div>
          </dl>
          <p className="text-sm text-text-muted">{result.recommendation}</p>
        </div>
      ) : null}
    </div>
  );
}
