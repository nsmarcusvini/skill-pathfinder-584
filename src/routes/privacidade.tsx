import { createFileRoute } from "@tanstack/react-router";

import { PublicHeader } from "@/components/app/public-header";
import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Privacidade — RUMVIA" },
      {
        name: "description",
        content: "Como o RUMVIA trata seu currículo, seus dados pessoais e sua sessão anônima.",
      },
      { property: "og:title", content: "Privacidade — RUMVIA" },
      { property: "og:description", content: "Política de privacidade do RUMVIA." },
    ],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicHeader />
      <main className="rumvia-container flex-1 py-10">
        <PageHeader eyebrow="Legal" title="Privacidade" subtitle="Última atualização: 2026." />
        <Blueprint className="mt-6 flex max-w-3xl flex-col gap-4 p-6">
          <section>
            <h2 className="label-h6 text-neutral-900">Sessão anônima</h2>
            <p className="mt-1 text-body text-neutral-700">
              Ao acessar o RUMVIA criamos uma sessão anônima para que você possa enviar o currículo
              sem cadastro. Essa sessão fica guardada no seu navegador. Ao criar conta, a mesma
              sessão vira conta permanente — nada é copiado nem duplicado.
            </p>
          </section>
          <section>
            <h2 className="label-h6 text-neutral-900">Currículo e skills</h2>
            <p className="mt-1 text-body text-neutral-700">
              O arquivo enviado é usado apenas para extrair skills e calcular sua aderência. A
              extração é determinística, baseada em dicionário próprio. Não usamos seu CV para
              treinar modelos.
            </p>
          </section>
          <section>
            <h2 className="label-h6 text-neutral-900">Seus direitos</h2>
            <p className="mt-1 text-body text-neutral-700">
              Você pode exportar todos os seus dados em JSON ou excluir sua conta a qualquer momento
              em Minha conta. A exclusão apaga também os arquivos armazenados.
            </p>
          </section>
        </Blueprint>
      </main>
    </div>
  );
}
