import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";
import { useMarket, SEGMENT_LABEL } from "@/hooks/use-market";

export const Route = createFileRoute("/_conta/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — RUMVIA" },
      { name: "description", content: "Sua aderência à trilha escolhida e as principais lacunas." },
      { property: "og:title", content: "Dashboard — RUMVIA" },
      { property: "og:description", content: "Panorama da sua aderência ao mercado." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  const { track, segment } = useMarket();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        subtitle={`${track?.name ?? "Trilha"} · ${SEGMENT_LABEL[segment]}`}
      />
      <EmptyState
        title="Sua análise aparece aqui"
        description="Envie seu currículo para calcularmos sua aderência à trilha e ao segmento ativos."
      />
    </div>
  );
}
