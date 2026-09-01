import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  Briefcase,
  Building2,
  CircleCheck,
  CircleSlash,
  Wallet,
} from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { AdicionarSkill } from "@/components/app/adicionar-skill";
import { Blueprint } from "@/components/rumvia/blueprint";
import { ChartCard } from "@/components/rumvia/chart-card";
import { GapRing } from "@/components/rumvia/gap-ring";
import { MetricCard } from "@/components/rumvia/metric-card";
import { EmptyState, LoadingState } from "@/components/rumvia/states";
import { SkillBadge } from "@/components/rumvia/skill-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PERIOD_LABEL,
  PERIOD_OPTIONS,
  SEGMENT_LABEL,
  SENIORITIES,
  SENIORITY_LABEL,
  useMarket,
  type MarketSegment,
  type Seniority,
} from "@/hooks/use-market";
import { useGap } from "@/hooks/use-gap";
import { WIDENING_LABEL, type GapItem } from "@/lib/gap.functions";
import { addSkillToStudyPlan } from "@/lib/study.functions";

export const Route = createFileRoute("/_conta/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — RUMVIA" },
      {
        name: "description",
        content:
          "Sua aderência à trilha escolhida, lacunas prioritárias e demanda real do mercado.",
      },
      { property: "og:title", content: "Dashboard — RUMVIA" },
      { property: "og:description", content: "Panorama da sua aderência ao mercado." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardPage,
});

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

// "Últimos 12 meses" sai só daqui — ferramentas.tsx e empresas.tsx continuam
// oferecendo os 4 períodos de PERIOD_OPTIONS.
const DASHBOARD_PERIOD_OPTIONS = PERIOD_OPTIONS.filter((d) => d !== 365);

function DashboardPage() {
  const { track, segment, setSegment, seniority, setSeniority, periodDays, setPeriodDays } =
    useMarket();
  const gap = useGap();
  const data = gap.data;

  // periodDays é estado global (persiste entre /dashboard, /ferramentas e
  // /empresas): se a pessoa tinha 365 selecionado antes dessa opção sumir
  // daqui, o Select ficaria sem rótulo. Rebaixa para o maior período que
  // ainda existe no dashboard.
  React.useEffect(() => {
    if (periodDays === 365) setPeriodDays(180);
  }, [periodDays, setPeriodDays]);

  // Denominador da fórmula (Σpeso, regra 3 do CLAUDE.md): soma o weight já
  // calculado pelo compute-gap em cada item não-extra — mesmo critério do
  // servidor (gap.functions.ts:397-399). Não recalcula peso nem cobertura,
  // só agrega o que a fonte única já devolveu, para converter o gapScore de
  // cada skill (peso × lacuna) em pontos percentuais de aderência.
  const totalWeight = React.useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => i.status !== "extra")
        .reduce((sum, i) => sum + i.weight, 0),
    [data],
  );

  const lacunas = React.useMemo(
    () => (data?.items ?? []).filter((i) => i.status !== "extra" && i.coverage < 1).slice(0, 10),
    [data],
  );
  const forcas = React.useMemo(
    () =>
      (data?.items ?? [])
        .filter((i) => i.status === "dominada" && i.marketDemand >= 0.15)
        .sort((a, b) => b.marketDemand - a.marketDemand)
        .slice(0, 12),
    [data],
  );
  const extras = React.useMemo(
    () => (data?.items ?? []).filter((i) => i.status === "extra").slice(0, 12),
    [data],
  );
  const dominadas = (data?.items ?? []).filter((i) => i.status === "dominada").length;
  const faltantes = (data?.items ?? []).filter((i) => i.status === "faltante").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Visão geral"
        title="Dashboard"
        subtitle={`${track?.name ?? "Trilha"} · ${SEGMENT_LABEL[segment]} · ${SENIORITY_LABEL[seniority]}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {/* O parser não pega tudo, e é olhando o painel que a pessoa percebe
                o que ficou faltando. Adicionar aqui recalcula a aderência na hora. */}
            <AdicionarSkill label="Adicionar skill" />
            <Button asChild variant="outline">
              <Link to="/minhas-skills">Ajustar minhas skills</Link>
            </Button>
          </div>
        }
      />

      <Blueprint className="flex flex-wrap items-center gap-3 p-3">
        <span className="caption">Filtros</span>
        <Select value={seniority} onValueChange={(v) => void setSeniority(v as Seniority)}>
          <SelectTrigger className="w-[180px]" aria-label="Senioridade">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SENIORITIES.map((s) => (
              <SelectItem key={s} value={s}>
                {SENIORITY_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={segment} onValueChange={(v) => void setSegment(v as MarketSegment)}>
          <SelectTrigger className="w-[200px]" aria-label="Segmento de mercado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="br">{SEGMENT_LABEL.br}</SelectItem>
            <SelectItem value="remoto_global">{SEGMENT_LABEL.remoto_global}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(Number(v))}>
          <SelectTrigger className="w-[190px]" aria-label="Período">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DASHBOARD_PERIOD_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {PERIOD_LABEL[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Blueprint>

      {gap.isLoading ? (
        <LoadingState />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Sua análise aparece aqui"
          description="Envie seu currículo ou preencha suas skills para calcularmos sua aderência à trilha ativa."
        />
      ) : (
        <>
          {data.lowConfidence ? (
            <Blueprint className="flex items-start gap-3 border-warning p-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <p className="text-body">
                Amostra pequena: <span className="num">{data.postingsSample}</span> vagas entraram
                nesta conta. Para chegar a esse número usamos {WIDENING_LABEL[data.wideningStep]}.
                Isso é comum no segmento {SEGMENT_LABEL[data.marketSegment as MarketSegment]} com
                fontes gratuitas — o número segue válido, só com menos precisão.
              </p>
            </Blueprint>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
            <Blueprint className="flex flex-col items-center justify-center gap-3 p-5">
              <GapRing value={data.score} size={180} thickness={12} label="Aderência" />
              {data.delta === null ? (
                <p className="caption">Primeira análise deste recorte</p>
              ) : (
                <p className="caption">
                  <span className="num">
                    {data.delta > 0 ? "+" : ""}
                    {data.delta}
                  </span>{" "}
                  p.p. vs. análise anterior
                </p>
              )}
            </Blueprint>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Vagas analisadas"
                value={data.postingsSample}
                icon={<Briefcase className="size-4" />}
                hint={PERIOD_LABEL[data.periodDays] ?? `${data.periodDays} dias`}
              />
              <MetricCard
                label="Skills dominadas"
                value={dominadas}
                icon={<CircleCheck className="size-4" />}
              />
              <MetricCard
                label="Skills faltantes"
                value={faltantes}
                icon={<CircleSlash className="size-4" />}
              />
              <MetricCard
                label="Mediana salarial da trilha"
                value={
                  data.salaryMedian === null
                    ? "—"
                    : formatCurrency(data.salaryMedian, data.currency)
                }
                icon={<Wallet className="size-4" />}
                hint={SEGMENT_LABEL[data.marketSegment as MarketSegment]}
              />
              <MetricCard
                label="Empresas contratando (30d)"
                value={data.companiesHiring30d}
                icon={<Building2 className="size-4" />}
              />
            </div>
          </div>

          <ChartCard
            title="Aderência por categoria"
            description="Sub-scores calculados pela mesma fórmula, por categoria de skill."
          >
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data.categoryScores} outerRadius="72%">
                  <PolarGrid stroke="var(--color-divider)" />
                  <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Radar
                    name="Aderência"
                    dataKey="score"
                    stroke="var(--color-accent-600)"
                    fill="var(--color-accent-400)"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <Blueprint className="flex flex-col">
            <div className="border-b border-divider p-3">
              <h6 className="text-neutral-700">Top 10 lacunas prioritárias</h6>
              <p className="caption mt-1">
                Ordenado pelo peso da lacuna (demanda + baseline). O "+X,Xpp" em cada linha é
                quanto sua aderência sobe se você chegar ao nível exigido só naquela skill —
                quanto maior o peso da skill no mercado, maior o efeito de subir de nível nela.
              </p>
            </div>
            <ul className="divide-y divide-divider">
              {lacunas.map((item) => (
                <GapRow key={item.skillId} item={item} totalWeight={totalWeight} />
              ))}
              {lacunas.length === 0 ? (
                <li className="p-3 text-body text-neutral-600">Nenhuma lacuna neste recorte.</li>
              ) : null}
            </ul>
          </Blueprint>

          <div className="grid gap-4 lg:grid-cols-2">
            <Blueprint className="flex flex-col">
              <div className="border-b border-divider p-3">
                <h6 className="text-neutral-700">Suas forças</h6>
                <p className="caption mt-1">Skills dominadas com alta demanda no recorte atual.</p>
              </div>
              <div className="flex flex-wrap gap-2 p-3">
                {forcas.length === 0 ? (
                  <p className="text-body text-neutral-600">
                    Ainda não há skills dominadas de alta demanda.
                  </p>
                ) : (
                  forcas.map((i) => (
                    <SkillBadge
                      key={i.skillId}
                      name={`${i.name} · ${Math.round(i.marketDemand * 100)}%`}
                      status="dominada"
                    />
                  ))
                )}
              </div>
            </Blueprint>

            <Blueprint className="flex flex-col">
              <div className="border-b border-divider p-3">
                <h6 className="text-neutral-700">Skills extras</h6>
                <p className="caption mt-1">
                  O que você tem e este recorte do mercado pouco pede. É informação de
                  posicionamento, não demérito.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 p-3">
                {extras.length === 0 ? (
                  <p className="text-body text-neutral-600">Nada fora do radar da trilha.</p>
                ) : (
                  extras.map((i) => <SkillBadge key={i.skillId} name={i.name} status="extra" />)
                )}
              </div>
            </Blueprint>
          </div>
        </>
      )}
    </div>
  );
}

function GapRow({ item, totalWeight }: { item: GapItem; totalWeight: number }) {
  // gapScore já é peso × (1 − cobertura) — o quanto essa skill, sozinha,
  // segura a aderência para baixo (gap.functions.ts:421). Dividir por Σpeso
  // dá o ganho em pontos percentuais se ela chegasse ao nível exigido, na
  // mesma casa decimal do score exibido (gap.functions.ts:428: round(...*1000)/10).
  const impactoPp =
    totalWeight > 0 ? Math.round((item.gapScore / totalWeight) * 1000) / 10 : 0;

  // Nível 0 = a skill não está no perfil. Aí há duas leituras possíveis: ou a
  // pessoa não sabe mesmo (e o caminho é estudar), ou ela sabe e só esqueceu de
  // preencher — o parser de CV não pega tudo. Oferecer as duas saídas na mesma
  // linha evita que ela mande para o plano de estudos algo que já domina, o que
  // deixaria a aderência menor do que a realidade.
  //
  // Acima de 0 a skill já existe no perfil, só está abaixo do nível pedido:
  // "já tenho" não faria sentido, o ajuste é em /minhas-skills.
  const naoPossui = item.userLevel === 0;
  const { trackId } = useMarket();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const runAddToPlan = useServerFn(addSkillToStudyPlan);

  // A adição em si já acontece no clique (onSuccess), sempre — o diálogo só
  // pergunta o próximo passo, nunca condiciona se a skill entra no plano.
  const [irAoPlanoAberto, setIrAoPlanoAberto] = React.useState(false);

  const addToPlan = useMutation({
    mutationFn: () =>
      runAddToPlan({
        data: { trackId: trackId as string, skillId: item.skillId, skillName: item.name },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["study_plans"] });
      void queryClient.invalidateQueries({ queryKey: ["study_items"] });
      setIrAoPlanoAberto(true);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <li className="grid grid-cols-1 items-center gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]">
      <div className="min-w-0">
        <SkillBadge name={item.name} status={item.status} />
        {item.categoryName ? <span className="caption ml-2">{item.categoryName}</span> : null}
      </div>
      <span className="num text-caption text-neutral-700">
        {Math.round(item.marketDemand * 100)}% das vagas
      </span>
      <span className="num text-caption text-neutral-700">
        nível {item.userLevel}/{item.requiredLevel}
      </span>
      <span
        className="num text-caption font-semibold text-accent-600"
        title={`Se você chegar ao nível ${item.requiredLevel} nesta skill, sua aderência geral sobe cerca de ${impactoPp}pp`}
      >
        +{impactoPp}pp
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {naoPossui ? (
          <AdicionarSkill
            skill={{ id: item.skillId, name: item.name }}
            label="Já tenho essa"
            variant="ghost"
            size="sm"
          />
        ) : null}
        <Button
          variant="outline"
          size="sm"
          disabled={!trackId || addToPlan.isPending}
          onClick={() => addToPlan.mutate()}
        >
          Adicionar ao plano de estudos
        </Button>
      </div>

      <Dialog open={irAoPlanoAberto} onOpenChange={setIrAoPlanoAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{item.name} adicionada ao plano de estudos</DialogTitle>
            <DialogDescription>
              Quer ir até o plano agora para organizar os itens, ou prefere continuar por
              aqui?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIrAoPlanoAberto(false)}>
              Continuar aqui
            </Button>
            <Button
              onClick={() => {
                setIrAoPlanoAberto(false);
                void navigate({ to: "/progresso" });
              }}
            >
              Ir para o plano
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
