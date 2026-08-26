import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

import { Blueprint } from "@/components/rumvia/blueprint";
import { ChartCard } from "@/components/rumvia/chart-card";
import { DataTable, type DataTableColumn } from "@/components/rumvia/data-table";
import { GapRing } from "@/components/rumvia/gap-ring";
import { MetricCard } from "@/components/rumvia/metric-card";
import { PageHeader } from "@/components/rumvia/page-header";
import { SkillBadge } from "@/components/rumvia/skill-badge";
import { EmptyState, ErrorState, LoadingState } from "@/components/rumvia/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ACCENT,
  ACCENT2,
  CHART_AXIS,
  CHART_SERIES,
  GAP_SCALE,
  NEUTRAL,
  chartColor,
} from "@/lib/design-tokens";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Design System RUMVIA — referência viva" },
      {
        name: "description",
        content:
          "Referência viva do Design System RUMVIA: ramps de cor, escala tipográfica, escala de gap, componentes e paleta de gráficos.",
      },
      { property: "og:title", content: "Design System RUMVIA — referência viva" },
      {
        property: "og:description",
        content: "Ramps, tipografia, escala de gap, componentes e gráficos do sistema RUMVIA.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: DesignSystemPage,
});

/* ------------------------------------------------------------------ dados */

const SERIES_DATA = [
  { mes: "Jan", br: 62, remoto: 48, curadoria: 12 },
  { mes: "Fev", br: 66, remoto: 51, curadoria: 18 },
  { mes: "Mar", br: 71, remoto: 55, curadoria: 15 },
  { mes: "Abr", br: 69, remoto: 60, curadoria: 22 },
  { mes: "Mai", br: 74, remoto: 63, curadoria: 19 },
  { mes: "Jun", br: 78, remoto: 66, curadoria: 25 },
];

const SKILL_ROWS = [
  { id: "1", skill: "Kubernetes", demanda: 412, aderencia: 82, status: "dominada" as const },
  { id: "2", skill: "Terraform", demanda: 388, aderencia: 74, status: "parcial" as const },
  { id: "3", skill: "Observabilidade", demanda: 271, aderencia: 55, status: "parcial" as const },
  { id: "4", skill: "Go", demanda: 244, aderencia: 31, status: "faltante" as const },
  { id: "5", skill: "ArgoCD", demanda: 190, aderencia: 88, status: "dominada" as const },
  { id: "6", skill: "Ansible", demanda: 152, aderencia: 44, status: "parcial" as const },
  { id: "7", skill: "Pulumi", demanda: 88, aderencia: 12, status: "faltante" as const },
  { id: "8", skill: "Bash", demanda: 340, aderencia: 91, status: "extra" as const },
];

const COLUMNS: DataTableColumn<(typeof SKILL_ROWS)[number]>[] = [
  {
    key: "skill",
    header: "Skill",
    cell: (r) => <SkillBadge name={r.skill} status={r.status} />,
    sortValue: (r) => r.skill,
  },
  {
    key: "demanda",
    header: "Vagas",
    cell: (r) => r.demanda,
    sortValue: (r) => r.demanda,
    align: "right",
    numeric: true,
  },
  {
    key: "aderencia",
    header: "Aderência",
    cell: (r) => `${r.aderencia}%`,
    sortValue: (r) => r.aderencia,
    align: "right",
    numeric: true,
  },
];

/* --------------------------------------------------------------- helpers */

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-4 border-t border-divider pt-6">
      <div>
        <h6 className="text-accent-700">{id}</h6>
        <h2 className="mt-1 font-heading">{title}</h2>
        {description ? <p className="mt-1 text-body text-neutral-700">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex flex-col">
      <div className="h-12 border border-divider" style={{ backgroundColor: hex }} />
      <span className="label-h6 mt-1 text-neutral-700">{name}</span>
      <span className="num text-caption text-neutral-600">{hex}</span>
    </div>
  );
}

function Ramp({ title, ramp }: { title: string; ramp: Record<string, string> }) {
  return (
    <div>
      <h6 className="mb-2 text-neutral-700">{title}</h6>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
        {Object.entries(ramp).map(([step, hex]) => (
          <Swatch key={step} name={step} hex={hex} />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ page */

function DesignSystemPage() {
  const [loading, setLoading] = React.useState(false);

  return (
    <div className="rumvia-container py-8">
      <PageHeader
        eyebrow="Referência viva"
        title="Design System RUMVIA"
        subtitle="Base Industry — cantos retos, hairlines, densidade alta, paleta dessaturada."
        actions={
          <Badge variant="neutral" className="num">
            v1 · MVP
          </Badge>
        }
      />

      <div className="mt-6 flex flex-col gap-8">
        {/* 01 — CORES */}
        <Section
          id="01"
          title="Cores"
          description="Todas as cores são tokens. Nenhum hex solto em componente."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Swatch name="bg" hex="#f2f2f3" />
            <Swatch name="surface" hex="#e9e9ea" />
            <Swatch name="text" hex="#1d1f20" />
            <Swatch name="accent" hex="#5980a6" />
            <Swatch name="accent-2" hex="#728fab" />
          </div>
          <Ramp title="Ramp neutral 100 → 900" ramp={NEUTRAL} />
          <Ramp title="Ramp accent 100 → 900" ramp={ACCENT} />
          <Ramp title="Ramp accent-2 100 → 900" ramp={ACCENT2} />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Swatch name="success" hex="#52785f" />
            <Swatch name="warning" hex="#b3862e" />
            <Swatch name="danger" hex="#a3452f" />
            <Swatch name="info" hex="#5980a6" />
          </div>
          <Blueprint className="p-4">
            <h6 className="text-neutral-700">Regra de contraste</h6>
            <p className="mt-2 text-body">
              <span className="text-accent-700">accent-700 (#416180)</span> — 5.8:1, único tom de
              destaque permitido em <strong>texto</strong>. O <span className="text-accent">accent
              (#5980a6)</span> dá 3.7:1: serve para bordas, ícones e elementos de UI, mas reprova em
              AA para texto. Texto padrão é sempre <code className="num">--color-text</code>.
            </p>
          </Blueprint>
        </Section>

        {/* 02 — TIPOGRAFIA */}
        <Section id="02" title="Tipografia" description="Barlow Condensed 600 + Barlow + IBM Plex Mono.">
          <Blueprint className="flex flex-col gap-3 p-4">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">h1 · 42</span>
              <h1>Aderência à trilha</h1>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">h2 · 32</span>
              <h2>Demanda do mercado</h2>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">h3 · 25</span>
              <h3>Skills faltantes</h3>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">h4 · 20</span>
              <h4>Segmento remoto global</h4>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">h5 · 16</span>
              <h5>Fila de curadoria</h5>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">h6 · 13</span>
              <h6>Rótulo de métrica</h6>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">body · 15</span>
              <p className="text-body">
                Corpo de texto em Barlow 400, altura de linha 1.55. Usado em descrições, parágrafos e
                conteúdo corrido da interface.
              </p>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">caption · 13</span>
              <p className="caption">Legenda auxiliar em neutral-600.</p>
            </div>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-4">
              <span className="caption num w-24">mono</span>
              <p className="num text-body">1.284 vagas · 82,4% · R$ 18.500 · US$ 6.200</p>
            </div>
          </Blueprint>
        </Section>

        {/* 03 — ESCALA DE GAP */}
        <Section
          id="03"
          title="Escala de gap"
          description="A cor do indicador vem sempre da escala — nunca hardcoded na tela."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { v: 27, faixa: "0–39%", nome: "critical" },
              { v: 52, faixa: "40–59%", nome: "low" },
              { v: 71, faixa: "60–79%", nome: "mid" },
              { v: 91, faixa: "80–100%", nome: "high" },
            ].map((g) => (
              <Blueprint key={g.nome} className="flex flex-col items-center gap-2 p-4">
                <GapRing value={g.v} size={104} />
                <span className="caption num">{g.faixa}</span>
                <span className="num text-caption text-neutral-600">
                  {GAP_SCALE[g.nome as keyof typeof GAP_SCALE]}
                </span>
              </Blueprint>
            ))}
          </div>
        </Section>

        {/* 04 — BOTÕES */}
        <Section id="04" title="Botões" description="Derivados da classe estrutural .btn — canto reto.">
          <Blueprint className="flex flex-col gap-4 p-4">
            {(["default", "outline", "secondary", "ghost", "destructive", "link"] as const).map(
              (v) => (
                <div key={v} className="flex flex-wrap items-center gap-2">
                  <span className="label-h6 w-24 shrink-0 text-neutral-600">{v}</span>
                  <Button variant={v}>Padrão</Button>
                  <Button variant={v} className="hover:brightness-95">
                    Hover
                  </Button>
                  <Button variant={v} disabled>
                    Desabilitado
                  </Button>
                  <Button variant={v} loading>
                    Carregando
                  </Button>
                </div>
              ),
            )}
            <div className="flex flex-wrap items-center gap-2">
              <span className="label-h6 w-24 shrink-0 text-neutral-600">tamanhos</span>
              <Button size="sm">sm</Button>
              <Button>default</Button>
              <Button size="lg">lg</Button>
            </div>
          </Blueprint>
        </Section>

        {/* 05 — FORMULÁRIOS */}
        <Section id="05" title="Campos" description="Classe .field: hairline, canto reto, foco em accent-600.">
          <Blueprint className="grid gap-4 p-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="label-h6 text-neutral-700">Cargo alvo</span>
              <Input placeholder="Ex.: Platform Engineer" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-h6 text-neutral-700">Desabilitado</span>
              <Input placeholder="Indisponível" disabled />
            </label>
            <label className="flex flex-col gap-1">
              <span className="label-h6 text-neutral-700">Trilha</span>
              <select className="field h-8">
                <option>DevOps Engineer</option>
                <option>Platform Engineer</option>
                <option>SRE</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="label-h6 text-neutral-700">Resumo profissional</span>
              <Textarea placeholder="Cole aqui o resumo do seu currículo…" />
              <span className="caption">Texto livre. Nenhuma chave de API trafega no front.</span>
            </label>
          </Blueprint>
        </Section>

        {/* 06 — TAGS E SKILLS */}
        <Section id="06" title="Tags e skills" description="Estados: dominada, parcial, faltante, extra.">
          <Blueprint className="flex flex-wrap gap-2 p-4">
            <SkillBadge name="Kubernetes" status="dominada" showStatus />
            <SkillBadge name="Terraform" status="parcial" showStatus />
            <SkillBadge name="Go" status="faltante" showStatus />
            <SkillBadge name="Bash" status="extra" showStatus />
            <Badge>accent</Badge>
            <Badge variant="neutral">neutral</Badge>
            <Badge variant="outline">outline</Badge>
            <Badge variant="success">success</Badge>
            <Badge variant="warning">warning</Badge>
            <Badge variant="danger">danger</Badge>
          </Blueprint>
        </Section>

        {/* 07 — MÉTRICAS */}
        <Section id="07" title="MetricCard" description="Valor em mono tabular, delta e legenda h6.">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Aderência geral" value="78" unit="%" delta={4.2} hint="vs. mês anterior" />
            <MetricCard label="Vagas analisadas" value="1.284" delta={-3.1} hint="Segmento: Brasil" />
            <MetricCard label="Skills faltantes" value="7" delta={0} hint="Trilha: Platform Engineer" />
            <MetricCard label="Mediana salarial" value="18.500" unit="BRL" delta={2.6} hint="Brasil" />
          </div>
        </Section>

        {/* 08 — TABELA */}
        <Section id="08" title="DataTable" description="Ordenação, busca, paginação e estado vazio.">
          <DataTable columns={COLUMNS} rows={SKILL_ROWS} rowKey={(r) => r.id} pageSize={5} />
        </Section>

        {/* 09 — ESTADOS */}
        <Section id="09" title="Estados" description="Vazio, carregando (skeleton neutral-200) e erro.">
          <div className="grid gap-4 lg:grid-cols-3">
            <EmptyState
              title="Nenhuma vaga no segmento"
              description="Ainda não há vagas ingeridas para este segmento e trilha."
              action={
                <Button variant="outline" size="sm">
                  Importar CSV
                </Button>
              }
            />
            <LoadingState rows={5} />
            <ErrorState onRetry={() => setLoading((l) => !l)} description={loading ? "Recarregando…" : undefined} />
          </div>
        </Section>

        {/* 10 — DIÁLOGO */}
        <Section id="10" title="Diálogo" description="Canto reto, hairline, sombra lg.">
          <Blueprint className="p-4">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline">Abrir diálogo</Button>
              </DialogTrigger>
              <DialogContent className="dialog">
                <DialogHeader>
                  <DialogTitle className="font-heading text-h4">Confirmar análise</DialogTitle>
                  <DialogDescription className="caption">
                    A análise será calculada para a trilha e o segmento selecionados.
                  </DialogDescription>
                </DialogHeader>
                <p className="text-body">
                  O score de aderência é calculado por uma única fórmula no servidor. Nenhuma tela
                  recalcula esse número.
                </p>
                <DialogFooter>
                  <Button variant="ghost">Cancelar</Button>
                  <Button>Calcular</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Blueprint>
        </Section>

        {/* 11 — BLUEPRINT */}
        <Section
          id="11"
          title="Blueprint"
          description="Contêiner base: hairline, radius 0 e marcas de registro automáticas."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Blueprint className="p-6">
              <h5 className="font-heading">Com marcas de registro</h5>
              <p className="caption mt-2">
                Os quatro cantos são renderizados pelo componente. Nunca escreva os elementos de
                canto à mão.
              </p>
            </Blueprint>
            <Blueprint marks={false} className="p-6">
              <h5 className="font-heading">Sem marcas</h5>
              <p className="caption mt-2">Mantém hairline e canto reto, sem marcas de registro.</p>
            </Blueprint>
          </div>
        </Section>

        {/* 12 — GRÁFICOS */}
        <Section
          id="12"
          title="Gráficos"
          description="Paleta fixa derivada das ramps. Eixos e grid em divider, rótulos em caption, sem gradiente."
        >
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {CHART_SERIES.map((hex, i) => (
              <Swatch key={hex + i} name={`série ${i + 1}`} hex={hex} />
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard
              title="Aderência média por mês"
              description="Barras com canto reto"
              legend={[
                { label: "Brasil", color: chartColor(0) },
                { label: "Remoto global", color: chartColor(1) },
              ]}
              footnote="Segmentos nunca são somados no mesmo número."
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={SERIES_DATA}>
                    <CartesianGrid stroke={CHART_AXIS.stroke} vertical={false} />
                    <XAxis dataKey="mes" tickLine={false} stroke={CHART_AXIS.stroke} />
                    <YAxis tickLine={false} stroke={CHART_AXIS.stroke} width={32} />
                    <Bar dataKey="br" fill={chartColor(0)} radius={0} />
                    <Bar dataKey="remoto" fill={chartColor(1)} radius={0} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Fila de curadoria"
              description="Área sem gradiente"
              legend={[{ label: "Termos desconhecidos", color: chartColor(2) }]}
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={SERIES_DATA}>
                    <CartesianGrid stroke={CHART_AXIS.stroke} vertical={false} />
                    <XAxis dataKey="mes" tickLine={false} stroke={CHART_AXIS.stroke} />
                    <YAxis tickLine={false} stroke={CHART_AXIS.stroke} width={32} />
                    <Area
                      type="linear"
                      dataKey="curadoria"
                      stroke={chartColor(0)}
                      fill={chartColor(2)}
                      fillOpacity={1}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard
              title="Evolução da aderência"
              description="Linha"
              legend={[
                { label: "Brasil", color: chartColor(0) },
                { label: "Remoto global", color: chartColor(3) },
              ]}
              className="lg:col-span-2"
            >
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={SERIES_DATA}>
                    <CartesianGrid stroke={CHART_AXIS.stroke} vertical={false} />
                    <XAxis dataKey="mes" tickLine={false} stroke={CHART_AXIS.stroke} />
                    <YAxis tickLine={false} stroke={CHART_AXIS.stroke} width={32} />
                    <Line type="linear" dataKey="br" stroke={chartColor(0)} dot={false} strokeWidth={2} />
                    <Line
                      type="linear"
                      dataKey="remoto"
                      stroke={chartColor(3)}
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>
        </Section>
      </div>
    </div>
  );
}
