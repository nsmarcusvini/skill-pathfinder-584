import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileUp, Gauge, Target } from "lucide-react";

import { PublicHeader } from "@/components/app/public-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { Button } from "@/components/ui/button";

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
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicHeader />

      <main className="rumvia-container flex-1 py-12">
        <section className="max-w-3xl">
          <p className="label-h6 text-accent-700">Análise de carreira em tecnologia</p>
          <h1 className="mt-2 font-heading text-h1">
            Quanto seu CV está aderente à sua trilha de carreira?
          </h1>
          <p className="mt-3 max-w-2xl text-body text-neutral-700">
            O RUMVIA compara seu currículo com vagas reais — Brasil e remoto global — e mostra, em
            porcentagem, o que você já domina e o que falta para o próximo nível.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/analise">
                <FileUp className="size-4" aria-hidden />
                Enviar meu currículo
              </Link>
            </Button>
            <Link to="/login" className="text-caption text-accent-700 underline">
              Já é cliente? Entrar
            </Link>
          </div>
          <p className="mt-2 text-caption text-neutral-600">
            Sem cadastro para a prévia. Sua análise fica salva neste navegador.
          </p>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          {[
            {
              icon: <FileUp className="size-5 text-accent-700" aria-hidden />,
              title: "1. Envie o CV",
              text: "Extraímos suas skills de forma determinística, sem adivinhação.",
            },
            {
              icon: <Target className="size-5 text-accent-700" aria-hidden />,
              title: "2. Escolha a trilha",
              text: "DevOps, Data Engineering ou Fullstack, com variantes e senioridade.",
            },
            {
              icon: <Gauge className="size-5 text-accent-700" aria-hidden />,
              title: "3. Veja sua aderência",
              text: "Um score único por trilha, senioridade e segmento de mercado.",
            },
          ].map((item) => (
            <Blueprint key={item.title} className="p-5">
              {item.icon}
              <h2 className="label-h6 mt-2 text-neutral-900">{item.title}</h2>
              <p className="mt-1 text-caption text-neutral-700">{item.text}</p>
            </Blueprint>
          ))}
        </section>

        <section className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-divider pt-6">
          <p className="text-body text-neutral-700">
            Pronto para descobrir suas lacunas reais de skills?
          </p>
          <Button asChild variant="outline">
            <Link to="/analise">
              Começar agora
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
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
