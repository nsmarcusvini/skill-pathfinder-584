import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { issuePushToken, listSources, runIngestNow, toggleSource } from "@/lib/admin.functions";

export const Route = createFileRoute("/_conta/admin/fontes")({
  component: FontesPage,
});

function formatDate(value: string | null) {
  if (!value) return "nunca";
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function FontesPage() {
  const queryClient = useQueryClient();
  const fetchSources = useServerFn(listSources);
  const runNow = useServerFn(runIngestNow);
  const toggle = useServerFn(toggleSource);
  const issueToken = useServerFn(issuePushToken);

  const [pushKey, setPushKey] = useState("");
  const [pushName, setPushName] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);

  const sources = useQuery({
    queryKey: ["admin", "sources"],
    queryFn: () => fetchSources(),
    retry: false,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin", "sources"] });

  const runMutation = useMutation({
    mutationFn: (keys?: string[]) => runNow({ data: keys ? { source_keys: keys } : {} }),
    onSuccess: (result) => {
      const ok = result.sources.filter((s) => s.status === "success");
      const created = ok.reduce((acc, s) => acc + s.created, 0);
      const updated = ok.reduce((acc, s) => acc + s.updated, 0);
      const failed = result.sources.filter((s) => s.status === "error");
      toast.success(`Ingestão concluída: ${created} novas, ${updated} atualizadas.`, {
        description: failed.length > 0 ? `${failed.length} fonte(s) com erro: ${failed.map((f) => f.source_key).join(", ")}` : undefined,
      });
      void invalidate();
    },
    onError: (error: Error) => toast.error("Falha na ingestão", { description: error.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: (input: { id: string; is_active: boolean }) => toggle({ data: input }),
    onSuccess: invalidate,
    onError: (error: Error) => toast.error("Não foi possível alterar a fonte", { description: error.message }),
  });

  const tokenMutation = useMutation({
    mutationFn: () => issueToken({ data: { key: pushKey.trim(), name: pushName.trim() || pushKey.trim() } }),
    onSuccess: (result) => {
      setNewToken(result.token);
      setPushKey("");
      setPushName("");
      void invalidate();
    },
    onError: (error: Error) => toast.error("Não foi possível gerar o token", { description: error.message }),
  });

  if (sources.isError) {
    return (
      <EmptyState
        title="Acesso restrito"
        description="Esta área é visível apenas para administradores do RUMVIA."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Fontes de vagas"
        subtitle="Adapters de pull, fontes push por webhook e execuções de ingestão."
        actions={
          <Button onClick={() => runMutation.mutate(undefined)} loading={runMutation.isPending}>
            Rodar agora (todas)
          </Button>
        }
      />

      <div className="overflow-x-auto border border-divider">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface text-left font-mono text-[12px] uppercase tracking-wide text-text-muted">
              <th className="px-3 py-2">Fonte</th>
              <th className="px-3 py-2">Tipo</th>
              <th className="px-3 py-2">Última execução</th>
              <th className="px-3 py-2">Vagas (ativas/total)</th>
              <th className="px-3 py-2">Ativa</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {(sources.data ?? []).map((source) => (
              <tr key={source.id} className="border-t border-divider align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{source.name}</div>
                  <div className="font-mono text-[12px] text-text-muted">
                    {source.key} · {source.adapter}
                  </div>
                  {source.error_message ? (
                    <div className="mt-1 max-w-md text-[12px] text-danger">{source.error_message}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2">
                  <Badge variant="neutral">{source.source_type}</Badge>
                  {source.has_token ? <div className="mt-1 font-mono text-[11px] text-text-muted">token ativo</div> : null}
                </td>
                <td className="px-3 py-2">
                  <div>{formatDate(source.last_run_at)}</div>
                  <div className="font-mono text-[12px] text-text-muted">
                    {source.last_run_status ?? "—"} · {source.last_run_count} vagas
                  </div>
                </td>
                <td className="px-3 py-2 font-mono">
                  {source.jobs_active}/{source.jobs_total}
                </td>
                <td className="px-3 py-2">
                  <Switch
                    checked={source.is_active}
                    onCheckedChange={(checked) => toggleMutation.mutate({ id: source.id, is_active: checked })}
                    aria-label={`Ativar fonte ${source.key}`}
                  />
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={source.source_type === "push"}
                    loading={runMutation.isPending && runMutation.variables?.[0] === source.key}
                    onClick={() => runMutation.mutate([source.key])}
                  >
                    Rodar agora
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-col gap-3 border border-divider bg-bg p-4">
        <h2 className="font-display text-base uppercase tracking-wide">Nova fonte push (webhook)</h2>
        <p className="text-sm text-text-muted">
          Gera uma chave para <code className="font-mono">POST /api/public/ingest-webhook</code> com header
          <code className="font-mono"> x-ingest-token</code>. O coletor externo envia até 500 vagas por requisição
          no formato NormalizedJob e cai no mesmo pipeline do pull.
        </p>
        <div className="flex flex-col gap-2 md:flex-row">
          <Input value={pushKey} onChange={(e) => setPushKey(e.target.value)} placeholder="chave (ex: n8n_gupy)" />
          <Input value={pushName} onChange={(e) => setPushName(e.target.value)} placeholder="nome exibido" />
          <Button
            onClick={() => tokenMutation.mutate()}
            disabled={pushKey.trim().length < 2}
            loading={tokenMutation.isPending}
          >
            Gerar token
          </Button>
        </div>
        {newToken ? (
          <div className="border border-warning bg-surface p-3">
            <p className="text-sm">Copie agora — o token não será exibido novamente:</p>
            <code className="mt-1 block break-all font-mono text-[13px]">{newToken}</code>
          </div>
        ) : null}
      </section>
    </div>
  );
}
