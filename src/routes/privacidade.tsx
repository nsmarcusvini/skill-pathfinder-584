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
        {/* Data exata, não "2026" — o roadmap já apontava que um ano solto não
            é data de atualização. Passou a valer com a seção de registro de
            uso, que é o tipo de mudança que precisa de data verificável. */}
        <PageHeader
          eyebrow="Legal"
          title="Privacidade"
          subtitle="Última atualização: 10 de setembro de 2026."
        />
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
            <h2 className="label-h6 text-neutral-900">O que é lido do currículo</h2>
            <p className="mt-1 text-body text-neutral-700">
              Lemos o texto do arquivo para identificar termos técnicos do nosso dicionário, títulos
              de cargo e datas usadas para estimar anos de experiência. Não fazemos envio a
              terceiros: nenhum provedor externo, nenhum modelo de linguagem, nenhuma API de IA
              recebe o conteúdo do seu CV.
            </p>
          </section>
          <section>
            <h2 className="label-h6 text-neutral-900">Consentimento e retenção</h2>
            <p className="mt-1 text-body text-neutral-700">
              O arquivo só é aceito após seu consentimento explícito, e a data do aceite fica
              registrada. Currículos de visitantes sem conta são <strong>apagados em 7 dias</strong>
              . Se você criar conta, o arquivo fica guardado até você excluí-lo.
            </p>
          </section>
          <section>
            <h2 className="label-h6 text-neutral-900">Limites de uso</h2>
            <p className="mt-1 text-body text-neutral-700">
              Para evitar abuso, visitantes têm limite de 2 leituras de currículo por hora e 1
              currículo ativo por sessão. Na conta assinante existe um teto diário de uso — alto o
              bastante para nunca aparecer em uso normal, e dimensionado apenas para impedir
              extração automatizada da base de vagas.
            </p>
          </section>
          {/* Trilha de uso — obrigatório declarar. Uma trilha não declarada é
              exatamente o tipo de coisa que vira o problema em vez de resolver
              um. O que ela é e por que existe: migration 20260910141000. */}
          <section>
            <h2 className="label-h6 text-neutral-900">Registro de uso da conta assinante</h2>
            <p className="mt-1 text-body text-neutral-700">
              Enquanto sua assinatura está ativa, registramos <strong>quais recursos</strong> você
              usou e <strong>quando</strong> — vagas abertas, cliques para a vaga na origem,
              consultas de empresa, salário e catálogo —, junto de um código derivado do seu IP, que
              não permite recuperar o endereço. Isso tem dois usos e só esses dois: aplicar o teto
              diário acima e comprovar que o serviço foi prestado, caso haja contestação de cobrança
              ou reclamação. Não usamos esse registro para publicidade, não o vendemos e não o
              compartilhamos com terceiros.
            </p>
            <p className="mt-2 text-body text-neutral-700">
              O detalhe (qual vaga, em que horário) é apagado após <strong>90 dias</strong> e some
              junto com a conta, se você excluí-la. O que permanece por até 18 meses é apenas a{" "}
              <strong>contagem por dia</strong>, sem identificar itens: é o mínimo necessário para
              defesa em uma disputa que chegue depois, e a lei permite conservá-lo com essa
              finalidade (LGPD, art. 16, II). Você pode consultar essa contagem a qualquer momento —
              ela entra na exportação dos seus dados em Minha conta.
            </p>
          </section>
          <section>
            <h2 className="label-h6 text-neutral-900">Seus direitos</h2>
            <p className="mt-1 text-body text-neutral-700">
              Você pode exportar todos os seus dados em JSON ou excluir sua conta a qualquer momento
              em Minha conta — a exclusão apaga também os arquivos armazenados. Sem conta, basta
              pedir a exclusão pelo e-mail de contato informado no rodapé e apagamos a sessão e o
              currículo vinculados.
            </p>
          </section>
        </Blueprint>
      </main>
    </div>
  );
}
