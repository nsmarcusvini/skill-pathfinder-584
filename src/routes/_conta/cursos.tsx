import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/cursos")({
  head: () => ({
    meta: [
      { title: "Cursos — RUMVIA" },
      { name: "description", content: "Cursos sugeridos para fechar as lacunas da sua trilha." },
      { property: "og:title", content: "Cursos — RUMVIA" },
      { property: "og:description", content: "Cursos para fechar suas lacunas de skills." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Plano" title="Cursos" subtitle="Trilha de estudo sugerida." />
      <EmptyState title="Em construção" description="As recomendações serão ligadas em breve." />
    </div>
  ),
});
