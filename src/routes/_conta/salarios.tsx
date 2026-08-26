import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/rumvia/page-header";
import { EmptyState } from "@/components/rumvia/states";
import { useMarket, SEGMENT_LABEL } from "@/hooks/use-market";

export const Route = createFileRoute("/_conta/salarios")({
  head: () => ({
    meta: [
      { title: "Salários — RUMVIA" },
      { name: "description", content: "Faixas salariais por senioridade na sua trilha, sem misturar segmentos." },
      { property: "og:title", content: "Salários — RUMVIA" },
      { property: "og:description", content: "Faixas salariais por trilha e senioridade." },
    ],
  }),
  component: SalariosPage,
});

function SalariosPage() {
  const { segment } = useMarket();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Mercado"
        title="Salários"
        subtitle={`Faixas apuradas apenas para ${SEGMENT_LABEL[segment]}.`}
      />
      <EmptyState title="Em construção" description="As estatísticas salariais serão ligadas em breve." />
    </div>
  );
}
