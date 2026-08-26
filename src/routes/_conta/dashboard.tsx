import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { GapRing } from "@/components/rumvia/gap-ring";
import { EmptyState, LoadingState } from "@/components/rumvia/states";
import { SkillBadge } from "@/components/rumvia/skill-badge";
import { Button } from "@/components/ui/button";
import { useMarket, SEGMENT_LABEL } from "@/hooks/use-market";
import { useGap } from "@/hooks/use-gap";

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
  const gap = useGap();

  const data = gap.data;
  const lacunas = (data?.items ?? []).filter((i) => i.coverage < 1).slice(0, 8);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        subtitle={`${track?.name ?? "Trilha"} · ${SEGMENT_LABEL[segment]}`}
        actions={
          <Button asChild variant="outline">
            <Link to="/minhas-skills">Ajustar minhas skills</Link>
          </Button>
        }
      />

      {gap.isLoading ? (
        <LoadingState />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Sua análise aparece aqui"
          description="Envie seu currículo ou preencha suas skills para calcularmos sua aderência à trilha ativa."
        />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <Blueprint className="flex flex-col items-center gap-2 p-5">
            <GapRing value={data.score} label="Aderência" />
            <p className="text-caption text-neutral-700">
              {data.items.length} skills no baseline · {data.seniority}
            </p>
          </Blueprint>

          <Blueprint className="p-5">
            <h2 className="label-h6 text-neutral-700">Maiores lacunas</h2>
            <div className="mt-3 flex flex-col">
              {lacunas.length === 0 ? (
                <p className="text-caption text-neutral-500">Baseline coberto por completo.</p>
              ) : (
                lacunas.map((item) => (
                  <div
                    key={item.skillId}
                    className="flex items-center gap-3 border-t border-neutral-200 py-2 first:border-t-0"
                  >
                    <SkillBadge
                      name={item.name}
                      status={item.userLevel > 0 ? "parcial" : "faltante"}
                    />
                    <span className="num ml-auto text-caption text-neutral-700">
                      nível {item.userLevel}/{item.requiredLevel} · peso {item.importance}
                    </span>
                  </div>
                ))
              )}
            </div>
          </Blueprint>
        </div>
      )}
    </div>
  );
}
