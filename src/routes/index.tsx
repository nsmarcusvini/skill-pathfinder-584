import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CvDropzone } from "@/components/app/cv-dropzone";
import { formatCents } from "@/components/rumvia/paywall";
import { Button } from "@/components/ui/button";
import { menorMensalidade, usePublicPlans } from "@/hooks/use-subscription";
import {
  AVISO_ACESSO_PAGO,
  AVISO_ARREPENDIMENTO,
  PLANO_INCLUI,
  PREVIA_GRATUITA,
  rotuloCiclo,
  rotuloCobranca,
  rotuloPeriodo,
} from "@/lib/plan-copy";
import { getLandingStats } from "@/lib/public-stats.functions";
import { FORNECEDOR } from "@/lib/legal-copy";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "RUMVIA — Seu CV tem o que o mercado realmente pede?" },
      {
        name: "description",
        content:
          "Comparamos seu currículo com centenas de vagas reais e mostramos em porcentagem o que você domina e o que está te custando oportunidades. Sem cadastro para a prévia.",
      },
      { property: "og:title", content: "RUMVIA — Aderência do seu CV ao mercado de tecnologia" },
      {
        property: "og:description",
        content:
          "Descubra em porcentagem o quanto seu CV está aderente à sua trilha de carreira. Baseado em vagas reais do Brasil e remoto global.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

/**
 * "A, B e C" — para citar as trilhas em prosa sem escrever a lista à mão.
 *
 * Existe porque a landing já prometeu trilha que o usuário não podia escolher:
 * o FAQ e o passo 02 enumeravam "… Back-End, Front-End e Full Stack" em string
 * literal, e quando `frontend` foi desativada em 2026-09-10 (amostra de 6 vagas)
 * os dois textos viraram propaganda falsa em silêncio. Trilha é dado (regra 1),
 * então o texto que fala dela também tem que vir do dado — de `landing_stats()`,
 * a mesma fonte do contador "Trilhas disponíveis".
 */
function listaPtBr(nomes: string[]): string {
  if (nomes.length === 0) return "";
  if (nomes.length === 1) return nomes[0] ?? "";
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

const howItWorks = (trilhas: string) => [
  {
    num: "01",
    title: "Envie o currículo",
    body: "Arraste o PDF. Extraímos suas skills com dicionário próprio — sem IA generativa, sem envio para terceiros. Seus dados ficam só aqui.",
  },
  {
    num: "02",
    title: "Escolha a trilha",
    body: `${trilhas} — cada uma medida separadamente, mesmo quando a vaga serve a mais de uma. Brasil (BRL) e remoto global (USD) sempre separados.`,
  },
  {
    num: "03",
    title: "Veja gap + plano",
    body: "Score de aderência em %, quais skills faltam, faixa salarial para seu nível e plano de estudos priorizado pela demanda real do mercado.",
  },
];

const faqItems = (trilhas: string) => [
  {
    q: "O que é gratuito e o que é pago?",
    a: "A prévia é gratuita e não exige cadastro: score de aderência, amostra das skills em falta e das ferramentas mais pedidas. O RUMVIA completo — painel, histórico de gap, plano de estudos, salários, empresas e progresso — é assinatura. Criar a conta não libera o acesso: o painel só abre depois que a assinatura for confirmada.",
  },
  {
    q: "Quanto custa e como cobram?",
    a: "Você escolhe o ciclo: mensal, trimestral ou anual. O acesso é o mesmo nos três — quanto mais longo o ciclo, menor o preço por mês. A cobrança é no cartão de crédito e renova automaticamente até você cancelar. Os três valores estão na seção Planos, acima. O pagamento é processado pelo Asaas — o RUMVIA nunca vê os dados do seu cartão. O cancelamento é feito por você mesmo em Configurações → Assinatura e vale na hora.",
  },
  {
    q: "Posso desistir depois de assinar?",
    a: `${AVISO_ARREPENDIMENTO} Depois disso, o cancelamento continua disponível a qualquer momento em Configurações → Assinatura, só que sem devolução do que já foi cobrado.`,
  },
  {
    q: "Como vocês analisam o currículo?",
    a: "Lemos o texto do PDF e identificamos skills usando um dicionário próprio com mais de 830 termos técnicos e seus apelidos em português e inglês. Nenhum conteúdo é enviado para IA generativa ou terceiros. O processo é 100% determinístico e transparente.",
  },
  {
    q: "De onde vêm as vagas usadas na comparação?",
    a: "Indexamos vagas de fontes públicas e gratuitas. A base é atualizada diariamente com vagas do Brasil (BRL) e remoto global (USD) — sempre separadas, nunca misturadas no mesmo número.",
  },
  {
    q: "Que trilhas estão disponíveis agora?",
    a: `${trilhas}. Cada uma é uma trilha própria, não subconjunto de outra: uma vaga de "Senior Backend Engineer" conta para Back-End, e o gap é calculado sobre a demanda daquela trilha específica. Naturalmente há sobreposição — a mesma empresa e a mesma faixa salarial podem aparecer em mais de uma. Uma trilha só entra nesta lista quando a base tem vagas suficientes para gerar um gap honesto; novas trilhas são adicionadas como dados no banco, sem alteração de código.`,
  },
  {
    q: "Meus dados ficam salvos e seguros?",
    a: "O arquivo do currículo fica armazenado até você excluí-lo — ou por 7 dias caso não crie conta. Exportar seus dados em JSON e excluir a conta continuam disponíveis em Configurações → Minha conta mesmo sem assinatura ativa: o dado é seu, pagando ou não. Seguimos a LGPD.",
  },
  {
    q: "Funciona para quem está migrando de área?",
    a: "Sim, e é um dos casos de uso mais valiosos. Se você vem de outra área e quer entrar em DevOps ou Data Engineering, o RUMVIA mostra exatamente o gap e o caminho mais curto — com base na demanda real do mercado, não em opiniões.",
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const loadStats = useServerFn(getLandingStats);
  const { data: stats } = useQuery({
    queryKey: ["landing-stats"],
    staleTime: 5 * 60 * 1000,
    queryFn: () => loadStats(),
  });
  // Nomes das trilhas ATIVAS, em prosa, para os textos que as citam. Enquanto
  // `landing_stats()` não responde, o texto fala em genérico em vez de chutar
  // uma lista — a mesma postura do hint do contador logo abaixo.
  const trilhasEmProsa = stats?.tracks?.length
    ? listaPtBr(stats.tracks.map((t) => t.name))
    : "As trilhas disponíveis hoje";
  const passos = howItWorks(trilhasEmProsa);
  const perguntas = faqItems(trilhasEmProsa);
  const { data: plans } = usePublicPlans();
  // Preço nunca é escrito no JSX (regra 1) — vem de billing_plans, a mesma
  // fonte que o checkout cobra. Sem catálogo carregado, o card não inventa
  // número: some com o preço e diz por quê.
  const planos = plans ?? [];
  // O headline cita o MENOR preço por mês (hoje o anual) sempre com "a partir
  // de" — a tabela logo abaixo mostra os três, então ninguém descobre o preço
  // real só no checkout.
  const maisBarato = menorMensalidade(planos);
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* ═══ HEADER ═══ */}
      <header className="sticky top-0 z-30 flex h-12 items-center border-b border-divider bg-bg">
        <div className="rumvia-container flex w-full items-center">
          <Link to="/" className="mr-auto flex items-center">
            <img src="/logo-rumvia.png" alt="RUMVIA" className="h-6 w-auto" />
          </Link>
          <nav className="flex items-center gap-3">
            <Link to="/login" className="text-caption text-neutral-600 hover:text-accent-700">
              Entrar
            </Link>
            <a href="#planos" className="text-caption text-neutral-600 hover:text-accent-700">
              Planos
            </a>
            {/* /analise primeiro: conta só se cria depois de extrair o currículo.
                Não diz "grátis" — a prévia é, a conta não. */}
            <Button asChild size="sm">
              <Link to="/analise" search={{ cv: undefined }}>
                Analisar meu CV
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* ═══ HERO ═══ */}
      <section className="bg-accent-900 py-20">
        <div className="rumvia-container">
          <div className="grid items-center gap-14 lg:grid-cols-[1fr_440px]">
            {/* Copy */}
            <div>
              <p className="label-h6 mb-4 text-accent-400">// Análise de aderência gratuita</p>
              <h1
                className="font-heading font-bold uppercase text-bg"
                style={{ fontSize: 58, lineHeight: 1.04, letterSpacing: "-0.01em" }}
              >
                Seu CV tem o que o mercado{" "}
                <em className="text-accent-400" style={{ fontStyle: "normal" }}>
                  realmente
                </em>{" "}
                pede?
              </h1>
              <p
                className="mt-5 text-body"
                style={{ color: "rgba(242,242,243,0.72)", lineHeight: 1.65 }}
              >
                Saiba o que o mercado pede, onde você está, quais ferramentas estão em alta e quem
                está contratando na sua área —{" "}
                <strong className="text-bg">tudo na palma da sua mão</strong>.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                {/* Rotulado "Analisar meu CV" — tem de abrir o envio, não o
                    cadastro. Ia direto para /cadastro, contradizendo a frase
                    "Sem cadastro para a prévia" duas linhas abaixo. */}
                <Button asChild size="lg">
                  <Link to="/analise" search={{ cv: undefined }}>
                    Analisar meu CV — grátis
                  </Link>
                </Button>
              </div>
              <p className="mt-4 font-mono text-caption" style={{ color: "rgba(242,242,243,0.4)" }}>
                → Prévia sem cadastro · Resultado em menos de 30 segundos
                {maisBarato
                  ? ` · Painel completo a partir de ${formatCents(maisBarato.monthlyEquivalentCents, maisBarato.currency)}/mês`
                  : ""}
              </p>
            </div>

            {/* Upload card — fundo claro para que o CvDropzone (consent text) fique legível */}
            <div className="border border-divider bg-bg p-7">
              <p className="label-h6 mb-4 text-accent-700">// Envie seu currículo</p>
              <CvDropzone
                onUploaded={(cvId) => {
                  void navigate({ to: "/analise", search: { cv: cvId } });
                }}
              />
              {stats?.tracks && stats.tracks.length > 0 && (
                <div className="mt-5 flex flex-col gap-2">
                  <p className="text-center text-caption text-neutral-500">
                    — ou escolha uma trilha para ver uma demo —
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {stats.tracks.map((t) => (
                      <span
                        key={t.key}
                        className="border border-divider font-mono text-caption text-neutral-700"
                        style={{ padding: "5px 11px" }}
                      >
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ═══ ROTA ═══ */}
      <section className="border-t border-accent-800 bg-accent-900 py-20">
        <div className="rumvia-container">
          <div className="grid items-center gap-14 lg:grid-cols-[420px_1fr]">
            <div>
              <p className="label-h6 mb-4 text-accent-400">// Sua rota</p>
              <h2 className="font-heading text-h2 uppercase text-bg">
                Onde você está, onde o mercado está, e o caminho entre os dois.
              </h2>
              <p
                className="mt-5 text-body"
                style={{ color: "rgba(242,242,243,0.72)", lineHeight: 1.65 }}
              >
                Cada marco é uma skill que as vagas da sua trilha pedem e o seu currículo ainda não
                mostra. O RUMVIA ordena por demanda real — você percorre na ordem que fecha o gap
                mais rápido.
              </p>
            </div>
            <RotaMap />
          </div>
        </div>
      </section>

      {/* ═══ TRUST STRIP ═══ */}
      <div className="border-b border-divider">
        <div className="rumvia-container">
          <div className="grid divide-y divide-divider sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {[
              {
                num: stats ? stats.jobs.toLocaleString("pt-BR") + "+" : "…",
                label: "Vagas ativas na base",
                hint: "Fontes públicas · atualizadas diariamente",
              },
              {
                num: stats ? stats.skills.toLocaleString("pt-BR") + "+" : "…",
                label: "Skills catalogadas",
                hint: "Dicionário próprio · aliases PT e EN",
              },
              {
                num: stats ? String(stats.tracks.length) : "…",
                label: "Trilhas disponíveis",
                // Enquanto carrega não enumeramos trilha nenhuma: a lista vem
                // do banco (`career_tracks` ativas), e um fallback escrito à
                // mão envelhece calado na primeira trilha nova.
                hint: stats?.tracks.map((t) => t.name).join(" · ") ?? "Carregando…",
              },
            ].map((item) => (
              <div key={item.label} className="flex flex-col gap-1 px-6 py-7">
                <span
                  className="num font-heading font-bold text-accent-700"
                  style={{ fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em" }}
                >
                  {item.num}
                </span>
                <span className="text-body text-neutral-700">{item.label}</span>
                <span className="font-mono text-caption text-neutral-500">{item.hint}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="como-funciona" className="py-16">
        <div className="rumvia-container">
          <p className="label-h6 text-neutral-500">// Processo</p>
          <h2 className="mt-3 font-heading text-h2 uppercase">Três passos. Resultado imediato.</h2>
          <p
            className="mt-3 text-body text-neutral-600"
            style={{ maxWidth: 560, lineHeight: 1.65 }}
          >
            Sem formulário extenso. Sem espera. Você envia o CV e já vê onde está em relação ao
            mercado.
          </p>
          {/* hairline grid: gap-px + bg-divider cria a separação de 1px */}
          <div className="mt-10 grid gap-px bg-divider sm:grid-cols-3">
            {passos.map((step) => (
              <div key={step.num} className="flex flex-col gap-3 bg-bg p-8">
                <span className="label-h6 text-accent-700">{step.num} ——</span>
                <h3
                  className="font-heading font-bold uppercase"
                  style={{ fontSize: 20, letterSpacing: "0.02em" }}
                >
                  {step.title}
                </h3>
                <p className="text-body text-neutral-600" style={{ lineHeight: 1.65 }}>
                  {step.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="funcionalidades" className="bg-surface py-16">
        <div className="rumvia-container">
          <p className="label-h6 text-neutral-500">// O que você recebe</p>
          <h2 className="mt-3 font-heading text-h2 uppercase">
            Tudo para saber onde está e como chegar onde quer
          </h2>
          <div className="mt-10 grid gap-px bg-divider sm:grid-cols-2">
            {/* Score de gap */}
            <div className="flex flex-col gap-3 bg-bg p-8">
              <span className="label-h6 text-neutral-500">Aderência ao mercado</span>
              <h3 className="font-heading text-h3 uppercase">Score de gap em %</h3>
              <p className="text-body text-neutral-600" style={{ lineHeight: 1.65 }}>
                A proporção entre o que o mercado pede e o que você tem, ponderada pela frequência
                de cada skill nas vagas — não um score inventado.
              </p>
              <div className="mt-2 flex items-center gap-4">
                <span
                  className="num font-semibold text-accent-700"
                  style={{ fontSize: 44, lineHeight: 1 }}
                >
                  74%
                </span>
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-caption text-neutral-600">
                    DevOps / SRE · Pleno · Brasil
                  </span>
                  <div className="h-1.5 w-full bg-neutral-200">
                    <div className="h-1.5 bg-accent-500" style={{ width: "74%" }} />
                  </div>
                  <span className="font-mono text-caption text-neutral-500">
                    Aderência crescendo
                  </span>
                </div>
              </div>
            </div>

            {/* Ferramentas mais pedidas — usa dados reais ou EmptyState */}
            <div className="flex flex-col gap-3 bg-bg p-8">
              <span className="label-h6 text-neutral-500">Mercado de vagas</span>
              <h3 className="font-heading text-h3 uppercase">Stacks em Alta</h3>
              <p className="text-body text-neutral-600" style={{ lineHeight: 1.65 }}>
                Ranking atualizado das tecnologias mais frequentes nas vagas da sua trilha — com
                base em dados reais dos últimos 90 dias.
              </p>
              {stats?.devopsTopTools && stats.devopsTopTools.length > 0 ? (
                <ul className="mt-1 flex flex-col divide-y divide-divider">
                  {stats.devopsTopTools.slice(0, 4).map((tool) => (
                    <li key={tool.name} className="flex items-center gap-3 py-2">
                      <span className="w-36 shrink-0 text-body text-neutral-900">{tool.name}</span>
                      <span className="h-1.5 flex-1 bg-neutral-200">
                        <span
                          className="block h-1.5 bg-accent-700"
                          style={{ width: `${Math.round(tool.share * 100)}%` }}
                        />
                      </span>
                      <span className="w-12 shrink-0 text-right font-mono text-caption text-neutral-600">
                        {Math.round(tool.share * 100)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-caption text-neutral-500">
                  {stats ? "Ainda sem dados suficientes nesta trilha." : "Carregando dados…"}
                </p>
              )}
            </div>

            {/* Faixa salarial — mesmo padrão do bloco de ferramentas ao lado:
                dado real de devopsSalary, ou EmptyState quando a amostra não
                passa do piso. Nunca um número fixo (era R$ 9.200 / US$ 4.800
                hardcoded enquanto salary_observations estava em zero). */}
            <div className="flex flex-col gap-3 bg-bg p-8">
              <span className="label-h6 text-neutral-500">Remuneração</span>
              <h3 className="font-heading text-h3 uppercase">Faixa salarial real</h3>
              <p className="text-body text-neutral-600" style={{ lineHeight: 1.65 }}>
                Faixa P25–P75 para o seu nível de senioridade, separando Brasil (BRL) e remoto
                global (USD). Exemplo abaixo: DevOps / SRE · Pleno.
              </p>
              {stats?.devopsSalary && stats.devopsSalary.length > 0 ? (
                <div className="mt-2 flex gap-3">
                  {stats.devopsSalary.map((s) => {
                    const isBr = s.segment === "br";
                    const fmt = (n: number) =>
                      new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: s.currency,
                        maximumFractionDigits: 0,
                      }).format(n);
                    return (
                      <div key={s.segment} className="flex flex-1 flex-col gap-1 bg-surface p-3">
                        <span className="font-mono text-caption text-neutral-500">
                          {isBr ? "🇧🇷 Brasil · Pleno" : "🌎 Remoto · Pleno"}
                        </span>
                        <span
                          className="num font-heading font-bold text-neutral-900"
                          style={{ fontSize: 26 }}
                        >
                          {fmt(s.p50)}/mês
                        </span>
                        <span className="font-mono text-caption text-neutral-500">
                          P25: {fmt(s.p25)} · P75: {fmt(s.p75)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-caption text-neutral-500">
                  {stats ? "Ainda sem dados suficientes nesta trilha." : "Carregando dados…"}
                </p>
              )}
            </div>

            {/* Plano de estudos */}
            <div className="flex flex-col gap-3 bg-bg p-8">
              <span className="label-h6 text-neutral-500">Aprendizado</span>
              <h3 className="font-heading text-h3 uppercase">Plano de estudos personalizado</h3>
              <p className="text-body text-neutral-600" style={{ lineHeight: 1.65 }}>
                Um Kanban com cursos e certificações recomendados — priorizados pela demanda do
                mercado, não por propaganda. Você move os cards conforme evolui.
              </p>
              <div className="mt-2 flex gap-2">
                {[
                  {
                    col: "BACKLOG",
                    color: "var(--rumvia-warning)",
                    card: "CKA — Linux Foundation",
                    done: false,
                  },
                  {
                    col: "FAZENDO",
                    color: "var(--accent-700)",
                    card: "Terraform Associate",
                    done: false,
                  },
                  {
                    col: "CONCLUÍDO",
                    color: "var(--rumvia-success)",
                    card: "AWS SAA",
                    done: true,
                  },
                ].map((k) => (
                  <div
                    key={k.col}
                    className="flex flex-1 flex-col gap-1.5 bg-surface p-2.5"
                    style={{ borderTop: `2px solid ${k.color}` }}
                  >
                    <span
                      className="label-h6"
                      style={{ color: k.color, fontSize: 9, letterSpacing: "0.1em" }}
                    >
                      {k.col}
                    </span>
                    <span
                      className="border border-divider p-1.5 text-caption"
                      style={{
                        textDecoration: k.done ? "line-through" : "none",
                        color: k.done ? "var(--neutral-500)" : "var(--rumvia-text)",
                      }}
                    >
                      {k.card}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLANOS ═══ */}
      <section id="planos" className="py-16">
        <div className="rumvia-container">
          <p className="label-h6 text-neutral-500">// Planos e preços</p>
          <h2 className="mt-3 font-heading text-h2 uppercase">Um plano. Três ciclos.</h2>
          <p
            className="mt-3 text-body text-neutral-600"
            style={{ maxWidth: 620, lineHeight: 1.65 }}
          >
            A prévia do seu currículo é gratuita e não pede cadastro. O RUMVIA completo é
            assinatura: mensal, trimestral ou anual, com o mesmo acesso nos três — só muda o preço
            por mês. <strong className="text-neutral-900">{AVISO_ACESSO_PAGO}</strong>
          </p>

          <div className="mt-10 grid gap-px bg-divider lg:grid-cols-2">
            {/* Prévia gratuita */}
            <div className="flex flex-col gap-4 bg-bg p-8">
              <div>
                <span className="label-h6 text-neutral-500">Prévia</span>
                <p
                  className="mt-2 font-heading font-bold uppercase"
                  style={{ fontSize: 34, lineHeight: 1 }}
                >
                  Grátis
                </p>
                <p className="mt-1 font-mono text-caption text-neutral-500">
                  sem cadastro · sem cartão
                </p>
              </div>
              <ul className="flex flex-col gap-2">
                {PREVIA_GRATUITA.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-body text-neutral-600">
                    <span className="mt-1 font-mono text-caption text-neutral-400" aria-hidden>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="mt-auto self-start">
                <Link to="/analise" search={{ cv: undefined }}>
                  Analisar meu CV
                </Link>
              </Button>
            </div>

            {/* Plano pago */}
            <div className="flex flex-col gap-4 bg-bg p-8 ring-2 ring-accent-700 ring-inset">
              <div>
                <span className="label-h6 text-accent-700">RUMVIA Pro — acesso à conta</span>
                {/* Sem catálogo carregado não existe preço a mostrar. Um traço
                    solto seguido de "por mês" lê como bug; a frase honesta, não. */}
                {maisBarato ? (
                  <p className="mt-2 flex flex-wrap items-baseline gap-2">
                    <span className="text-body text-neutral-600">a partir de</span>
                    <span
                      className="num font-heading font-bold text-accent-700"
                      style={{ fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em" }}
                    >
                      {formatCents(maisBarato.monthlyEquivalentCents, maisBarato.currency)}
                    </span>
                    <span className="text-body text-neutral-600">por mês</span>
                  </p>
                ) : (
                  <p className="mt-2 text-body text-neutral-600">
                    Preço indisponível no momento. Tente recarregar a página.
                  </p>
                )}
                <p className="mt-1 font-mono text-caption text-neutral-500">
                  cartão de crédito · renova sozinho · cancele quando quiser
                  {maisBarato?.trialDays ? ` · ${maisBarato.trialDays} dias grátis` : ""}
                </p>
              </div>

              {/* Os três ciclos, lado a lado. O mesmo acesso em todos — o que
                  muda é só de quanto em quanto tempo a cobrança sai e quanto
                  isso barateia o mês. Nada de seletor: esconder dois preços
                  atrás de uma aba é o que faz a pessoa desconfiar do terceiro. */}
              {planos.length > 0 ? (
                <ul className="grid gap-px border border-divider bg-divider sm:grid-cols-3">
                  {planos.map((p) => (
                    <li key={p.key} className="flex flex-col gap-1 bg-bg p-4">
                      <span className="flex items-center gap-2">
                        <span className="label-h6 text-neutral-700">{rotuloCiclo(p.cycle)}</span>
                        {p.discountPercent > 0 ? (
                          <span className="font-mono text-caption text-accent-700">
                            −{p.discountPercent}%
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="num font-heading font-bold text-accent-700"
                        style={{ fontSize: 24, lineHeight: 1.1 }}
                      >
                        {formatCents(p.monthlyEquivalentCents, p.currency)}
                        <span className="ml-1 font-sans text-caption font-normal text-neutral-600">
                          /mês
                        </span>
                      </span>
                      <span className="text-caption text-neutral-600">
                        {p.months > 1
                          ? `${formatCents(p.priceCents, p.currency)} ${rotuloPeriodo(p.cycle)}`
                          : rotuloCobranca(p.cycle)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <ul className="flex flex-col gap-2">
                {PLANO_INCLUI.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-body text-neutral-700">
                    <span className="mt-1 font-mono text-caption text-accent-700" aria-hidden>
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-2">
                <Button asChild size="lg" className="self-start">
                  <Link to="/analise" search={{ cv: undefined }}>
                    Começar pelo currículo
                  </Link>
                </Button>
                {/* O funil é este, e a ordem não é negociável: a conta nasce a
                    partir do CV já extraído, e só abre depois do pagamento. */}
                <p className="font-mono text-caption text-neutral-500">
                  envie o CV → veja a prévia → crie a conta → pague → painel liberado
                </p>
                {/* Dito antes do clique, não só no rodapé dos Termos. */}
                <p className="text-caption text-neutral-500">{AVISO_ARREPENDIMENTO}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="border-t border-divider py-16">
        <div className="rumvia-container">
          <p className="label-h6 text-neutral-500">// Dúvidas frequentes</p>
          <h2 className="mt-3 font-heading text-h2 uppercase">Perguntas comuns</h2>
          <div className="mt-8 border-t border-divider">
            {perguntas.map((item, i) => (
              <div key={i} className="border-b border-divider">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 py-5 text-left text-body font-semibold text-neutral-900 hover:text-accent-700"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  aria-expanded={openFaq === i}
                >
                  <span>{item.q}</span>
                  <span className="shrink-0 font-mono text-lg text-accent-700" aria-hidden>
                    {openFaq === i ? "−" : "+"}
                  </span>
                </button>
                {openFaq === i && (
                  <p
                    className="pb-5 text-body text-neutral-600"
                    style={{ lineHeight: 1.7, maxWidth: 780 }}
                  >
                    {item.a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA BOTTOM ═══ */}
      <section className="bg-accent-700 py-16 text-center">
        <div className="mx-auto px-6" style={{ maxWidth: 640 }}>
          <h2
            className="font-heading font-bold uppercase text-bg"
            style={{ fontSize: 44, lineHeight: 1.05 }}
          >
            Você está competindo no escuro?
          </h2>
          <p
            className="mt-4 text-body"
            style={{ color: "rgba(242,242,243,0.72)", lineHeight: 1.65 }}
          >
            Centenas de devs já sabem exatamente o que precisam estudar para chegar na próxima vaga.
            Você ainda não sabe o que está te faltando.
          </p>
          <p className="mt-3 font-mono text-caption" style={{ color: "rgba(242,242,243,0.5)" }}>
            A prévia é grátis e não pede cadastro. {AVISO_ACESSO_PAGO}
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="lg"
              style={{ background: "var(--rumvia-bg)", color: "var(--accent-700)" }}
            >
              <Link to="/analise" search={{ cv: undefined }}>
                Analisar meu CV agora — prévia grátis
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              size="lg"
              style={{
                borderColor: "rgba(242,242,243,0.35)",
                color: "var(--rumvia-bg)",
                background: "transparent",
              }}
            >
              <Link to="/login">Entrar na conta</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ background: "var(--rumvia-text)" }} className="py-10">
        <div className="rumvia-container">
          <div className="flex flex-wrap items-start justify-between gap-10">
            <div className="flex flex-col gap-2">
              {/* Mesmo lockup dos outros 3 lugares (commit 17d3473), mas com o
                  texto navy sólido recolorido para var(--rumvia-bg): sobre este
                  fundo quase preto, o navy original ficaria ilegível. Só o
                  texto muda de cor — as barras do ícone são gradiente e já
                  liam bem no escuro, então ficaram como estavam. Gerado uma
                  vez (canvas, corte por canal azul) e commitado como PNG; não
                  há lógica de recolorir em runtime. */}
              <img src="/logo-rumvia-footer.png" alt="RUMVIA" className="h-6 w-auto" />
              <p
                className="text-caption"
                style={{ color: "rgba(242,242,243,0.4)", maxWidth: 260, lineHeight: 1.55 }}
              >
                Análise de aderência de CV ao mercado de tecnologia. Baseado em vagas reais do
                Brasil e remoto global.
              </p>
            </div>
            <div className="flex flex-wrap gap-14">
              {[
                {
                  title: "Produto",
                  links: [
                    { label: "Como funciona", href: "#como-funciona" },
                    { label: "Trilhas disponíveis", href: "#funcionalidades" },
                    { label: "Planos e preços", href: "#planos" },
                    { label: "FAQ", href: "#faq" },
                  ],
                },
                {
                  title: "Legal",
                  links: [
                    { label: "Privacidade", href: "/privacidade" },
                    { label: "Termos de uso", href: "/termos" },
                    { label: "LGPD", href: "/privacidade" },
                  ],
                },
                {
                  title: "Contato",
                  // `privacidade.tsx` promete "o e-mail de contato informado
                  // no rodapé" para pedidos de exclusão de quem não tem
                  // conta — este é o único lugar onde ele existe.
                  links: [{ label: FORNECEDOR.contato, href: `mailto:${FORNECEDOR.contato}` }],
                },
              ].map((col) => (
                <div key={col.title} className="flex flex-col gap-2">
                  <span
                    className="label-h6"
                    style={{ color: "rgba(242,242,243,0.35)", fontSize: 10 }}
                  >
                    {col.title}
                  </span>
                  {col.links.map((l) => (
                    <a
                      key={l.label}
                      href={l.href}
                      className="text-caption hover:text-accent-400"
                      style={{ color: "rgba(242,242,243,0.6)" }}
                    >
                      {l.label}
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div
            className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6"
            style={{ borderColor: "rgba(242,242,243,0.1)" }}
          >
            <span className="text-caption" style={{ color: "rgba(242,242,243,0.28)" }}>
              © 2026 RUMVIA. Todos os direitos reservados.
            </span>
            <div className="flex gap-6">
              {[
                { label: "Privacidade", href: "/privacidade" },
                { label: "Termos", href: "/termos" },
              ].map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  className="text-caption"
                  style={{ color: "rgba(242,242,243,0.28)" }}
                >
                  {l.label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

const MAPA_GRID = [
  ...Array.from({ length: 18 }, (_, i) => `M ${(i + 1) * 40} 0 L ${(i + 1) * 40} 380`),
  ...Array.from({ length: 8 }, (_, i) => `M 0 ${(i + 1) * 40} L 764 ${(i + 1) * 40}`),
].join(" ");

const MAPA_REGUA = [
  ...Array.from({ length: 18 }, (_, i) => {
    const x = (i + 1) * 40;
    return `M ${x} 0 L ${x} ${x % 200 === 0 ? 9 : 5}`;
  }),
  ...Array.from({ length: 8 }, (_, i) => {
    const y = (i + 1) * 40;
    return `M 0 ${y} L ${y === 160 || y === 280 ? 9 : 5} ${y}`;
  }),
].join(" ");

// Escondido abaixo de md: o viewBox tem 764px, e num telefone os rótulos de 11px cairiam para ~5px.
function RotaMap() {
  return (
    <svg
      viewBox="0 0 764 380"
      role="img"
      aria-label="Mapa da trajetória: do currículo atual, com 74% de aderência, até o que o mercado pede"
      className="hidden h-auto w-full md:block"
    >
      <rect x={0.5} y={0.5} width={763} height={379} fill="none" stroke="var(--accent-800)" />

      <g fill="none" stroke="var(--accent-700)" strokeWidth={1} opacity={0.18}>
        <path d={MAPA_GRID} />
      </g>

      <g fill="none" stroke="var(--accent-600)" strokeWidth={1} opacity={0.16}>
        <path d="M 60 190 L 90 140 L 150 110 L 220 120 L 260 160 L 250 200 L 180 220 L 100 215 Z" />
        <path d="M 95 180 L 120 145 L 165 128 L 210 140 L 232 168 L 220 192 L 165 202 L 115 198 Z" />
        <path d="M 130 172 L 148 152 L 178 148 L 200 162 L 196 180 L 160 186 Z" />
      </g>

      <g fill="none" stroke="var(--accent-600)" strokeWidth={1} opacity={0.7}>
        <path d={MAPA_REGUA} />
        <path d="M 6 14 L 6 6 L 14 6" opacity={1} />
        <path d="M 750 6 L 758 6 L 758 14" opacity={1} />
        <path d="M 6 366 L 6 374 L 14 374" opacity={1} />
        <path d="M 758 366 L 758 374 L 750 374" opacity={1} />
      </g>

      <path
        d="M 40 320 L 140 320 L 176 284 L 300 284 L 336 248 L 390 248"
        fill="none"
        stroke="var(--accent-500)"
        strokeWidth={2}
      />
      <path
        d="M 390 248 L 430 248 L 466 212 L 560 212 L 596 176 L 700 176"
        fill="none"
        stroke="var(--accent-500)"
        strokeWidth={2}
        strokeDasharray="7 7"
        opacity={0.55}
      />

      <rect
        x={84}
        y={314}
        width={12}
        height={12}
        fill="var(--accent-900)"
        stroke="var(--accent-500)"
        strokeWidth={1.5}
      />
      <rect x={88} y={318} width={4} height={4} fill="var(--accent-500)" />
      <path d="M 90 314 L 90 305" fill="none" stroke="var(--accent-500)" strokeWidth={1} />
      <text
        x={90}
        y={299}
        textAnchor="middle"
        className="font-mono"
        fontSize={11}
        letterSpacing={1.1}
        fill="var(--accent-400)"
      >
        SEU CV
      </text>

      <rect
        x={234}
        y={278}
        width={12}
        height={12}
        fill="var(--accent-900)"
        stroke="var(--accent-500)"
        strokeWidth={1.5}
      />
      <rect x={238} y={282} width={4} height={4} fill="var(--accent-500)" />

      <path
        d="M 370 248 L 378 248 M 402 248 L 410 248 M 390 260 L 390 268"
        fill="none"
        stroke="var(--rumvia-bg)"
        strokeWidth={1}
      />
      <rect
        x={382}
        y={240}
        width={16}
        height={16}
        fill="var(--accent-900)"
        stroke="var(--rumvia-bg)"
        strokeWidth={1.5}
      />
      <rect x={387} y={245} width={6} height={6} fill="var(--accent-400)" />
      <path d="M 390 240 L 390 232" fill="none" stroke="var(--rumvia-bg)" strokeWidth={1} />
      <text
        x={390}
        y={226}
        textAnchor="middle"
        className="font-mono"
        fontSize={11}
        fontWeight={500}
        letterSpacing={1.1}
        fill="var(--rumvia-bg)"
      >
        VOCÊ ESTÁ AQUI · 74%
      </text>

      <rect
        x={504}
        y={206}
        width={12}
        height={12}
        fill="var(--accent-900)"
        stroke="var(--accent-600)"
        strokeWidth={1.5}
        strokeDasharray="2 2"
      />

      <path
        d="M 642 176 L 650 176 M 670 176 L 678 176"
        fill="none"
        stroke="var(--accent-600)"
        strokeWidth={1}
      />
      <rect
        x={654}
        y={170}
        width={12}
        height={12}
        fill="var(--accent-900)"
        stroke="var(--accent-600)"
        strokeWidth={1.5}
        strokeDasharray="2 2"
      />
      <path
        d="M 657 176 L 663 176 M 660 173 L 660 179"
        fill="none"
        stroke="var(--accent-500)"
        strokeWidth={1}
      />
      <path d="M 660 170 L 660 161" fill="none" stroke="var(--accent-600)" strokeWidth={1} />
      <text
        x={660}
        y={155}
        textAnchor="middle"
        className="font-mono"
        fontSize={11}
        letterSpacing={1.1}
        fill="var(--accent-500)"
      >
        O QUE O MERCADO PEDE
      </text>
    </svg>
  );
}
