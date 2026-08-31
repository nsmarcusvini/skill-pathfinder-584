/**
 * Texto de produto do plano, em um lugar só. A landing e `/assinatura` leem
 * daqui — se as duas listas divergirem, a página de vendas promete uma coisa e
 * a tela de pagamento entrega outra.
 *
 * O PREÇO não mora aqui: vem de `billing_plans` (regra 1). Aqui só o que o
 * plano entrega.
 */

/** O que roda sem conta e sem pagar. É tudo o que o visitante tem de graça. */
export const PREVIA_GRATUITA = [
  "Leitura do currículo com dicionário próprio, sem IA generativa",
  "Score de aderência à trilha escolhida",
  "Amostra das skills que faltam e das ferramentas mais pedidas",
];

/** O que só abre com assinatura ativa. */
export const PLANO_INCLUI = [
  "Painel completo com aderência recalculada a cada atualização do mercado",
  "Todas as lacunas priorizadas, com o ganho em pontos de cada skill",
  "Stacks em alta, empresas contratando e faixas salariais da sua trilha",
  "Plano de estudos com acompanhamento de progresso",
  "Certificações e cursos recomendados pelo seu gap",
  "Histórico das análises e exportação dos seus dados",
];

/** Frase única de bloqueio. Repetida propositalmente em todo ponto do funil. */
export const AVISO_ACESSO_PAGO = "A conta só é liberada depois que a assinatura for confirmada.";
