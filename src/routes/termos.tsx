import { Link, createFileRoute } from "@tanstack/react-router";

import { PublicHeader } from "@/components/app/public-header";
import { PageHeader } from "@/components/rumvia/page-header";
import { Blueprint } from "@/components/rumvia/blueprint";
import { EmptyState } from "@/components/rumvia/states";
import { AVISO_ARREPENDIMENTO } from "@/lib/plan-copy";
import { FORNECEDOR, TERMOS_VERSAO } from "@/lib/legal-copy";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de uso — RUMVIA" },
      {
        name: "description",
        content: "Condições de uso do RUMVIA: assinatura, cobrança, cancelamento e arrependimento.",
      },
      { property: "og:title", content: "Termos de uso — RUMVIA" },
      { property: "og:description", content: "Termos de uso do RUMVIA." },
    ],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <PublicHeader />
      <main className="rumvia-container flex-1 py-10">
        <PageHeader
          eyebrow="Legal"
          title="Termos de uso"
          subtitle={`Versão ${TERMOS_VERSAO}. Vale a partir desta data para novas assinaturas; ver "Alterações" no fim.`}
        />
        <Blueprint className="mt-6 flex max-w-3xl flex-col gap-4 p-6">
          <section>
            <h2 className="label-h6 text-neutral-900">Quem oferece o RUMVIA</h2>
            {FORNECEDOR.nome && FORNECEDOR.documento && FORNECEDOR.contato ? (
              <p className="mt-1 text-body text-neutral-700">
                O RUMVIA é operado por {FORNECEDOR.nome}
                {FORNECEDOR.documento ? `, ${FORNECEDOR.documento}` : ""}
                {FORNECEDOR.cidadeUf ? `, com domicílio em ${FORNECEDOR.cidadeUf}` : ""}. Contato:{" "}
                {FORNECEDOR.contato}.
              </p>
            ) : (
              <EmptyState
                className="mt-2"
                title="Identificação do fornecedor pendente"
                description="Esta seção ainda não tem os dados reais (nome, documento e contato) preenchidos em src/lib/legal-copy.ts. O CDC exige essa identificação publicada — preencher antes de tratar esta página como concluída."
              />
            )}
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">O que o RUMVIA é — e o que não é</h2>
            <p className="mt-1 text-body text-neutral-700">
              O RUMVIA compara o seu currículo com vagas reais de tecnologia e devolve um score de
              aderência, as lacunas priorizadas e um plano de estudos, com base num dicionário de
              skills e regras determinísticas — sem inteligência artificial generativa.
            </p>
            <p className="mt-2 text-body text-neutral-700">
              O RUMVIA <strong>não é</strong> uma promessa de emprego, não é consultoria de carreira
              individualizada e não garante resultado nenhum — nem aprovação em processo seletivo,
              nem aumento salarial. O score é uma medida estatística de aderência, calculada a
              partir da demanda observada nas vagas indexadas; decisões de contratação são de
              terceiros e fogem do nosso controle.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Prévia gratuita e conta paga</h2>
            <p className="mt-1 text-body text-neutral-700">
              A análise inicial do currículo (em <code>/</code> e <code>/analise</code>) é gratuita
              e não exige cadastro. Criar uma conta não libera o painel completo: o acesso a
              <code> /onboarding</code> e às demais telas da conta só é liberado depois que uma
              assinatura é confirmada. As duas exceções são a própria tela de assinatura — é onde se
              paga — e a tela de conta, onde exportar ou excluir seus dados é um direito garantido
              pela LGPD, não um benefício de plano.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Preço, ciclo e renovação automática</h2>
            <p className="mt-1 text-body text-neutral-700">
              A assinatura RUMVIA Pro é vendida em três ciclos — mensal, trimestral e anual —, com o
              mesmo acesso nos três. Os valores atuais de cada ciclo estão sempre na seção Planos da
              página inicial e na tela de Assinatura, nunca fixados neste texto: assim o preço
              exibido no momento da compra é sempre o vigente.
            </p>
            <p className="mt-2 text-body text-neutral-700">
              A cobrança <strong>renova automaticamente</strong> ao fim de cada ciclo, no mesmo
              cartão de crédito, até que você cancele. Só aceitamos cartão de crédito: o Asaas (o
              processador de pagamento) não aceita PIX em cobrança recorrente, e PIX Automático de
              verdade exige que o recebedor seja pessoa jurídica — regra do Banco Central. Nunca
              vemos os dados do seu cartão: eles são digitados diretamente no domínio do Asaas.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Direito de arrependimento</h2>
            <p className="mt-1 text-body text-neutral-700">{AVISO_ARREPENDIMENTO}</p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Como cancelar</h2>
            <p className="mt-1 text-body text-neutral-700">
              O cancelamento é feito por você mesmo, a qualquer momento, em Configurações →
              Assinatura, e tem efeito <strong>imediato</strong>: o acesso ao painel termina na hora
              do pedido, sem aviso prévio a dar. Fora do prazo de arrependimento, não há reembolso
              proporcional pelo tempo não utilizado do ciclo já cobrado.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Nova assinatura após reembolso</h2>
            <p className="mt-1 text-body text-neutral-700">
              O direito de arrependimento é seu e nós o cumprimos integralmente: dentro dos 7 dias,
              o valor volta inteiro e sem discussão. Depois disso, porém,{" "}
              <strong>não abrimos uma nova assinatura para a mesma pessoa</strong> — do mesmo modo
              que ninguém é obrigado a permanecer em um contrato, também não somos obrigados a
              celebrar outro. A mesma regra vale se houver contestação de cobrança junto ao emissor
              do cartão. Isso não afeta em nada o reembolso já recebido, e não é definitivo: se você
              quiser voltar, fale com o contato acima — a liberação é manual e costuma ser rápida.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Uso justo</h2>
            <p className="mt-1 text-body text-neutral-700">
              A assinatura é individual e destinada ao seu próprio uso. Existe um{" "}
              <strong>teto diário</strong> de consultas — dimensionado bem acima do uso real de uma
              pessoa procurando emprego, de modo que você não deve encostar nele — cuja única função
              é impedir a extração automatizada da base. Não é permitido raspar, copiar em massa,
              revender ou redistribuir o conteúdo, nem compartilhar as credenciais da conta. Se você
              encostar no teto em uso legítimo, avise: o limite é ajustável e o problema, nesse
              caso, é do número e não seu.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Reajuste de preço</h2>
            <p className="mt-1 text-body text-neutral-700">
              Mudanças de preço valem só para assinaturas novas. Quem já está assinando continua
              pagando o valor contratado no momento da assinatura, ciclo após ciclo, até cancelar ou
              até trocar de plano por vontade própria.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Cobrança que falha</h2>
            <p className="mt-1 text-body text-neutral-700">
              Se uma cobrança de renovação falhar, o Asaas tenta novamente automaticamente, e seu
              acesso <strong>continua ativo</strong> enquanto as tentativas correm. Se todas as
              tentativas se esgotarem sem sucesso, a assinatura é cancelada e o acesso é bloqueado.
              Em caso de contestação da cobrança junto ao emissor do cartão (chargeback), o acesso é
              suspenso imediatamente; a reativação, quando cabível, é feita manualmente.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Seus dados</h2>
            <p className="mt-1 text-body text-neutral-700">
              Como tratamos seu currículo, suas skills e seus dados pessoais está descrito em{" "}
              <Link to="/privacidade" className="text-accent-700 underline">
                Privacidade
              </Link>{" "}
              — não duplicamos esse conteúdo aqui para as duas páginas não divergirem com o tempo.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Disponibilidade e responsabilidade</h2>
            <p className="mt-1 text-body text-neutral-700">
              Fazemos esforço razoável para manter o RUMVIA no ar e os dados de mercado atualizados,
              mas não prometemos disponibilidade contínua nem ausência total de erros — inclusive
              porque parte dos dados (vagas, faixas salariais) vem de fontes externas fora do nosso
              controle. Não nos responsabilizamos por decisões de carreira tomadas com base no score
              ou nas recomendações do RUMVIA.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Lei aplicável e foro</h2>
            <p className="mt-1 text-body text-neutral-700">
              Estes Termos são regidos pela lei brasileira, em especial o Código de Defesa do
              Consumidor. Fica eleito o foro do domicílio do consumidor para dirimir eventuais
              controvérsias, conforme garante a legislação consumerista.
            </p>
          </section>

          <section>
            <h2 className="label-h6 text-neutral-900">Alterações</h2>
            <p className="mt-1 text-body text-neutral-700">
              Podemos atualizar este texto. Uma alteração relevante muda a versão indicada no topo
              desta página, e o aceite fica registrado por versão — o que já foi aceito não é
              retroativamente alterado por uma versão futura.
            </p>
          </section>
        </Blueprint>
      </main>
    </div>
  );
}
