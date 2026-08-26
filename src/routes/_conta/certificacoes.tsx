import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/certificacoes")({
  head: () => ({
    meta: [
      { title: "Certificações — RUMVIA" },
      { name: "description", content: "Certificações valorizadas na sua trilha e segmento de mercado." },
      { property: "og:title", content: "Certificações — RUMVIA" },
      { property: "og:description", content: "Certificações relevantes para sua trilha." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Plano" title="Certificações" subtitle="O que vale a pena certificar." />
      <EmptyState title="Em construção" description="As recomendações serão ligadas em breve." />
    </div>
  ),
});
