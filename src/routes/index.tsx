import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { CvDropzone } from "@/components/app/cv-dropzone";
import { LandingTour } from "@/components/rumvia/landing-tour";
import { formatCents } from "@/components/rumvia/paywall";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { usePublicPlan } from "@/hooks/use-subscription";
import { AVISO_ACESSO_PAGO, PLANO_INCLUI, PREVIA_GRATUITA } from "@/lib/plan-copy";
import { getLandingStats } from "@/lib/public-stats.functions";

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

const HOW_IT_WORKS = [
  {
    num: "01",
    title: "Envie o currículo",
    body: "Arraste o PDF. Extraímos suas skills com dicionário próprio — sem IA generativa, sem envio para terceiros. Seus dados ficam só aqui.",
  },
  {
    num: "02",
    title: "Escolha a trilha",
    body: "DevOps/SRE, Data Engineer ou Full Stack. Cada trilha mapeia centenas de vagas reais — Brasil (BRL) e remoto global (USD) sempre separados.",
  },
  {
    num: "03",
    title: "Veja gap + plano",
    body: "Score de aderência em %, quais skills faltam, faixa salarial para seu nível e plano de estudos priorizado pela demanda real do mercado.",
  },
];

const FAQ_ITEMS = [
  {
    q: "O que é gratuito e o que é pago?",
    a: "A prévia é gratuita e não exige cadastro: score de aderência, amostra das skills em falta e das ferramentas mais pedidas. O RUMVIA completo — painel, histórico de gap, plano de estudos, salários, empresas e progresso — é assinatura mensal. Criar a conta não libera o acesso: o painel só abre depois que a assinatura for confirmada.",
  },
  {
    q: "Quanto custa e como cobram?",
    a: "Uma assinatura mensal, cobrada no cartão de crédito e renovada automaticamente até você cancelar. O valor está na seção Planos, acima. O pagamento é processado pelo Asaas — o RUMVIA nunca vê os dados do seu cartão. O cancelamento é feito por você mesmo em Configurações → Assinatura e vale na hora.",
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
    a: "DevOps / SRE / Platform Engineer, Data Engineer e Full Stack. Novas trilhas são adicionadas como dados no banco — sem alteração de código. Backend e Frontend estão previstos para breve.",
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
  const { isAuthenticated } = useAuth();
  const loadStats = useServerFn(getLandingStats);
  const { data: stats } = useQuery({
    queryKey: ["landing-stats"],
    staleTime: 5 * 60 * 1000,
    queryFn: () => loadStats(),
  });
  const { data: plan } = usePublicPlan();
  // Preço nunca é escrito no JSX (regra 1) — vem de billing_plans, a mesma
  // fonte que o checkout cobra. Sem plano carregado, o card não inventa número.
  const preco = plan ? formatCents(plan.priceCents, plan.currency) : null;
  const [openFaq, setOpenFaq] = React.useState<number | null>(null);

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      {/* ═══ HEADER ═══ */}
      <header className="sticky top-0 z-30 flex h-12 items-center border-b border-divider bg-bg">
        <div className="rumvia-container flex w-full items-center">
          <Link to="/" className="label-h6 mr-auto text-accent-700">
            RUMVIA
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
                Comparamos sua experiência com centenas de vagas reais — Brasil e remoto global — e
                mostramos em porcentagem o que você domina e{" "}
                <strong className="text-bg">o que está te custando oportunidades</strong>.
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
                {preco ? ` · Painel completo por ${preco}/mês` : ""}
              </p>
            </div>

            {/* Upload card — fundo claro para que o CvDropzone (consent text) fique legível */}
            <div data-tour="tour-landing-upload" className="border border-divider bg-bg p-7">
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
                hint:
                  stats?.tracks.map((t) => t.name).join(" · ") ??
                  "DevOps · Data Engineer · Full Stack",
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
        <div data-tour="tour-landing-como-funciona" className="rumvia-container">
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
            {HOW_IT_WORKS.map((step) => (
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
        <div data-tour="tour-landing-funcionalidades" className="rumvia-container">
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
        <div data-tour="tour-landing-planos" className="rumvia-container">
          <p className="label-h6 text-neutral-500">// Planos e preços</p>
          <h2 className="mt-3 font-heading text-h2 uppercase">Um plano. Sem pegadinha.</h2>
          <p
            className="mt-3 text-body text-neutral-600"
            style={{ maxWidth: 620, lineHeight: 1.65 }}
          >
            A prévia do seu currículo é gratuita e não pede cadastro. O RUMVIA completo é assinatura
            mensal — <strong className="text-neutral-900">{AVISO_ACESSO_PAGO}</strong>
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
                <span className="label-h6 text-accent-700">
                  {plan?.name ?? "Assinatura"} — acesso à conta
                </span>
                {/* Sem plano carregado não existe preço a mostrar. Um traço
                    solto seguido de "por mês" lê como bug; a frase honesta, não. */}
                {preco ? (
                  <p className="mt-2 flex items-baseline gap-2">
                    <span
                      className="num font-heading font-bold text-accent-700"
                      style={{ fontSize: 44, lineHeight: 1, letterSpacing: "-0.02em" }}
                    >
                      {preco}
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
                  {plan?.trialDays ? ` · ${plan.trialDays} dias grátis` : ""}
                </p>
              </div>
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
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section id="faq" className="border-t border-divider py-16">
        <div data-tour="tour-landing-faq" className="rumvia-container">
          <p className="label-h6 text-neutral-500">// Dúvidas frequentes</p>
          <h2 className="mt-3 font-heading text-h2 uppercase">Perguntas comuns</h2>
          <div className="mt-8 border-t border-divider">
            {FAQ_ITEMS.map((item, i) => (
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
              <span
                className="font-heading font-bold uppercase"
                style={{ fontSize: 20, color: "var(--rumvia-bg)", letterSpacing: "0.08em" }}
              >
                RUMVIA
              </span>
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
                    { label: "Termos de uso", href: "#" },
                    { label: "LGPD", href: "/privacidade" },
                  ],
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
                { label: "Termos", href: "#" },
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

      {/* Autenticado (conta paga/admin) não recebe o pitch de vendas —
          quem já é cliente e volta pra "/" não precisa do convite. */}
      {!isAuthenticated && <LandingTour />}
    </div>
  );
}
