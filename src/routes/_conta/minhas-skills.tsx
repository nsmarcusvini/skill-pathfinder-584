import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";

export const Route = createFileRoute("/_conta/minhas-skills")({
  head: () => ({
    meta: [
      { title: "Minhas skills — RUMVIA" },
      { name: "description", content: "Revise as skills extraídas do seu CV e confirme o que domina." },
      { property: "og:title", content: "Minhas skills — RUMVIA" },
      { property: "og:description", content: "Curadoria das skills do seu currículo." },
    ],
  }),
  component: () => (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Perfil técnico" title="Minhas skills" subtitle="Skills confirmadas e detectadas." />
      <EmptyState title="Ainda sem skills" description="Envie um CV para popular esta lista." />
    </div>
  ),
});
