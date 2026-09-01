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
} from "recharts";
import { Info } from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMarket, SENIORITY_LABEL, SENIORITIES, type Seniority } from "@/hooks/use-market";
import { useAuth } from "@/hooks/use-auth";
import {
  getSalaryStats,
  submitSalaryObservation,
  type SubmitSalaryInput,
} from "@/lib/market.functions";
import { CHART_AXIS, chartColor } from "@/lib/design-tokens";

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

function formatCurrency(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyCompact(value: number, currency: string): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

interface SalaryBarDatum {
  name: string;
  p50: number;
  sampleSize: number;
}

// Label acima da barra: mediana em destaque + tamanho da amostra logo abaixo.
function makeMedianLabel(currency: string, data: SalaryBarDatum[]) {
  return function MedianLabel(props: {
    x?: number;
    y?: number;
    width?: number;
    value?: number;
    index?: number;
  }) {
    const { x = 0, y = 0, width = 0, value = 0, index } = props;
    if (!value) return <React.Fragment />;
    const n = index !== undefined ? data[index]?.sampleSize : undefined;
    return (
      <g>
        <text
          x={x + width / 2}
          y={y - 18}
          textAnchor="middle"
          fontSize={12}
          fontWeight={600}
          fill="var(--color-neutral-800, #1d1f20)"
        >
          {formatCurrencyCompact(value, currency)}
        </text>
        {n ? (
          <text
            x={x + width / 2}
            y={y - 5}
            textAnchor="middle"
            fontSize={10}
            fill="var(--color-muted-foreground, #888)"
          >
            n={n}
          </text>
        ) : null}
      </g>
    );
  };
}

function SalariosPage() {
  const { trackId, segment, seniority: profileSeniority } = useMarket();
  const { isAnonymous } = useAuth();

  const [viewSeniority, setViewSeniority] = React.useState<Seniority>(profileSeniority);
  const [showForm, setShowForm] = React.useState(false);
  const [formMin, setFormMin] = React.useState("");
  const [formMax, setFormMax] = React.useState("");
  const [formSeniority, setFormSeniority] = React.useState<Seniority>(profileSeniority);
  const [submitted, setSubmitted] = React.useState(false);

  const statsRun = useServerFn(getSalaryStats);
  const submitRun = useServerFn(submitSalaryObservation);

  const statsQuery = useQuery({
    queryKey: ["salary_stats", trackId],
    enabled: !!trackId,
    staleTime: 5 * 60 * 1000,
    queryFn: () => statsRun({ data: { trackId: trackId! } }),
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

  const chartData: SalaryBarDatum[] = segmentRows.map((r) => ({
    name: SENIORITY_LABEL[r.seniority as Seniority] ?? r.seniority,
    p50: r.p50,
    sampleSize: r.sampleSize,
  }));
  const chartCurrency = segment === "br" ? "BRL" : "USD";

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
                    <div className="flex flex-col">
                      <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>Mediana</span>
                      <span className="font-semibold text-2xl">{formatCurrency(brSen.p50, "BRL")}</span>
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
                    <div className="flex flex-col">
                      <span className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>Mediana</span>
                      <span className="font-semibold text-2xl">{formatCurrency(globalSen.p50, "USD")}</span>
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
        <h2 className="font-semibold text-base mb-4">{segLabel} — Mediana por Senioridade</h2>
        {statsQuery.isLoading && <LoadingState />}
        {statsQuery.isSuccess && chartData.length === 0 && (
          <EmptyState title="Sem dados" description="Não há amostras salariais para esta configuração ainda." />
        )}
        {statsQuery.isSuccess && chartData.length > 0 && (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ left: 8, right: 8, top: 32, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={CHART_AXIS.stroke} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12, fill: CHART_AXIS.tickFill }}
                stroke={CHART_AXIS.stroke}
              />
              <YAxis hide domain={[0, (max: number) => max * 1.2]} />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value, chartCurrency), "Mediana"]}
                labelFormatter={(name: string) => name}
              />
              <Bar
                dataKey="p50"
                fill={chartColor(0)}
                radius={0}
                maxBarSize={72}
                label={makeMedianLabel(chartCurrency, chartData)}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        <p className="text-xs mt-2" style={{ color: "var(--color-muted-foreground, #888)" }}>
          Cada barra é a mediana salarial do nível. n= indica quantas vagas com salário entraram na amostra.
        </p>
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
