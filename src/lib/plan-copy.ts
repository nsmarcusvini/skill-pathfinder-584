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
 * Direito de arrependimento (CDC art. 49): 7 dias corridos da primeira
 * cobrança, com devolução INTEGRAL — nunca proporcional. Dito antes do
 * clique, não só na letra miúda: landing, `/assinatura` e Termos de uso leem
 * daqui, para as três telas nunca divergirem sobre o prazo ou o efeito.
 */
export const DIAS_ARREPENDIMENTO = 7;

export const AVISO_ARREPENDIMENTO =
  `Direito de arrependimento: você tem ${DIAS_ARREPENDIMENTO} dias corridos após a primeira ` +
  "cobrança para desistir e receber o valor pago de volta, na íntegra (Código de Defesa do " +
  "Consumidor, art. 49). Depois desse prazo, cancelar interrompe a renovação na hora e não há " +
  "reembolso proporcional, mas o ciclo já pago continua valendo até o fim.";

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

/**
 * `subscriptions.status` → português. Mora aqui pelo mesmo motivo do ciclo: a
 * tela do cliente (`/assinatura`) e a do admin (`/admin/clientes`) mostram o
 * mesmo estado, e duas listas separadas divergiriam no dia em que um status
 * novo aparecesse em só uma delas.
 */
const STATUS_TEXT: Record<string, string> = {
  pending: "Aguardando pagamento",
  active: "Ativa",
  past_due: "Pagamento pendente",
  cancelled: "Cancelada",
  refunded: "Estornada",
  expired: "Expirada",
};

export function rotuloStatus(status: string): string {
  return STATUS_TEXT[status] ?? status;
}

/** "Cartão" / "PIX" — `subscriptions.method` guarda o vocabulário do Asaas. */
export function rotuloMetodo(method: string | null): string {
  if (!method) return "—";
  if (method === "CREDIT_CARD" || method === "CARD") return "Cartão";
  if (method === "PIX") return "PIX";
  return method;
}
