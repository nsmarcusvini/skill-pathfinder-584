import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/empresas")({
  head: () => ({
    meta: [
      { title: "Empresas — RUMVIA" },
      { name: "description", content: "Empresas que mais contratam na sua trilha e segmento de mercado." },
      { property: "og:title", content: "Empresas — RUMVIA" },
      { property: "og:description", content: "Quem está contratando na sua trilha." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Mercado" title="Empresas" subtitle="Quem mais contrata na sua trilha." />
      <EmptyState title="Em construção" description="A listagem de empresas será ligada em breve." />
    </div>
  ),
});
