import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { AlertTriangle, Info, TrendingUp, TrendingDown, Minus } from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { SkillBadge } from "@/components/rumvia/skill-badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMarket, SENIORITY_LABEL, SENIORITIES, type Seniority } from "@/hooks/use-market";
import { useGap } from "@/hooks/use-gap";
import { useAuth } from "@/hooks/use-auth";
import {
  getSalaryStats,
  getSalarySkillImpact,
  submitSalaryObservation,
  type SubmitSalaryInput,
} from "@/lib/market.functions";

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

const CHART_COLORS = ["#416180", "#7e9cb8", "#b5d9fd", "#5d5d60", "#94bce3"];

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function DeltaIcon({ pct }: { pct: number }) {
  if (pct > 2) return <TrendingUp size={14} style={{ color: "var(--color-success)" }} />;
  if (pct < -2) return <TrendingDown size={14} style={{ color: "var(--color-danger)" }} />;
  return <Minus size={14} style={{ color: "var(--color-muted-foreground, #888)" }} />;
}

// Custom bar label: shows sample count
function SampleLabel(props: { x?: number; y?: number; width?: number; height?: number; value?: number }) {
  const { x = 0, y = 0, width = 0, height = 0, value = 0 } = props;
  if (!value) return null;
  return (
    <text x={x + width + 4} y={y + height / 2 + 4} fontSize={11} fill="var(--color-muted-foreground, #888)">
      n={value}
    </text>
  );
}

function SalariosPage() {
  const { trackId, segment, seniority: profileSeniority, periodDays } = useMarket();
  const { isAnonymous } = useAuth();
  const { data: gapData } = useGap();

  const [viewSeniority, setViewSeniority] = React.useState<Seniority>(profileSeniority);
  const [simSeniority, setSimSeniority] = React.useState<Seniority>(profileSeniority);
  const [simSkills, setSimSkills] = React.useState<Set<string>>(new Set());
  const [showForm, setShowForm] = React.useState(false);
  const [formMin, setFormMin] = React.useState("");
  const [formMax, setFormMax] = React.useState("");
  const [formSeniority, setFormSeniority] = React.useState<Seniority>(profileSeniority);
  const [submitted, setSubmitted] = React.useState(false);

  const statsRun = useServerFn(getSalaryStats);
  const impactRun = useServerFn(getSalarySkillImpact);
  const submitRun = useServerFn(submitSalaryObservation);

  const statsQuery = useQuery({
    queryKey: ["salary_stats", trackId],
    enabled: !!trackId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => statsRun({ data: { trackId: trackId! } }),
  });

  const impactQuery = useQuery({
    queryKey: ["salary_skill_impact", trackId, segment, periodDays],
    enabled: !!trackId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => impactRun({ data: { trackId: trackId!, segment, periodDays } }),
  });

  const submitMutation = useMutation({
    mutationFn: (input: SubmitSalaryInput) => submitRun({ data: input }),
    onSuccess: () => setSubmitted(true),
  });

  const stats = statsQuery.data;
  const brRows = (stats?.rows ?? []).filter((r) => r.marketSegment === "br");
  const globalRows = (stats?.rows ?? []).filter((r) => r.marketSegment === "remoto_global");
  const brSen = brRows.find((r) => r.seniority === viewSeniority);
  const globalSen = globalRows.find((r) => r.seniority === viewSeniority);
  const segmentRows = (segment === "br" ? brRows : globalRows).sort(
    (a, b) => SENIORITIES.indexOf(a.seniority as Seniority) - SENIORITIES.indexOf(b.seniority as Seniority),
  );

  const missingSkills = new Set(
    (gapData?.items ?? []).filter((i) => i.status === "faltante").map((i) => i.skillId),
  );

  // Simulator
  const simRow = (segment === "br" ? brRows : globalRows).find((r) => r.seniority === simSeniority);
  const selectedImpacts = (impactQuery.data ?? []).filter((r) => simSkills.has(r.skillId));
  const simSampleOk = (simRow?.sampleSize ?? 0) >= 20;
  const simAvgDelta =
    selectedImpacts.length > 0
      ? selectedImpacts.reduce((sum, r) => sum + r.deltaPct, 0) / selectedImpacts.length
      : 0;
  const simP25 = simRow ? simRow.p25 * (1 + simAvgDelta / 100) : 0;
  const simP75 = simRow ? simRow.p75 * (1 + simAvgDelta / 100) : 0;
  const simCurrency = segment === "br" ? "BRL" : "USD";

  const chartData = segmentRows.map((r) => ({
    name: SENIORITY_LABEL[r.seniority as Seniority] ?? r.seniority,
    base: r.p25,
    range: r.p75 - r.p25,
    p50: r.p50,
    sampleSize: r.sampleSize,
  }));

  function toggleSimSkill(skillId: string) {
    setSimSkills((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trackId) return;
    const min = Number(formMin.replace(/\D/g, ""));
    const max = Number(formMax.replace(/\D/g, ""));
    if (!min || !max || min > max) return;
    submitMutation.mutate({
      trackId,
      seniority: formSeniority,
      marketSegment: segment,
      amountMin: min,
      amountMax: max,
      currency: segment === "br" ? "BRL" : "USD",
      period: "monthly",
    });
  }

  if (!trackId) return <EmptyState title="Selecione uma trilha" description="Escolha sua trilha de carreira nas configurações." />;

  const segLabel = segment === "br" ? "Brasil (BRL)" : "Remoto global (USD)";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Mercado"
        title="Salários"
        subtitle={`Faixas apuradas separadamente para cada segmento — nunca misturadas.`}
      />

      {/* Disclaimer permanente */}
      <div className="flex items-start gap-2 text-sm" style={{ color: "var(--color-muted-foreground, #888)" }}>
        <Info size={14} className="mt-0.5 shrink-0" />
        <span>Dados derivados de vagas publicadas, não de pesquisa salarial. A amostra brasileira é menor porque o MVP usa apenas fontes gratuitas.</span>
      </div>

      {/* Comparação BR x Global */}
      <Blueprint>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base">Brasil × Remoto Global</h2>
          <Select value={viewSeniority} onValueChange={(v) => setViewSeniority(v as Seniority)}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SENIORITIES.map((s) => (
                <SelectItem key={s} value={s}>{SENIORITY_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {statsQuery.isLoading && <LoadingState />}
        {statsQuery.isError && <ErrorState title="Erro" description="Não foi possível carregar os dados." />}
        {statsQuery.isSuccess && (
          <>
            <div className="grid grid-cols-2 gap-4">
              {/* BR column */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent-600, #416180)" }}>
                  Brasil — BRL/mês
                </div>
                {brSen ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {[["P25", brSen.p25], ["Mediana", brSen.p50], ["P75", brSen.p75]].map(([label, val]) => (
                        <div key={label as string} className="flex flex-col">
                          <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>{label}</span>
                          <span className="font-semibold text-sm">{formatCurrency(val as number, "BRL")}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-warning)" }}>
                      n={brSen.sampleSize} — amostra menor (fontes gratuitas)
                    </div>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: "var(--color-muted-foreground, #888)" }}>Sem dados para {SENIORITY_LABEL[viewSeniority]}</span>
                )}
              </div>

              {/* Global column */}
              <div className="flex flex-col gap-2">
                <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--color-accent-600, #416180)" }}>
                  Remoto Global — USD/mês
                </div>
                {globalSen ? (
                  <>
                    <div className="grid grid-cols-3 gap-2">
                      {[["P25", globalSen.p25], ["Mediana", globalSen.p50], ["P75", globalSen.p75]].map(([label, val]) => (
                        <div key={label as string} className="flex flex-col">
                          <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>{label}</span>
                          <span className="font-semibold text-sm">{formatCurrency(val as number, "USD")}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs mt-1" style={{ color: "var(--color-muted-foreground, #888)" }}>
                      n={globalSen.sampleSize}
                    </div>
                  </>
                ) : (
                  <span className="text-sm" style={{ color: "var(--color-muted-foreground, #888)" }}>Sem dados para {SENIORITY_LABEL[viewSeniority]}</span>
                )}
              </div>
            </div>

            {/* Conversion line */}
            {stats && brSen && globalSen && (
              <div className="mt-3 pt-3 border-t text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                Equivalência: mediana global = {formatCurrency(globalSen.p50 * stats.usdBrl, "BRL")}/mês · 1 USD = R$ {stats.usdBrl.toFixed(2)} em {stats.rateDate}
              </div>
            )}
          </>
        )}
      </Blueprint>

      {/* Faixa por senioridade — segmento ativo */}
      <Blueprint>
        <h2 className="font-semibold text-base mb-4">{segLabel} — Faixa por Senioridade</h2>
        {statsQuery.isLoading && <LoadingState />}
        {statsQuery.isSuccess && chartData.length === 0 && (
          <EmptyState title="Sem dados" description="Não há amostras salariais para esta configuração ainda." />
        )}
        {statsQuery.isSuccess && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 60, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis
                type="number"
                tickFormatter={(v) => formatCurrency(v as number, segment === "br" ? "BRL" : "USD")}
                tick={{ fontSize: 10 }}
              />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={56} />
              <Tooltip
                formatter={(value: number, name: string) => {
                  if (name === "base") return null;
                  const label = name === "range" ? "P25–P75" : name;
                  return [formatCurrency(value, segment === "br" ? "BRL" : "USD"), label];
                }}
              />
              {/* Transparent base up to p25 */}
              <Bar dataKey="base" stackId="range" fill="transparent" />
              {/* Colored range p25→p75 */}
              <Bar dataKey="range" stackId="range" fill={CHART_COLORS[0]} label={<SampleLabel />} />
              {/* Median reference line per bar — shown via ReferenceLine would conflict with layout=vertical */}
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-xs mt-2" style={{ color: "var(--color-muted-foreground, #888)" }}>
          Barras mostram faixa P25–P75. n= indica número de amostras daquele nível.
        </p>
      </Blueprint>

      {/* Impacto de Skills no Salário */}
      <Blueprint>
        <h2 className="font-semibold text-base mb-1">Impacto de Skills no Salário</h2>
        <p className="text-xs mb-4" style={{ color: "var(--color-muted-foreground, #888)" }}>
          Mediana das vagas que pedem cada skill vs. mediana geral — {segLabel}.
        </p>
        {impactQuery.isLoading && <LoadingState />}
        {impactQuery.isError && <ErrorState title="Erro" description="Não foi possível carregar." />}
        {impactQuery.isSuccess && (impactQuery.data ?? []).length === 0 && (
          <EmptyState title="Sem dados" description="Amostra insuficiente para este segmento." />
        )}
        {impactQuery.isSuccess && (impactQuery.data ?? []).length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                  <th className="text-left py-2 pr-4 font-medium">Skill</th>
                  <th className="text-right py-2 pr-4 font-medium">Mediana (skill)</th>
                  <th className="text-right py-2 pr-4 font-medium">Mediana (geral)</th>
                  <th className="text-right py-2 font-medium">Delta</th>
                </tr>
              </thead>
              <tbody>
                {(impactQuery.data ?? []).map((row) => {
                  const isMissing = missingSkills.has(row.skillId);
                  return (
                    <tr key={row.skillId} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          {isMissing ? (
                            <SkillBadge name={row.name} status="faltante" />
                          ) : (
                            <span>{row.name}</span>
                          )}
                          {isMissing && row.deltaPct > 5 && (
                            <span className="text-xs font-semibold" style={{ color: "var(--color-warning)" }}>↑ vale a pena</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.salarySample >= 5 ? formatCurrency(row.salaryP50, segment === "br" ? "BRL" : "USD") : "—"}
                        {row.salarySample > 0 && row.salarySample < 5 && (
                          <span className="text-xs ml-1" style={{ color: "var(--color-muted-foreground, #888)" }}>(n&lt;5)</span>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {row.overallP50 > 0 ? formatCurrency(row.overallP50, segment === "br" ? "BRL" : "USD") : "—"}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DeltaIcon pct={row.deltaPct} />
                          <span
                            className="tabular-nums text-xs font-semibold"
                            style={{
                              color:
                                row.deltaPct > 2
                                  ? "var(--color-success)"
                                  : row.deltaPct < -2
                                  ? "var(--color-danger)"
                                  : "inherit",
                            }}
                          >
                            {row.deltaPct > 0 ? "+" : ""}
                            {row.deltaPct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Blueprint>

      {/* Simulador */}
      <Blueprint>
        <h2 className="font-semibold text-base mb-1">Simulador</h2>
        <p className="text-xs mb-4" style={{ color: "var(--color-muted-foreground, #888)" }}>
          Selecione a senioridade-alvo e as skills que você dominar — veja a faixa esperada.
        </p>

        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Senioridade-alvo</Label>
            <Select value={simSeniority} onValueChange={(v) => setSimSeniority(v as Seniority)}>
              <SelectTrigger className="w-36 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SENIORITIES.map((s) => (
                  <SelectItem key={s} value={s}>{SENIORITY_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {impactQuery.isSuccess && (impactQuery.data ?? []).length > 0 && (
          <div className="mb-4">
            <Label className="text-xs mb-2 block">Skills que você vai dominar (selecione):</Label>
            <div className="flex flex-wrap gap-2">
              {(impactQuery.data ?? []).map((row) => (
                <button
                  key={row.skillId}
                  onClick={() => toggleSimSkill(row.skillId)}
                  className="text-xs px-2 py-1 border transition-colors"
                  style={{
                    background: simSkills.has(row.skillId) ? "var(--color-accent-600, #416180)" : "transparent",
                    color: simSkills.has(row.skillId) ? "#fff" : "inherit",
                    borderColor: "var(--color-border, currentColor)",
                  }}
                >
                  {row.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {simRow ? (
          <div className="flex flex-col gap-1">
            {!simSampleOk && (
              <div className="flex items-center gap-1 text-xs mb-2" style={{ color: "var(--color-warning)" }}>
                <AlertTriangle size={12} />
                <span>Amostra reduzida (n={simRow.sampleSize}) — estimativa menos confiável</span>
              </div>
            )}
            <div className="text-sm">
              Faixa esperada:{" "}
              <span className="font-semibold">
                {formatCurrency(simP25, simCurrency)} – {formatCurrency(simP75, simCurrency)}
              </span>
              {selectedImpacts.length > 0 && (
                <span className="ml-2 text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
                  (ajuste médio de {simAvgDelta > 0 ? "+" : ""}{simAvgDelta.toFixed(1)}% pelas skills)
                </span>
              )}
            </div>
          </div>
        ) : (
          <EmptyState title="Sem dados para esta senioridade" description="Amostra insuficiente." />
        )}
      </Blueprint>

      {/* Contribuição de salário */}
      {isAnonymous ? (
        <Blueprint>
          <div className="flex items-center gap-2 text-sm">
            <Info size={14} />
            <span>
              <strong>Contribua com seu salário</strong> — crie uma conta permanente para ajudar a adensar a amostra brasileira.
            </span>
          </div>
        </Blueprint>
      ) : (
        <Blueprint>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="font-semibold text-base">Contribuir com seu salário</h2>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground, #888)" }}>
                Anônimo — nunca exibido individualmente, só agregado com n≥5.
              </p>
            </div>
            {!showForm && !submitted && (
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                Contribuir
              </Button>
            )}
          </div>

          {submitted && (
            <p className="text-sm" style={{ color: "var(--color-success)" }}>
              Obrigado! Sua contribuição foi registrada.
            </p>
          )}

          {showForm && !submitted && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 mt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Senioridade</Label>
                  <Select value={formSeniority} onValueChange={(v) => setFormSeniority(v as Seniority)}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SENIORITIES.map((s) => (
                        <SelectItem key={s} value={s}>{SENIORITY_LABEL[s]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Moeda</Label>
                  <div className="h-8 flex items-center px-3 border text-sm">
                    {segment === "br" ? "BRL (R$)" : "USD ($)"}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Salário mínimo (mensal)</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="ex: 8000"
                    value={formMin}
                    onChange={(e) => setFormMin(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Salário máximo (mensal)</Label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="ex: 12000"
                    value={formMax}
                    onChange={(e) => setFormMax(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={submitMutation.isPending}>
                  {submitMutation.isPending ? "Enviando…" : "Enviar"}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                  Cancelar
                </Button>
              </div>
              {submitMutation.isError && (
                <p className="text-xs" style={{ color: "var(--color-danger)" }}>
                  Erro ao enviar. Tente novamente.
                </p>
              )}
            </form>
          )}
        </Blueprint>
      )}
    </div>
  );
}
