import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/progresso")({
  head: () => ({
    meta: [
      { title: "Progresso — RUMVIA" },
      { name: "description", content: "Evolução da sua aderência ao longo do tempo." },
      { property: "og:title", content: "Progresso — RUMVIA" },
      { property: "og:description", content: "Acompanhe a evolução da sua aderência." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Evolução" title="Progresso" subtitle="Histórico do seu score de aderência." />
      <EmptyState title="Sem histórico ainda" description="Cada nova análise vira um ponto nesta linha do tempo." />
    </div>
  ),
});
