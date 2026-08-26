import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/cv")({
  head: () => ({
    meta: [
      { title: "Meu CV — RUMVIA" },
      { name: "description", content: "Envie e gerencie o currículo usado na sua análise de aderência." },
      { property: "og:title", content: "Meu CV — RUMVIA" },
      { property: "og:description", content: "Gerencie o currículo analisado pelo RUMVIA." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Currículo" title="Meu CV" subtitle="Upload e histórico de versões." />
      <EmptyState
        title="Nenhum currículo enviado"
        description="O envio de CV será habilitado na próxima etapa da implementação."
      />
    </div>
  ),
});
