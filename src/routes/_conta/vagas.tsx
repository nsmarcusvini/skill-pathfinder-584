import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2, ExternalLink, Globe, MapPin, Search } from "lucide-react";

import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState, LoadingState, ErrorState } from "@/components/rumvia/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useMarket, SENIORITY_LABEL, SEGMENT_LABEL, type MarketSegment } from "@/hooks/use-market";
import { listJobs, getJobDetail, listJobLocations, type JobListItem } from "@/lib/jobs.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_conta/vagas")({
  head: () => ({
    meta: [
      { title: "Vagas — RUMVIA" },
      {
        name: "description",
        content: "Vagas da sua trilha com as skills que você já tem e as que faltam em cada uma.",
      },
    ],
  }),
  component: VagasPage,
});

const PAGE_SIZE = 25;

function fmtSalary(
  min: number | null,
  max: number | null,
  currency: string | null,
  period: string | null,
) {
  if (min === null && max === null) return null;
  const cur = currency ?? "BRL";
  const nf = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: 0,
  });
  const sufixo = period === "year" ? "/ano" : period === "hour" ? "/h" : "/mês";
  if (min !== null && max !== null && min !== max)
    return `${nf.format(min)}–${nf.format(max)} ${sufixo}`;
  return `${nf.format((min ?? max) as number)} ${sufixo}`;
}

function fmtWhen(iso: string | null) {
  if (!iso) return "sem data";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return `há ${meses} ${meses === 1 ? "mês" : "meses"}`;
}

function local(j: JobListItem) {
  if (j.isRemote) return j.country && j.country !== "BR" ? "Remoto (global)" : "Remoto";
  const partes = [j.city, j.state].filter(Boolean);
  return partes.length ? partes.join(", ") : (j.locationRaw ?? "—");
}

/** Barra de cobertura. Deliberadamente NÃO é o score de aderência (fórmula única em gap.functions.ts). */
function Cobertura({ covered, total }: { covered: number; total: number }) {
  if (total === 0) {
    return <span className="font-mono text-caption text-neutral-500">skills não extraídas</span>;
  }
  const pct = Math.round((covered / total) * 100);
  const cor =
    pct >= 80
      ? "bg-gap-high"
      : pct >= 60
        ? "bg-gap-mid"
        : pct >= 40
          ? "bg-gap-low"
          : "bg-gap-critical";
  return (
    <div className="flex items-center gap-2">
      <span className="h-1.5 w-20 shrink-0 bg-neutral-200">
        <span className={cn("block h-1.5", cor)} style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-caption text-neutral-700">
        {covered}/{total} skills
      </span>
    </div>
  );
}

function VagasPage() {
  const market = useMarket();
  const runList = useServerFn(listJobs);
  const runDetail = useServerFn(getJobDetail);
  const runLocations = useServerFn(listJobLocations);

  const [busca, setBusca] = React.useState("");
  const [buscaAtiva, setBuscaAtiva] = React.useState("");
  const [soRemoto, setSoRemoto] = React.useState(false);
  const [quaseLa, setQuaseLa] = React.useState(false);
  /** Chaves de cidade selecionadas (sem acento) — ver listJobLocations. */
  const [cidades, setCidades] = React.useState<string[]>([]);
  const [pagina, setPagina] = React.useState(0);
  const [aberta, setAberta] = React.useState<string | null>(null);

  const trackId = market.trackId;
  const segment = market.segment;

  // Localidades disponíveis para a trilha/segmento atuais. Vem do servidor já
  // agrupado por chave sem acento, então "Florianopolis" e "Florianópolis" são
  // uma opção só.
  const locaisQuery = useQuery({
    queryKey: ["vagas_localidades", trackId, segment],
    enabled: Boolean(trackId),
    staleTime: 5 * 60 * 1000,
    queryFn: () => runLocations({ data: { trackId: trackId as string, segment } }),
  });
  const locais = React.useMemo(() => locaisQuery.data ?? [], [locaisQuery.data]);

  // A listagem filtra por grafia, não por chave: a coluna city guarda o texto
  // como veio da fonte.
  const grafiasSelecionadas = React.useMemo(
    () => locais.filter((l) => cidades.includes(l.key)).flatMap((l) => l.spellings),
    [locais, cidades],
  );

  // Trocar de trilha ou segmento muda a lista de cidades; manter a seleção
  // antiga deixaria o filtro preso numa cidade que não existe mais no recorte.
  React.useEffect(() => {
    setCidades([]);
  }, [trackId, segment]);

  // Filtros novos recomeçam da primeira página.
  React.useEffect(() => {
    setPagina(0);
  }, [trackId, segment, buscaAtiva, soRemoto, quaseLa, cidades]);

  const listaQuery = useQuery({
    queryKey: ["vagas", trackId, segment, buscaAtiva, soRemoto, quaseLa, cidades, pagina],
    enabled: Boolean(trackId),
    queryFn: () =>
      runList({
        data: {
          trackId: trackId as string,
          segment,
          ...(buscaAtiva ? { search: buscaAtiva } : {}),
          ...(soRemoto ? { onlyRemote: true } : {}),
          ...(quaseLa ? { maxMissing: 2 } : {}),
          ...(grafiasSelecionadas.length > 0 ? { cities: grafiasSelecionadas } : {}),
          limit: PAGE_SIZE,
          offset: pagina * PAGE_SIZE,
        },
      }),
  });

  const detalheQuery = useQuery({
    queryKey: ["vaga", aberta],
    enabled: Boolean(aberta),
    queryFn: () => runDetail({ data: { jobId: aberta as string } }),
  });

  const page = listaQuery.data;
  const temFiltro = Boolean(buscaAtiva || soRemoto || quaseLa || cidades.length > 0);
  const detalhe = detalheQuery.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Mercado"
        title="Vagas"
        subtitle="Vagas da sua trilha, com as skills que você já tem e as que faltam em cada uma."
      />

      {/* filtros */}
      <Blueprint className="flex flex-wrap items-end gap-3 p-4">
        <form
          className="flex min-w-64 flex-1 items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setBuscaAtiva(busca.trim());
          }}
        >
          <label className="flex flex-1 flex-col gap-1">
            <span className="label-h6 text-neutral-700">Buscar</span>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Cargo ou empresa"
              aria-label="Buscar por cargo ou empresa"
            />
          </label>
          <Button type="submit" variant="outline" size="sm" aria-label="Buscar">
            <Search className="size-4" aria-hidden />
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          {/* "Com salário" saiu daqui: hoje quase nenhuma vaga tem faixa
              salarial, então o filtro zerava a lista e parecia defeito. */}
          {[
            { on: soRemoto, set: setSoRemoto, label: "Só remoto" },
            { on: quaseLa, set: setQuaseLa, label: "Falta ≤ 2 skills" },
          ].map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={() => f.set(!f.on)}
              aria-pressed={f.on}
              className={cn(
                "cursor-pointer border px-3 py-1.5 text-caption transition-colors",
                f.on
                  ? "border-accent-700 bg-accent-100 text-accent-800"
                  : "border-divider text-neutral-700 hover:bg-surface",
              )}
            >
              {f.label}
            </button>
          ))}
          {temFiltro ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setBusca("");
                setBuscaAtiva("");
                setSoRemoto(false);
                setQuaseLa(false);
                setCidades([]);
              }}
            >
              Limpar
            </Button>
          ) : null}
        </div>
      </Blueprint>

      {/* Localidades. Só aparece quando há cidade no recorte — num segmento
          totalmente remoto a coluna city é nula e a régua ficaria vazia. */}
      {locais.length > 0 ? (
        <Blueprint className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-neutral-700" aria-hidden />
            <span className="label-h6 text-neutral-700">Localidades</span>
            {cidades.length > 0 ? (
              <button
                type="button"
                onClick={() => setCidades([])}
                className="cursor-pointer text-caption text-accent-800 underline underline-offset-2"
              >
                limpar {cidades.length}
              </button>
            ) : null}
          </div>
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label="Filtrar vagas por localidade"
          >
            {locais.map((l) => {
              const on = cidades.includes(l.key);
              return (
                <button
                  key={l.key}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setCidades((prev) =>
                      prev.includes(l.key) ? prev.filter((k) => k !== l.key) : [...prev, l.key],
                    )
                  }
                  className={cn(
                    "cursor-pointer border px-3 py-1.5 text-caption transition-colors",
                    on
                      ? "border-accent-700 bg-accent-100 text-accent-800"
                      : "border-divider text-neutral-700 hover:bg-surface",
                  )}
                >
                  {l.label}
                  <span className="ml-1.5 font-mono text-neutral-600 tabular-nums">{l.jobs}</span>
                </button>
              );
            })}
          </div>
        </Blueprint>
      ) : null}

      {listaQuery.isPending ? <LoadingState /> : null}
      {listaQuery.isError ? (
        <ErrorState
          description="Não foi possível carregar as vagas."
          onRetry={() => void listaQuery.refetch()}
        />
      ) : null}

      {page && page.items.length === 0 ? (
        page.totalNoFilters === 0 ? (
          <EmptyState
            title="Ainda não há vagas nesta trilha"
            description={`A base não tem vagas ativas para ${SEGMENT_LABEL[segment as MarketSegment]}. Assim que a ingestão rodar, elas aparecem aqui.`}
          />
        ) : (
          <EmptyState
            title="Nenhuma vaga com esses filtros"
            description={`Há ${page.totalNoFilters} vaga(s) nesta trilha, mas nenhuma corresponde ao que você filtrou.`}
          />
        )
      ) : null}

      {page && page.items.length > 0 ? (
        <>
          <p className="font-mono text-caption text-neutral-600">
            {page.total} vaga(s) · {SEGMENT_LABEL[segment as MarketSegment]}
          </p>

          <ul className="flex flex-col gap-px bg-divider">
            {page.items.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  onClick={() => setAberta(j.id)}
                  className="flex w-full cursor-pointer flex-col gap-2 bg-bg p-4 text-left transition-colors hover:bg-surface"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-heading text-h5 text-neutral-900">{j.title}</h3>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-neutral-600">
                        {j.companyName ? (
                          <span className="flex items-center gap-1">
                            <Building2 className="size-3.5" aria-hidden />
                            {j.companyName}
                          </span>
                        ) : null}
                        <span className="flex items-center gap-1">
                          {j.isRemote ? (
                            <Globe className="size-3.5" aria-hidden />
                          ) : (
                            <MapPin className="size-3.5" aria-hidden />
                          )}
                          {local(j)}
                        </span>
                        {j.seniority ? (
                          <span>{SENIORITY_LABEL[j.seniority as never] ?? j.seniority}</span>
                        ) : null}
                        <span className="font-mono text-neutral-500">{fmtWhen(j.postedAt)}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Cobertura covered={j.coveredSkills} total={j.totalSkills} />
                      {fmtSalary(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod) ? (
                        <span className="num text-caption text-neutral-700">
                          {fmtSalary(j.salaryMin, j.salaryMax, j.salaryCurrency, j.salaryPeriod)}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {j.missingTop.length > 0 ? (
                    <p className="flex flex-wrap items-center gap-1.5 text-caption text-neutral-600">
                      <span className="text-neutral-500">Falta:</span>
                      {j.missingTop.map((m) => (
                        <Badge key={m.skillId} variant="outline" className="font-normal">
                          {m.name}
                        </Badge>
                      ))}
                      {j.totalSkills - j.coveredSkills > j.missingTop.length ? (
                        <span className="font-mono text-neutral-500">
                          +{j.totalSkills - j.coveredSkills - j.missingTop.length}
                        </span>
                      ) : null}
                    </p>
                  ) : j.totalSkills > 0 ? (
                    <p className="text-caption text-success">Você tem todas as skills pedidas.</p>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={pagina === 0}
              onClick={() => setPagina((p) => Math.max(0, p - 1))}
            >
              Anterior
            </Button>
            <span className="font-mono text-caption text-neutral-600">
              {pagina * PAGE_SIZE + 1}–{pagina * PAGE_SIZE + page.items.length} de {page.total}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={(pagina + 1) * PAGE_SIZE >= page.total}
              onClick={() => setPagina((p) => p + 1)}
            >
              Próxima
            </Button>
          </div>
        </>
      ) : null}

      {/* detalhe */}
      <Sheet open={Boolean(aberta)} onOpenChange={(o) => !o && setAberta(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle className="font-heading text-h4">{detalhe?.title ?? "Vaga"}</SheetTitle>
          </SheetHeader>

          {detalheQuery.isPending ? <LoadingState /> : null}

          {detalhe ? (
            <div className="mt-4 flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-neutral-600">
                {detalhe.companyName ? <span>{detalhe.companyName}</span> : null}
                <span>{local(detalhe)}</span>
                {detalhe.seniority ? (
                  <span>{SENIORITY_LABEL[detalhe.seniority as never] ?? detalhe.seniority}</span>
                ) : null}
                <span className="font-mono">{fmtWhen(detalhe.postedAt)}</span>
              </div>

              {fmtSalary(
                detalhe.salaryMin,
                detalhe.salaryMax,
                detalhe.salaryCurrency,
                detalhe.salaryPeriod,
              ) ? (
                <Blueprint className="p-3">
                  <span className="label-h6 text-neutral-700">Salário informado na vaga</span>
                  <p className="num mt-1 text-h4 text-neutral-900">
                    {fmtSalary(
                      detalhe.salaryMin,
                      detalhe.salaryMax,
                      detalhe.salaryCurrency,
                      detalhe.salaryPeriod,
                    )}
                  </p>
                </Blueprint>
              ) : null}

              <div>
                <h3 className="label-h6 text-neutral-700">
                  Skills pedidas ({detalhe.coveredSkills} de {detalhe.totalSkills} você tem)
                </h3>
                <p className="mt-1 text-caption text-neutral-600">
                  Contagem simples do que a vaga pede. Não é seu score de aderência — esse está no{" "}
                  <Link to="/dashboard" className="text-accent-700 underline">
                    painel
                  </Link>
                  .
                </p>
                <ul className="mt-3 flex flex-col divide-y divide-divider">
                  {detalhe.skills.map((s) => (
                    <li key={s.skillId} className="flex items-center gap-2 py-2">
                      <span
                        className={cn(
                          "size-2 shrink-0",
                          s.userLevel > 0 ? "bg-gap-high" : "bg-gap-critical",
                        )}
                        aria-hidden
                      />
                      <span className="text-body text-neutral-900">{s.name}</span>
                      {s.isRequired ? (
                        <Badge variant="outline" className="font-normal">
                          obrigatória
                        </Badge>
                      ) : null}
                      <span className="ml-auto font-mono text-caption text-neutral-600">
                        {s.userLevel > 0 ? `seu nível ${s.userLevel}` : "você não tem"}
                      </span>
                    </li>
                  ))}
                  {detalhe.skills.length === 0 ? (
                    <li className="py-2 text-caption text-neutral-600">
                      Nenhuma skill foi extraída desta vaga ainda.
                    </li>
                  ) : null}
                </ul>
              </div>

              {detalhe.descriptionText ? (
                <div>
                  <h3 className="label-h6 text-neutral-700">Descrição</h3>
                  <p className="mt-2 whitespace-pre-wrap text-body leading-relaxed text-neutral-700">
                    {detalhe.descriptionText.slice(0, 4000)}
                    {detalhe.descriptionText.length > 4000 ? "…" : ""}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
                {detalhe.applyUrl ? (
                  <Button asChild>
                    <a href={detalhe.applyUrl} target="_blank" rel="noopener noreferrer">
                      Ver vaga original
                      <ExternalLink className="size-4" aria-hidden />
                    </a>
                  </Button>
                ) : null}
                <Button asChild variant="outline">
                  <Link to="/minhas-skills">Atualizar minhas skills</Link>
                </Button>
              </div>

              {detalhe.sourceKey ? (
                <p className="font-mono text-caption text-neutral-500">
                  fonte: {detalhe.sourceKey}
                </p>
              ) : null}
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
