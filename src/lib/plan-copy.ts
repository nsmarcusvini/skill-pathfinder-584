/**
 * Texto de produto do plano, em um lugar só. A landing e `/assinatura` leem
 * daqui — se as duas listas divergirem, a página de vendas promete uma coisa e
 * a tela de pagamento entrega outra.
 *
 * O PREÇO não mora aqui: vem de `billing_plans` (regra 1). Aqui só o que o
 * plano entrega e como o ciclo é dito em português.
 */

/** O que roda sem conta e sem pagar. É tudo o que o visitante tem de graça. */
export const PREVIA_GRATUITA = [
  "Leitura do currículo com dicionário próprio, sem IA generativa",
  "Score de aderência à trilha escolhida",
  "Amostra das skills que faltam e das ferramentas mais pedidas",
];

/**
 * O que só abre com assinatura ativa. Igual nos três ciclos — o que muda entre
 * mensal, trimestral e anual é só o preço e a frequência da cobrança.
 */
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

/**
 * Ciclo do Asaas → português. Chave crua do gateway (`billing_plans.cycle`),
 * para que a tradução exista em um lugar só.
 */
const CYCLE_TEXT: Record<string, { periodo: string; cobranca: string; curto: string }> = {
  MONTHLY: { periodo: "por mês", cobranca: "Cobrado todo mês", curto: "Mensal" },
  BIMONTHLY: {
    periodo: "a cada 2 meses",
    cobranca: "Cobrado a cada 2 meses",
    curto: "Bimestral",
  },
  QUARTERLY: {
    periodo: "por trimestre",
    cobranca: "Cobrado a cada 3 meses",
    curto: "Trimestral",
  },
  SEMIANNUALLY: {
    periodo: "por semestre",
    cobranca: "Cobrado a cada 6 meses",
    curto: "Semestral",
  },
  YEARLY: { periodo: "por ano", cobranca: "Cobrado uma vez por ano", curto: "Anual" },
};

/** "por mês", "por trimestre", "por ano". */
export function rotuloPeriodo(cycle: string): string {
  return CYCLE_TEXT[cycle]?.periodo ?? "por ciclo";
}

/** "Cobrado a cada 3 meses" — a frase que tira a dúvida de quando sai o dinheiro. */
export function rotuloCobranca(cycle: string): string {
  return CYCLE_TEXT[cycle]?.cobranca ?? "Cobrado a cada ciclo";
}

/** "Mensal", "Trimestral", "Anual" — nome curto para abas e seletores. */
export function rotuloCiclo(cycle: string): string {
  return CYCLE_TEXT[cycle]?.curto ?? cycle;
}
