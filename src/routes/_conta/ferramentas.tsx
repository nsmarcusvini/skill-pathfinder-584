import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowRight, ArrowUp, ExternalLink, Plus } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { ChartCard } from "@/components/rumvia/chart-card";
import { SkillBadge, type SkillStatus } from "@/components/rumvia/skill-badge";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  SENIORITY_LABEL,
  SENIORITIES,
  useMarket,
  type MarketSegment,
  type Seniority,
} from "@/hooks/use-market";
import { useGap } from "@/hooks/use-gap";
import {
  getToolRanking,
  getToolDetail,
  getToolMonthly,
  type ToolRankingItem,
} from "@/lib/market.functions";
import { addToStudyPlan } from "@/lib/study-plan";

export const Route = createFileRoute("/_conta/ferramentas")({
  head: () => ({
    meta: [
      { title: "Stacks em Alta — RUMVIA" },
      {
        name: "description",
        content: "Ferramentas e clouds mais exigidas na sua trilha e segmento.",
      },
      { property: "og:title", content: "Stacks em Alta — RUMVIA" },
      { property: "og:description", content: "Demanda de ferramentas por trilha e segmento." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FerramentasPage,
});

const CHART_COLORS = [
  "#416180",
  "#7e9cb8",
  "#b5d9fd",
  "#5d5d60",
  "#94bce3",
  "#98989b",
] as const;

const STATUS_BAR_COLOR: Record<SkillStatus | "none", string> = {
  dominada: "var(--color-success)",
  parcial: "var(--color-warning)",
  faltante: "var(--color-danger)",
  extra: "var(--color-accent-600)",
  none: "var(--color-accent-600)",
};

function formatPct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCurrency(value: number, currency: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function FerramentasPage() {
  const { track, trackId, segment, setSegment, seniority, setSeniority, periodDays, setPeriodDays } =
    useMarket();
  const gap = useGap();

  const [selectedCategory, setSelectedCategory] = React.useState<string | null>(null);
  const [compareMode, setCompareMode] = React.useState(false);
  const [selectedSkillId, setSelectedSkillId] = React.useState<string | null>(null);
  const [selectedSkillName, setSelectedSkillName] = React.useState<string>("");

  const runRanking = useServerFn(getToolRanking);
  const runDetail = useServerFn(getToolDetail);
  const runMonthly = useServerFn(getToolMonthly);

  // ── Gap status map for coloring bars ──────────────────────────────────────
  const gapStatusBySkill = React.useMemo(() => {
    const map = new Map<string, SkillStatus>();
    for (const item of gap.data?.items ?? []) {
      map.set(item.skillId, item.status);
    }
    return map;
  }, [gap.data]);

  // ── Main ranking (current segment) ────────────────────────────────────────
  const rankingQuery = useQuery({
    queryKey: ["tools", trackId, segment, seniority, periodDays],
    enabled: Boolean(trackId),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      runRanking({
        data: {
          trackId: trackId!,
          segments: [segment],
          seniorities: [seniority],
          periodDays,
        },
      }),
  });

  // ── Compare mode rankings ─────────────────────────────────────────────────
  const brRankingQuery = useQuery({
    queryKey: ["tools-br", trackId, seniority, periodDays],
    enabled: Boolean(trackId) && compareMode,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      runRanking({
        data: {
          trackId: trackId!,
          segments: ["br"],
          seniorities: [seniority],
          periodDays,
        },
      }),
  });

  const globalRankingQuery = useQuery({
    queryKey: ["tools-global", trackId, seniority, periodDays],
    enabled: Boolean(trackId) && compareMode,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      runRanking({
        data: {
          trackId: trackId!,
          segments: ["remoto_global"],
          seniorities: [seniority],
          periodDays,
        },
      }),
  });

  // ── Client-side category filter ───────────────────────────────────────────
  const allTools = rankingQuery.data ?? [];

  const categories = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const item of allTools) map.set(item.categoryKey, item.categoryName);
    return Array.from(map.entries()).map(([key, name]) => ({ key, name }));
  }, [allTools]);

  const filteredTools = React.useMemo(() => {
    if (!selectedCategory) return allTools;
    return allTools.filter((t) => t.categoryKey === selectedCategory);
  }, [allTools, selectedCategory]);

  // ── Monthly chart (top 5) ─────────────────────────────────────────────────
  const top5 = React.useMemo(() => filteredTools.slice(0, 5), [filteredTools]);
  const top5Ids = React.useMemo(() => top5.map((t) => t.skillId), [top5]);

  const monthlyQuery = useQuery({
    queryKey: ["tools-monthly", trackId, segment, seniority, top5Ids],
    enabled: Boolean(trackId) && top5Ids.length > 0 && !compareMode,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      runMonthly({
        data: {
          trackId: trackId!,
          skillIds: top5Ids,
          segments: [segment],
          seniorities: [seniority],
          months: 6,
        },
      }),
  });

  const monthlyChartData = React.useMemo(() => {
    const rows = monthlyQuery.data ?? [];
    const byMonth = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const slot = byMonth.get(row.month) ?? {};
      slot[row.skillId] = row.demand;
      byMonth.set(row.month, slot);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        month: month.slice(0, 7),
        ...Object.fromEntries(top5.map((s) => [s.name, Math.round((vals[s.skillId] ?? 0) * 1000) / 10])),
      }));
  }, [monthlyQuery.data, top5]);

  // ── Compare table ─────────────────────────────────────────────────────────
  const compareData = React.useMemo(() => {
    const brMap = new Map((brRankingQuery.data ?? []).map((r) => [r.skillId, r]));
    const globalMap = new Map((globalRankingQuery.data ?? []).map((r) => [r.skillId, r]));
    const allIds = new Set([...brMap.keys(), ...globalMap.keys()]);
    return Array.from(allIds)
      .map((id) => {
        const br = brMap.get(id);
        const gl = globalMap.get(id);
        const base = br ?? gl!;
        return {
          skillId: id,
          name: base.name,
          categoryName: base.categoryName,
          brDemand: br?.demand ?? 0,
          globalDemand: gl?.demand ?? 0,
          status: gapStatusBySkill.get(id) as SkillStatus | undefined,
        };
      })
      .sort((a, b) => Math.max(b.brDemand, b.globalDemand) - Math.max(a.brDemand, a.globalDemand))
      .slice(0, 40);
  }, [brRankingQuery.data, globalRankingQuery.data, gapStatusBySkill]);

  // ── Tool detail ───────────────────────────────────────────────────────────
  const detailQuery = useQuery({
    queryKey: ["tool-detail", selectedSkillId, trackId, segment, seniority, periodDays],
    enabled: Boolean(selectedSkillId) && Boolean(trackId),
    queryFn: () =>
      runDetail({
        data: {
          trackId: trackId!,
          skillId: selectedSkillId!,
          segments: [segment],
          seniorities: [seniority],
          periodDays,
        },
      }),
  });

  function openDetail(item: ToolRankingItem) {
    setSelectedSkillId(item.skillId);
    setSelectedSkillName(item.name);
  }

  const isLoading = rankingQuery.isLoading;
  const isError = rankingQuery.isError;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Mercado"
        title="Stacks em Alta"
        subtitle={`${track?.name ?? "Trilha"} · ${SEGMENT_LABEL[segment]} · ${SENIORITY_LABEL[seniority]}`}
      />

      {/* Filtros */}
      <Blueprint className="flex flex-wrap items-center gap-3 p-3">
        <span className="caption">Filtros</span>
        <Select value={seniority} onValueChange={(v) => void setSeniority(v as Seniority)}>
          <SelectTrigger className="w-[160px]" aria-label="Senioridade">
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
          <SelectTrigger className="w-[200px]" aria-label="Segmento">
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
            {PERIOD_OPTIONS.map((d) => (
              <SelectItem key={d} value={String(d)}>
                {PERIOD_LABEL[d]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={compareMode ? "default" : "outline"}
          size="sm"
          onClick={() => setCompareMode((v) => !v)}
        >
          Comparar segmentos
        </Button>
      </Blueprint>

      {/* Filtro por categoria */}
      {categories.length > 0 && !compareMode ? (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`tag ${!selectedCategory ? "border-accent-600 text-accent-700" : ""}`}
          >
            Todas
          </button>
          {categories.map((c) => (
            <button
              key={c.key}
              onClick={() => setSelectedCategory(selectedCategory === c.key ? null : c.key)}
              className={`tag ${selectedCategory === c.key ? "border-accent-600 text-accent-700" : ""}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* States */}
      {!trackId ? (
        <EmptyState
          title="Trilha não selecionada"
          description="Escolha uma trilha no menu superior para ver a demanda de ferramentas."
        />
      ) : isLoading ? (
        <LoadingState rows={6} label="Carregando ferramentas do mercado" />
      ) : isError ? (
        <ErrorState onRetry={() => void rankingQuery.refetch()} />
      ) : filteredTools.length === 0 && !compareMode ? (
        <EmptyState
          title="Sem dados para este recorte"
          description="Tente ampliar o período ou remover o filtro de categoria."
        />
      ) : compareMode ? (
        <CompareTable
          data={compareData}
          loading={brRankingQuery.isLoading || globalRankingQuery.isLoading}
        />
      ) : (
        <>
          {/* Gráfico de barras: top 15 */}
          <ChartCard
            title="Stacks em Alta"
            description="Porcentagem de vagas da trilha que pedem cada ferramenta. Cor = seu status."
          >
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={filteredTools.slice(0, 15).map((t) => ({
                    name: t.name,
                    demand: Math.round(t.demand * 1000) / 10,
                    status: gapStatusBySkill.get(t.skillId) ?? "none",
                    skillId: t.skillId,
                  }))}
                  margin={{ left: 8, right: 32, top: 4, bottom: 4 }}
                >
                  <CartesianGrid horizontal={false} stroke="var(--color-divider)" />
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-divider)"
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-divider)"
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, "Demanda"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="demand" radius={0} maxBarSize={18}>
                    {filteredTools.slice(0, 15).map((t) => {
                      const st = (gapStatusBySkill.get(t.skillId) ?? "none") as SkillStatus | "none";
                      return <Cell key={t.skillId} fill={STATUS_BAR_COLOR[st]} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              {(["dominada", "parcial", "faltante"] as SkillStatus[]).map((s) => (
                <span key={s} className="caption inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="inline-block size-2.5"
                    style={{ backgroundColor: STATUS_BAR_COLOR[s] }}
                  />
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </span>
              ))}
              <span className="caption inline-flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="inline-block size-2.5"
                  style={{ backgroundColor: STATUS_BAR_COLOR.none }}
                />
                Fora do radar
              </span>
            </div>
          </ChartCard>

          {/* Gráfico de linha: evolução mensal top 5 */}
          {monthlyChartData.length > 0 ? (
            <ChartCard
              title="Evolução mensal (top 5)"
              description="Demanda dos 5 primeiros nos últimos 6 meses."
            >
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyChartData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="var(--color-divider)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--color-divider)" />
                    <YAxis
                      tickFormatter={(v: number) => `${v}%`}
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-divider)"
                    />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, ""]}
                      contentStyle={{ fontSize: 12 }}
                    />
                    {top5.map((skill, i) => (
                      <Line
                        key={skill.skillId}
                        type="monotone"
                        dataKey={skill.name}
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        dot={false}
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex flex-wrap gap-3">
                {top5.map((skill, i) => (
                  <span key={skill.skillId} className="caption inline-flex items-center gap-1.5">
                    <span
                      aria-hidden
                      className="inline-block size-2.5"
                      style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    {skill.name}
                  </span>
                ))}
              </div>
            </ChartCard>
          ) : null}

          {/* Tabela completa */}
          <Blueprint className="flex flex-col">
            <div className="border-b border-divider p-3">
              <h6 className="text-neutral-700">
                Ranking completo{selectedCategory ? ` · ${categories.find((c) => c.key === selectedCategory)?.name}` : ""}
              </h6>
              <p className="caption mt-1">
                {filteredTools.length} ferramenta{filteredTools.length !== 1 ? "s" : ""} · {filteredTools[0]?.totalJobs ?? 0} vagas analisadas
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="w-8">#</th>
                    <th>Ferramenta</th>
                    <th className="text-right">Demanda</th>
                    <th className="text-right">30 dias</th>
                    <th>Seu status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filteredTools.map((tool, idx) => {
                    const status = gapStatusBySkill.get(tool.skillId) as SkillStatus | undefined;
                    const trend = tool.trend;
                    return (
                      <tr key={tool.skillId}>
                        <td className="num text-neutral-600">{idx + 1}</td>
                        <td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{tool.name}</span>
                            <span className="caption text-neutral-600">{tool.categoryName}</span>
                          </div>
                        </td>
                        <td className="num text-right">{formatPct(tool.demand)}</td>
                        <td className="text-right">
                          <TrendBadge trend={trend} />
                        </td>
                        <td>
                          {status ? (
                            <SkillBadge name="" status={status} showStatus />
                          ) : (
                            <span className="caption text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDetail(tool)}
                          >
                            Detalhes
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Blueprint>
        </>
      )}

      {/* Sheet de detalhe da ferramenta */}
      <Sheet open={Boolean(selectedSkillId)} onOpenChange={(open) => !open && setSelectedSkillId(null)}>
        <SheetContent side="right" className="w-full max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedSkillName}</SheetTitle>
          </SheetHeader>
          <ToolDetailPanel
            skillId={selectedSkillId}
            skillName={selectedSkillName}
            detail={detailQuery.data ?? null}
            loading={detailQuery.isLoading}
            userStatus={selectedSkillId ? (gapStatusBySkill.get(selectedSkillId) as SkillStatus | undefined) : undefined}
            segment={segment}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Compare Table ────────────────────────────────────────────────────────────

function CompareTable({
  data,
  loading,
}: {
  data: Array<{
    skillId: string;
    name: string;
    categoryName: string;
    brDemand: number;
    globalDemand: number;
    status: SkillStatus | undefined;
  }>;
  loading: boolean;
}) {
  if (loading) return <LoadingState rows={6} label="Carregando comparativo" />;
  if (data.length === 0)
    return (
      <EmptyState
        title="Sem dados para comparar"
        description="Amplie o período ou verifique se há vagas nos dois segmentos para esta trilha."
      />
    );
  return (
    <Blueprint className="flex flex-col">
      <div className="border-b border-divider p-3">
        <h6 className="text-neutral-700">Brasil vs Remoto global</h6>
        <p className="caption mt-1">
          % de vagas que pedem cada ferramenta em cada segmento.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="table w-full">
          <thead>
            <tr>
              <th>Ferramenta</th>
              <th className="text-right">{SEGMENT_LABEL.br}</th>
              <th className="text-right">{SEGMENT_LABEL.remoto_global}</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.skillId}>
                <td>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-medium">{row.name}</span>
                    <span className="caption text-neutral-600">{row.categoryName}</span>
                  </div>
                </td>
                <td className="num text-right">
                  {row.brDemand > 0 ? formatPct(row.brDemand) : <span className="text-neutral-400">—</span>}
                </td>
                <td className="num text-right">
                  {row.globalDemand > 0 ? formatPct(row.globalDemand) : <span className="text-neutral-400">—</span>}
                </td>
                <td>
                  {row.status ? (
                    <SkillBadge name="" status={row.status} showStatus />
                  ) : (
                    <span className="caption text-neutral-500">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Blueprint>
  );
}

// ─── Tool Detail Panel (inside Sheet) ────────────────────────────────────────

function ToolDetailPanel({
  skillId,
  skillName,
  detail,
  loading,
  userStatus,
  segment,
}: {
  skillId: string | null;
  skillName: string;
  detail: import("@/lib/market.functions").ToolDetail | null | undefined;
  loading: boolean;
  userStatus: SkillStatus | undefined;
  segment: MarketSegment;
}) {
  if (loading) return <LoadingState rows={5} label="Carregando detalhes" />;
  if (!detail)
    return (
      <EmptyState
        title="Sem dados suficientes"
        description="Não há vagas com dados para este recorte."
      />
    );

  const currency = detail.salaryCurrency || (segment === "remoto_global" ? "USD" : "BRL");
  const hasSalary = detail.salaryP50 !== null && detail.salarySample >= 5;

  return (
    <div className="mt-4 flex flex-col gap-5">
      {userStatus ? (
        <SkillBadge name={skillName} status={userStatus} showStatus />
      ) : null}

      {detail.description ? (
        <p className="text-body text-neutral-700">{detail.description}</p>
      ) : null}

      {/* Demanda */}
      <Blueprint className="grid grid-cols-2 gap-0 divide-x divide-divider">
        <div className="p-4">
          <h6 className="text-neutral-600">Demanda</h6>
          <p className="num mt-1 text-[28px] font-semibold leading-none">
            {formatPct(detail.demand)}
          </p>
          <p className="caption mt-1 text-neutral-600">
            {detail.jobs} de {detail.totalJobs} vagas
          </p>
        </div>
        <div className="p-4">
          <h6 className="text-neutral-600">Salário mediano</h6>
          {hasSalary ? (
            <>
              <p className="num mt-1 text-[28px] font-semibold leading-none">
                {formatCurrency(detail.salaryP50!, currency)}
              </p>
              <p className="caption mt-1 text-neutral-600">
                p25 {formatCurrency(detail.salaryP25!, currency)} · p75{" "}
                {formatCurrency(detail.salaryP75!, currency)}
              </p>
              <p className="caption text-neutral-500">{detail.salarySample} amostras</p>
            </>
          ) : (
            <p className="caption mt-1 text-neutral-500">
              Amostra insuficiente ({detail.salarySample} vagas com salário).
            </p>
          )}
        </div>
      </Blueprint>

      {/* Top empresas */}
      {detail.companies.length > 0 ? (
        <div>
          <h6 className="mb-2 text-neutral-700">Empresas que mais pedem</h6>
          <div className="flex flex-col divide-y divide-divider">
            {detail.companies.slice(0, 5).map((c) => (
              <div key={c.name} className="flex items-center justify-between py-2">
                <span className="text-body">{c.name}</span>
                <span className="num caption text-neutral-600">{c.jobs} vagas</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Co-ocorrência */}
      {detail.cooccurrence.length > 0 ? (
        <div>
          <h6 className="mb-2 text-neutral-700">Costuma aparecer junto com</h6>
          <div className="flex flex-wrap gap-2">
            {detail.cooccurrence.slice(0, 8).map((c) => (
              <Badge key={c.skillId} variant="outline">
                {c.name}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {/* Adicionar ao plano */}
      {skillId ? (
        <Button
          onClick={() => {
            const added = addToStudyPlan({ skillId, name: skillName });
            toast[added ? "success" : "info"](
              added ? `${skillName} adicionada ao plano de estudos` : `${skillName} já está no plano`,
            );
          }}
        >
          <Plus className="mr-2 size-4" aria-hidden />
          Adicionar ao plano de estudos
        </Button>
      ) : null}
    </div>
  );
}

// ─── Trend Badge ─────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: number }) {
  if (Math.abs(trend) < 0.005)
    return (
      <span className="caption inline-flex items-center gap-1 text-neutral-500">
        <ArrowRight className="size-3" aria-hidden />
        <span className="num">={Math.round(trend * 100)}pp</span>
      </span>
    );
  if (trend > 0)
    return (
      <span className="caption inline-flex items-center gap-1 text-success">
        <ArrowUp className="size-3" aria-hidden />
        <span className="num">+{Math.round(trend * 100)}pp</span>
      </span>
    );
  return (
    <span className="caption inline-flex items-center gap-1 text-danger">
      <ArrowDown className="size-3" aria-hidden />
      <span className="num">{Math.round(trend * 100)}pp</span>
    </span>
  );
}
