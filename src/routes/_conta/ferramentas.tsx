import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/ferramentas")({
  head: () => ({
    meta: [
      { title: "Ferramentas — RUMVIA" },
      { name: "description", content: "Ferramentas e clouds mais exigidas na sua trilha e segmento." },
      { property: "og:title", content: "Ferramentas — RUMVIA" },
      { property: "og:description", content: "Demanda de ferramentas por trilha e segmento." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Mercado" title="Ferramentas" subtitle="Demanda por ferramenta e cloud." />
      <EmptyState title="Em construção" description="Os dados de demanda serão ligados nesta tela em breve." />
    </div>
  ),
});
