import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CvDropzone } from "@/components/app/cv-dropzone";
import { Blueprint } from "@/components/rumvia/blueprint";
import { MetricCard } from "@/components/rumvia/metric-card";
import { Button } from "@/components/ui/button";
import { getLandingStats } from "@/lib/public-stats.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RUMVIA — Quanto seu CV está aderente ao mercado de tecnologia" },
      {
        name: "description",
        content:
          "Envie seu currículo e veja em porcentagem sua aderência à trilha de carreira escolhida, com base em vagas reais do Brasil e do remoto global.",
      },
      { property: "og:title", content: "RUMVIA — Aderência do seu CV ao mercado" },
      {
        property: "og:description",
        content: "Compare seu currículo com a demanda real de vagas em tecnologia.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: LandingPage,
});

function LandingHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-12 items-center border-b border-divider bg-bg px-4">
      <Link to="/" className="label-h6 text-accent-700">
        RUMVIA
      </Link>
      <nav className="ml-auto flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link to="/login">Entrar</Link>
        </Button>
        <Link to="/cadastro" className="text-caption text-neutral-600 underline">
          Criar conta
        </Link>
      </nav>
    </header>
  );
}

function LandingPage() {
  const navigate = useNavigate();
  const loadStats = useServerFn(getLandingStats);
  const statsQuery = useQuery({
    queryKey: ["landing-stats"],
    staleTime: 5 * 60 * 1000,
    queryFn: () => loadStats(),
  });
  const stats = statsQuery.data;

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <LandingHeader />

      <main className="rumvia-container flex-1 py-12">
        <section className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-start">
          <div className="max-w-xl">
            <p className="label-h6 text-accent-700">Análise de carreira em tecnologia</p>
            <h1 className="mt-2 font-heading text-h1">
              Descubra quanto seu CV está aderente ao que o mercado realmente pede
            </h1>
            <p className="mt-3 text-body text-neutral-700">
              Comparamos seu currículo com vagas reais — Brasil e remoto global — e mostramos, em
              porcentagem, o que você domina e o que falta. Sem cadastro para a prévia.
            </p>
          </div>

          <CvDropzone
            onUploaded={(cvId) => {
              void navigate({ to: "/analise", search: { cv: cvId } });
            }}
          />
        </section>

        <section className="mt-14 border-t border-divider pt-8">
          <h2 className="label-h6 text-neutral-700">A base que usamos na comparação</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard
              label="Vagas ativas na base"
              value={stats ? stats.jobs.toLocaleString("pt-BR") : "—"}
              hint="Fontes públicas e gratuitas"
            />
            <MetricCard
              label="Skills catalogadas"
              value={stats ? stats.skills.toLocaleString("pt-BR") : "—"}
              hint="Dicionário próprio com apelidos"
            />
            <MetricCard
              label="Trilhas disponíveis"
              value={stats ? String(stats.tracks.length) : "—"}
              hint={stats?.tracks.map((t) => t.name).join(" · ") ?? ""}
            />
          </div>

          <Blueprint className="mt-4 p-5">
            <h3 className="label-h6 text-neutral-900">
              Amostra real: ferramentas mais pedidas em DevOps / SRE
            </h3>
            <p className="mt-1 text-caption text-neutral-600">
              Percentual de vagas de DevOps/SRE dos últimos 90 dias que citam cada ferramenta.
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-divider">
              {(stats?.devopsTopTools ?? []).map((tool) => (
                <li key={tool.name} className="flex items-center gap-3 py-2">
                  <span className="w-40 shrink-0 text-body text-neutral-900">{tool.name}</span>
                  <span className="h-2 flex-1 bg-neutral-200">
                    <span
                      className="block h-2 bg-accent-700"
                      style={{ width: `${Math.round(tool.share * 100)}%` }}
                    />
                  </span>
                  <span className="w-14 shrink-0 text-right font-mono text-caption text-neutral-700">
                    {Math.round(tool.share * 100)}%
                  </span>
                </li>
              ))}
              {!stats?.devopsTopTools.length ? (
                <li className="py-2 text-caption text-neutral-600">Carregando dados da base…</li>
              ) : null}
            </ul>
          </Blueprint>
        </section>
      </main>

      <footer className="border-t border-divider px-4 py-6">
        <div className="rumvia-container flex flex-wrap items-center justify-between gap-2">
          <span className="text-caption text-neutral-600">RUMVIA</span>
          <Link to="/privacidade" className="text-caption text-accent-700 underline">
            Privacidade
          </Link>
        </div>
      </footer>
    </div>
  );
}
