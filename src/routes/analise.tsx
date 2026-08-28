import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BarChart3,
  Building2,
  CheckCircle2,
  Circle,
  Loader2,
  Plus,
  Save,
  Wallet,
} from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";

import { CvDropzone } from "@/components/app/cv-dropzone";
import { AdicionarSkill } from "@/components/app/adicionar-skill";
import { PublicHeader } from "@/components/app/public-header";
import { RequireAccount } from "@/components/auth/require-account";
import { Blueprint } from "@/components/rumvia/blueprint";
import { ChartCard } from "@/components/rumvia/chart-card";
import { GapRing } from "@/components/rumvia/gap-ring";
import { MetricCard } from "@/components/rumvia/metric-card";
import { PageHeader } from "@/components/rumvia/page-header";
import { SkillBadge } from "@/components/rumvia/skill-badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCv, hasExtractedCv } from "@/hooks/use-current-cv";
import {
  SEGMENT_LABEL,
  SENIORITIES,
  SENIORITY_LABEL,
  type MarketSegment,
  type Seniority,
} from "@/hooks/use-market";
import { applyCvAnalysis } from "@/lib/analysis.functions";
import { computeGap } from "@/lib/gap.functions";
import { parseCv, resetVisitorCvs } from "@/lib/cv.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/analise")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    cv: typeof search["cv"] === "string" ? (search["cv"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sua análise gratuita — RUMVIA" },
      {
        name: "description",
        content:
          "Veja sua aderência ao mercado: score, skills reconhecidas e as maiores lacunas da sua trilha, sem criar conta.",
      },
      { property: "og:title", content: "Sua análise gratuita — RUMVIA" },
      {
        property: "og:description",
        content: "Prévia da sua aderência ao mercado de tecnologia, com dados reais de vagas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AnalisePage,
});

type Stage = "aguardando" | "enviando" | "lendo" | "identificando" | "comparando" | "pronto";

const STAGE_STEPS: { key: Stage; label: string }[] = [
  { key: "enviando", label: "Enviando o arquivo" },
  { key: "lendo", label: "Lendo o documento" },
  { key: "identificando", label: "Identificando skills" },
  { key: "comparando", label: "Comparando com as vagas" },
];

const STAGE_ORDER: Stage[] = [
  "aguardando",
  "enviando",
  "lendo",
  "identificando",
  "comparando",
  "pronto",
];

function AnalisePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const { user, isAnonymous, loading: authLoading } = useAuth();

  const runParse = useServerFn(parseCv);
  const runApply = useServerFn(applyCvAnalysis);
  const runGap = useServerFn(computeGap);
  const runReset = useServerFn(resetVisitorCvs);

  const [stage, setStage] = React.useState<Stage>("aguardando");
  const [erro, setErro] = React.useState<string | null>(null);
  const [cvId, setCvId] = React.useState<string | null>(search.cv ?? null);
  const [trackId, setTrackId] = React.useState<string | null>(null);
  const [seniority, setSeniority] = React.useState<Seniority>("pleno");
  const [segment, setSegment] = React.useState<MarketSegment>("br");
  const [recognized, setRecognized] = React.useState<number>(0);
  const [resetando, setResetando] = React.useState(false);
  const started = React.useRef<string | null>(null);

  /**
   * Escape hatch de "visitante só pode ter 1 currículo": apaga tudo desta
   * sessão anônima e limpa o estado local, liberando a dropzone de novo.
   *
   * Existe porque o limite conta toda linha de `cvs`, não só a atual — uma
   * leitura que falha (arquivo corrompido, PDF sem texto…) já ocupa a única
   * vaga, e sem isto a pessoa ficava travada sem conseguir tentar de novo,
   * mesmo a página prometendo "sem cadastro para a prévia".
   */
  async function excluirEEnviarOutro() {
    setResetando(true);
    try {
      await runReset();
      started.current = null;
      setCvId(null);
      setErro(null);
      setStage("aguardando");
      await queryClient.invalidateQueries({ queryKey: ["analise-cv", user?.id] });
      void navigate({ to: "/analise", search: { cv: undefined }, replace: true });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setResetando(false);
    }
  }

  /** CV anterior desta sessão anônima: quem fecha a aba reencontra a análise. */
  const currentCvQuery = useCurrentCv();

  const tracksQuery = useQuery({
    queryKey: ["tracks-publicas"],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("career_tracks")
        .select("id, name")
        .eq("is_active", true)
        .order("sort_order");
      return data ?? [];
    },
  });
  const tracks = tracksQuery.data ?? [];

  const gapQuery = useQuery({
    queryKey: ["analise-gap", user?.id, trackId, seniority, segment],
    enabled: Boolean(user) && stage === "pronto",
    queryFn: () => runGap({ data: { seniority, marketSegment: segment, periodDays: 90 } }),
  });
  const gap = gapQuery.data;

  const processar = React.useCallback(
    async (id: string, fromUpload: boolean) => {
      setErro(null);
      setStage(fromUpload ? "lendo" : "lendo");
      try {
        const parsed = await runParse({ data: { cvId: id } });
        if (!parsed.ok) {
          setErro(parsed.error);
          setStage("aguardando");
          return;
        }
        setRecognized(parsed.totalSkills);
        setStage("identificando");

        const applied = await runApply({ data: { cvId: id } });
        setTrackId(applied.trackId);
        setSeniority((applied.seniority as Seniority) ?? "pleno");
        setStage("comparando");

        await queryClient.invalidateQueries({ queryKey: ["analise-gap"] });
        setStage("pronto");
      } catch (err) {
        setErro((err as Error).message);
        setStage("aguardando");
      }
    },
    [queryClient, runApply, runParse],
  );

  // Dispara o processamento quando chega um CV novo pela landing.
  React.useEffect(() => {
    if (!user || !cvId) return;
    if (started.current === cvId) return;
    started.current = cvId;
    void processar(cvId, true);
  }, [user, cvId, processar]);

  // Sessão anônima retomada: reaproveita o CV já lido sem reprocessar.
  React.useEffect(() => {
    const existing = currentCvQuery.data;
    if (!existing || cvId || stage !== "aguardando") return;
    if (hasExtractedCv(existing)) {
      started.current = existing.id;
      setCvId(existing.id);
      void (async () => {
        setStage("comparando");
        const applied = await runApply({ data: { cvId: existing.id } });
        setTrackId(applied.trackId);
        setSeniority((applied.seniority as Seniority) ?? "pleno");
        setRecognized(applied.importedSkills);
        setStage("pronto");
      })();
    }
  }, [currentCvQuery.data, cvId, stage, runApply]);

  async function trocarRecorte(next: {
    trackId?: string;
    seniority?: Seniority;
    segment?: MarketSegment;
  }) {
    if (!cvId) return;
    if (next.trackId) setTrackId(next.trackId);
    if (next.seniority) setSeniority(next.seniority);
    if (next.segment) setSegment(next.segment);
    try {
      await runApply({
        data: {
          cvId,
          ...(next.trackId ? { trackId: next.trackId } : {}),
          ...(next.seniority ? { seniority: next.seniority } : {}),
          ...(next.segment ? { marketSegment: next.segment } : {}),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["analise-gap"] });
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  const trackName = tracks.find((t) => t.id === trackId)?.name ?? "sua trilha";
  const faltantes = (gap?.items ?? []).filter(
    (i) => i.status === "faltante" || i.status === "parcial",
  );
  const top3 = faltantes.slice(0, 3);
  const restantes = Math.max(0, faltantes.length - top3.length);
  const radarData = (gap?.categoryScores ?? []).map((c) => ({ categoria: c.name, score: c.score }));

  const processando = stage !== "aguardando" && stage !== "pronto";

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicHeader />
      <main className="rumvia-container flex-1 py-10">
        <PageHeader
          eyebrow="Prévia gratuita"
          title="Sua análise"
          subtitle="Leitura determinística do seu CV comparada a vagas reais dos últimos 90 dias."
        />

        {isAnonymous && stage === "pronto" ? (
          <Blueprint className="mt-6 flex flex-wrap items-center gap-3 p-4">
            <Save className="size-4 text-accent-700" aria-hidden />
            <p className="flex-1 text-caption text-neutral-700">
              Salve sua análise criando uma conta — o CV e as skills desta sessão continuam sendo
              seus, nada é reprocessado.
            </p>
            <Button size="sm" asChild>
              <Link to="/cadastro">Criar conta grátis</Link>
            </Button>
          </Blueprint>
        ) : null}

        {erro ? (
          <Blueprint className="mt-6 flex flex-wrap items-center gap-3 border-danger p-4">
            <p className="flex-1 text-body text-danger">{erro}</p>
            {isAnonymous ? (
              <Button
                variant="outline"
                size="sm"
                loading={resetando}
                onClick={() => void excluirEEnviarOutro()}
              >
                Excluir currículo e enviar outro
              </Button>
            ) : null}
          </Blueprint>
        ) : null}

        {stage === "aguardando" ? (
          <div className="mt-6 max-w-2xl">
            {authLoading || currentCvQuery.isLoading ? (
              <p className="text-caption text-neutral-600">Preparando sua sessão…</p>
            ) : (
              <CvDropzone
                onUploaded={(id) => {
                  setCvId(id);
                  void navigate({ to: "/analise", search: { cv: id }, replace: true });
                }}
              />
            )}
          </div>
        ) : null}

        {processando ? (
          <Blueprint className="mt-6 max-w-xl p-5">
            <ul className="flex flex-col gap-3">
              {STAGE_STEPS.map((s) => {
                const atual = s.key === stage;
                const feito = STAGE_ORDER.indexOf(stage) > STAGE_ORDER.indexOf(s.key);
                return (
                  <li key={s.key} className="flex items-center gap-2 text-body">
                    {feito ? (
                      <CheckCircle2 className="size-4 text-success" aria-hidden />
                    ) : atual ? (
                      <Loader2 className="size-4 animate-spin text-accent-700" aria-hidden />
                    ) : (
                      <Circle className="size-4 text-neutral-400" aria-hidden />
                    )}
                    <span className={cn(feito ? "text-neutral-600" : "text-neutral-900")}>
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-caption text-neutral-600">
              Sem barra de progresso estimada: cada etapa aparece quando termina de verdade.
            </p>
          </Blueprint>
        ) : null}

        {stage === "pronto" ? (
          <div className="mt-6 flex flex-col gap-6">
            <Blueprint className="flex flex-wrap items-end gap-4 p-4">
              <div className="flex-1">
                <p className="text-body text-neutral-900">
                  Detectamos que você é da trilha <strong>{trackName}</strong>, senioridade{" "}
                  <strong>{SENIORITY_LABEL[seniority]}</strong>.
                </p>
                <p className="mt-1 text-caption text-neutral-600">
                  Corrija aqui se estiver errado — o cálculo refaz na hora.
                </p>
              </div>
              <label className="flex flex-col gap-1">
                <span className="label-h6 text-neutral-700">Trilha</span>
                <select
                  className="field"
                  value={trackId ?? ""}
                  onChange={(e) => void trocarRecorte({ trackId: e.target.value })}
                >
                  {tracks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-h6 text-neutral-700">Senioridade</span>
                <select
                  className="field"
                  value={seniority}
                  onChange={(e) => void trocarRecorte({ seniority: e.target.value as Seniority })}
                >
                  {SENIORITIES.map((s) => (
                    <option key={s} value={s}>
                      {SENIORITY_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="label-h6 text-neutral-700">Segmento</span>
                <select
                  className="field"
                  value={segment}
                  onChange={(e) => void trocarRecorte({ segment: e.target.value as MarketSegment })}
                >
                  {(["br", "remoto_global"] as MarketSegment[]).map((s) => (
                    <option key={s} value={s}>
                      {SEGMENT_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </Blueprint>

            {gapQuery.isPending ? (
              <p className="text-caption text-neutral-600">Comparando com as vagas…</p>
            ) : null}

            {gap ? (
              <>
                <div className="grid gap-4 lg:grid-cols-[auto_1fr]">
                  <Blueprint className="flex flex-col items-center justify-center p-6">
                    <GapRing value={gap.score} size={180} thickness={12} label="Aderência" />
                    <p className="mt-3 max-w-xs text-center text-caption text-neutral-700">
                      Comparado a {gap.postingsSample} vagas de {trackName}{" "}
                      {SENIORITY_LABEL[seniority]} em{" "}
                      {SEGMENT_LABEL[gap.marketSegment as MarketSegment]} nos últimos 90 dias.
                    </p>
                  </Blueprint>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <MetricCard
                      label="Skills reconhecidas no CV"
                      value={recognized}
                      hint="Termos identificados pelo dicionário"
                    />
                    <MetricCard
                      label="Skills pedidas que não achamos"
                      value={gap.items.filter((i) => i.status === "faltante").length}
                      hint="Aparecem nas vagas e não no seu currículo"
                    />
                    <MetricCard
                      label="Vagas analisadas"
                      value={gap.postingsSample}
                      hint={
                        gap.lowConfidence ? "Amostra pequena: precisão menor" : "Últimos 90 dias"
                      }
                      icon={<BarChart3 className="size-4" aria-hidden />}
                    />
                    <MetricCard
                      label="Categorias avaliadas"
                      value={gap.categoryScores.length}
                      hint="Sub-scores pela mesma fórmula"
                    />
                  </div>
                </div>

                <Blueprint className="flex flex-wrap items-center gap-3 p-4">
                  <Plus className="size-4 shrink-0 text-accent-700" aria-hidden />
                  <div className="flex-1">
                    <p className="text-body text-neutral-900">
                      Reconhecemos <strong>{recognized}</strong> skill(s) no seu currículo. Faltou
                      alguma que você domina?
                    </p>
                    <p className="mt-0.5 text-caption text-neutral-600">
                      A leitura é por dicionário, não por IA — ela não inventa, mas também não
                      adivinha. O que você adicionar entra no cálculo na hora.
                    </p>
                  </div>
                  <AdicionarSkill
                    label="Adicionar skill"
                    onAdicionada={() => {
                      // Recalcula a prévia sem sair da página.
                      void queryClient.invalidateQueries({ queryKey: ["analise-gap"] });
                    }}
                  />
                </Blueprint>

                <Blueprint className="p-5">
                  <h2 className="label-h6 text-neutral-900">Suas 3 maiores lacunas</h2>
                  <ul className="mt-3 flex flex-col divide-y divide-divider">
                    {top3.map((item) => (
                      <li key={item.skillId} className="flex flex-wrap items-center gap-3 py-3">
                        <SkillBadge name={item.name} status={item.status} />
                        <span className="text-caption text-neutral-600">{item.categoryName}</span>
                        <span className="ml-auto font-mono text-caption text-neutral-700">
                          {Math.round(item.marketDemand * 100)}% das vagas pedem
                        </span>
                        <span className="font-mono text-caption text-neutral-700">
                          seu nível {item.userLevel}/{item.requiredLevel} exigido
                        </span>
                      </li>
                    ))}
                    {top3.length === 0 ? (
                      <li className="py-3 text-caption text-neutral-600">
                        Nenhuma lacuna relevante neste recorte.
                      </li>
                    ) : null}
                  </ul>
                </Blueprint>

                <ChartCard
                  title="Aderência por categoria"
                  description="Sub-scores calculados pela mesma fórmula, por categoria de skill."
                >
                  <div className="h-72 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} outerRadius="75%">
                        <PolarGrid stroke="var(--divider)" />
                        <PolarAngleAxis dataKey="categoria" tick={{ fontSize: 11 }} />
                        <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                        <Radar
                          dataKey="score"
                          stroke="var(--accent-700)"
                          fill="var(--accent-700)"
                          fillOpacity={0.25}
                        />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </ChartCard>

                <div className="grid gap-4 lg:grid-cols-3">
                  <RequireAccount
                    title={`As outras ${restantes} lacunas`}
                    description="O restante da lista, com peso de cada skill na trilha."
                  >
                    <Blueprint className="p-5">
                      <h3 className="label-h6 text-neutral-900">As outras {restantes} lacunas</h3>
                      <ul className="mt-2 flex flex-col gap-1">
                        {faltantes.slice(3, 9).map((i) => (
                          <li key={i.skillId} className="text-caption text-neutral-700">
                            {i.name} · {Math.round(i.marketDemand * 100)}% das vagas · nível{" "}
                            {i.userLevel}/{i.requiredLevel}
                          </li>
                        ))}
                      </ul>
                    </Blueprint>
                  </RequireAccount>

                  <RequireAccount
                    title="Ferramentas em alta na sua trilha"
                    description="As ferramentas com maior demanda no recorte atual."
                  >
                    <Blueprint className="p-5">
                      <h3 className="label-h6 flex items-center gap-2 text-neutral-900">
                        <Building2 className="size-4" aria-hidden />
                        Ferramentas em alta
                      </h3>
                      <ul className="mt-2 flex flex-col gap-1">
                        {[...gap.items]
                          .sort((a, b) => b.marketDemand - a.marketDemand)
                          .slice(0, 6)
                          .map((i) => (
                            <li key={i.skillId} className="text-caption text-neutral-700">
                              {i.name} · {Math.round(i.marketDemand * 100)}% das vagas
                            </li>
                          ))}
                      </ul>
                    </Blueprint>
                  </RequireAccount>

                  <RequireAccount
                    title="Faixa salarial da sua senioridade"
                    description="Mediana observada nas vagas do recorte atual."
                  >
                    <Blueprint className="p-5">
                      <h3 className="label-h6 flex items-center gap-2 text-neutral-900">
                        <Wallet className="size-4" aria-hidden />
                        Faixa salarial
                      </h3>
                      <p className="num mt-2 text-[28px] leading-none">
                        {gap.salaryMedian
                          ? new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: gap.currency,
                              maximumFractionDigits: 0,
                            }).format(gap.salaryMedian)
                          : "—"}
                      </p>
                      <p className="mt-2 text-caption text-neutral-600">
                        {gap.companiesHiring30d} empresas contratando nos últimos 30 dias.
                      </p>
                    </Blueprint>
                  </RequireAccount>
                </div>

                {isAnonymous ? (
                  <Blueprint className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <p className="text-body text-neutral-700">
                      A análise completa — todas as lacunas, salários e plano de estudos — fica na
                      sua conta. É grátis e mantém tudo que você já enviou.
                    </p>
                    <Button size="lg" asChild>
                      <Link to="/cadastro">Criar conta grátis para ver a análise completa</Link>
                    </Button>
                  </Blueprint>
                ) : (
                  <Blueprint className="flex flex-wrap items-center justify-between gap-3 p-5">
                    <p className="text-body text-neutral-700">Sua conta já está ativa.</p>
                    <Button asChild>
                      <Link to="/dashboard">Ir para o painel</Link>
                    </Button>
                  </Blueprint>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
