import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/admin")({
  head: () => ({
    meta: [
      { title: "Admin — RUMVIA" },
      { name: "description", content: "Área interna de operação: fontes de vagas e curadoria de skills." },
      { property: "og:title", content: "Admin — RUMVIA" },
      { property: "og:description", content: "Operação interna do RUMVIA." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Interno" title="Admin" subtitle="Fontes de vagas, ingestão e curadoria." />
      <EmptyState title="Em construção" description="Os painéis internos serão ligados em breve." />
    </div>
  ),
});
