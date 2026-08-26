import { createFileRoute } from "@tanstack/react-router";

import { PublicHeader } from "@/components/app/public-header";
import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState } from "@/components/rumvia/states";
import { RequireAccount } from "@/components/auth/require-account";

export const Route = createFileRoute("/analise")({
  head: () => ({
    meta: [
      { title: "Prévia da análise — RUMVIA" },
      {
        name: "description",
        content:
          "Envie seu currículo e veja uma prévia gratuita da sua aderência à trilha escolhida, sem criar conta.",
      },
      { property: "og:title", content: "Prévia da análise — RUMVIA" },
      { property: "og:description", content: "Prévia gratuita da sua aderência ao mercado." },
    ],
  }),
  component: AnalisePage,
});

function AnalisePage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicHeader />
      <main className="rumvia-container flex-1 py-10">
        <PageHeader
          eyebrow="Prévia gratuita"
          title="Sua análise"
          subtitle="Envie o currículo para ver o resumo. Criar conta libera o detalhamento completo."
        />

        <div className="mt-6 flex flex-col gap-6">
          <EmptyState
            title="Envie seu currículo"
            description="O upload de CV será habilitado na próxima etapa da implementação."
          />

          <RequireAccount
            title="Crie sua conta para ver o detalhamento"
            description="A prévia mostra o resumo. O relatório completo de lacunas, salários e empresas fica na conta."
          >
            <Blueprint className="p-5">
              <h2 className="label-h6 text-neutral-700">Detalhamento por skill</h2>
              <p className="mt-1 text-caption text-neutral-700">
                Lacunas por categoria, peso de cada skill na trilha e plano sugerido.
              </p>
            </Blueprint>
          </RequireAccount>
        </div>
      </main>
    </div>
  );
}
