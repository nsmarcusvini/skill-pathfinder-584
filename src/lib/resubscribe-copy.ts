/**
 * Texto e vocabulário do bloqueio de recontratação — a parte que o CLIENTE
 * também precisa (a tela de `/assinatura` mostra a mensagem num toast).
 *
 * Separado de `resubscribe-block.server.ts` pelo mesmo motivo de
 * `usage-limits.ts`: importar o módulo de servidor num componente arrastaria
 * `supabaseAdmin` para o bundle do browser.
 */

export type BlockReason = "arrependimento_cdc" | "chargeback";

/** Marcador estável no início da mensagem, no espírito de `PAYWALL_ERROR`. */
export const RESUBSCRIBE_BLOCKED = "RUMVIA_RECONTRATACAO_BLOQUEADA";

/**
 * Texto mostrado a quem tenta assinar de novo.
 *
 * Diz o motivo e abre um canal humano de propósito. Um "não" sem explicação
 * numa tela de pagamento vira reclamação pública em minutos — e, se o bloqueio
 * for engano nosso, seria uma reclamação com razão. A liberação existe
 * (`resubscribe_blocks.released_at`), então a porta não está trancada por fora.
 *
 * O que a frase NÃO faz, de propósito: insinuar fraude. A pessoa exerceu um
 * direito; a consequência é não vendermos de novo, não uma acusação.
 */
export function mensagemDeBloqueio(reason: BlockReason): string {
  const motivo =
    reason === "chargeback"
      ? "houve uma contestação de cobrança no cartão"
      : "o valor da sua assinatura anterior foi devolvido integralmente, a seu pedido";

  return (
    `${RESUBSCRIBE_BLOCKED}: Não é possível assinar novamente com esta conta porque ${motivo}. ` +
    `Isso não afeta em nada o reembolso que você já recebeu. Se você quer voltar a usar o ` +
    `RUMVIA, responda ao e-mail da sua assinatura ou fale com o suporte — a liberação é manual, ` +
    `mas é rápida.`
  );
}

/**
 * Remove o marcador antes de mostrar ao usuário.
 *
 * Sem isto o toast começaria com "RUMVIA_RECONTRATACAO_BLOQUEADA:", que parece
 * erro de sistema justamente na tela em que a pessoa mais precisa entender que
 * a decisão foi deliberada.
 */
export function semPrefixoDeBloqueio(mensagem: string): string {
  if (!mensagem.startsWith(RESUBSCRIBE_BLOCKED)) return mensagem;
  const corte = mensagem.indexOf(":");
  return corte >= 0 ? mensagem.slice(corte + 1).trim() : mensagem;
}
