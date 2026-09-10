/**
 * SERVER-ONLY. Bloqueio de recontratação depois de estorno ou chargeback.
 *
 * A DISTINÇÃO QUE SUSTENTA TUDO AQUI: devolver o dinheiro de quem desistiu
 * dentro dos 7 dias é obrigação (CDC art. 49) e não é renunciável por contrato
 * (art. 51, I). VENDER DE NOVO para a mesma pessoa não é obrigação nenhuma.
 * Este módulo não retém um centavo — ele só recusa a próxima venda.
 *
 * Sem isto, o caminho era: assinar → usar 6 dias → pedir estorno → assinar de
 * novo no dia 8, para sempre. `startSubscriptionCheckout` só barrava quem tinha
 * assinatura VIVA, e uma linha `refunded` não é viva.
 *
 * Tabela e o raciocínio de cada coluna: migration 20260910140000.
 */

// O texto mostrado ao usuário vive em `resubscribe-copy.ts`, que é seguro para
// o browser — `/assinatura` precisa dele para o toast, e importar este módulo
// lá arrastaria `supabaseAdmin` para o bundle do cliente.
export { mensagemDeBloqueio, RESUBSCRIBE_BLOCKED } from "@/lib/resubscribe-copy";
import type { BlockReason } from "@/lib/resubscribe-copy";
export type { BlockReason };

/**
 * SHA-256 do e-mail normalizado. Mesmo formato do `ip_hash`: agrupa sem guardar
 * o dado em claro. Normalizar antes é o que faz " Joao@Gmail.com " e
 * "joao@gmail.com" caírem no mesmo hash — sem isso, o bloqueio seria driblado
 * por uma letra maiúscula.
 */
export async function hashEmail(email: string): Promise<string> {
  const normalizado = email.trim().toLowerCase();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalizado));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** E-mail da conta, direto do Auth. Em `encerrarAssinaturaViva` só temos o id. */
async function emailDoUsuario(userId: string): Promise<string | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

export interface BlockInput {
  userId: string;
  reason: BlockReason;
  subscriptionId?: string | null;
  providerCustomerId?: string | null;
  amountCents?: number | null;
}

/**
 * Registra o bloqueio. NUNCA lança.
 *
 * Falhar aqui não pode derrubar o estorno: a pessoa tem direito ao dinheiro de
 * volta independentemente de conseguirmos anotar que ela não pode comprar de
 * novo. O erro vai para o log — o pior caso é uma recontratação que passou, não
 * um reembolso que não saiu.
 */
export async function registrarBloqueio(input: BlockInput): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = await emailDoUsuario(input.userId);

    const { error } = await supabaseAdmin.from("resubscribe_blocks").insert({
      user_id: input.userId,
      email_hash: email ? await hashEmail(email) : null,
      provider_customer_id: input.providerCustomerId ?? null,
      reason: input.reason,
      subscription_id: input.subscriptionId ?? null,
      amount_cents: input.amountCents ?? null,
    });
    if (error) {
      console.error(
        `[bloqueio] falha ao registrar ${input.reason} de ${input.userId}: ${error.message}`,
      );
      return;
    }
    console.warn(
      `[bloqueio] ${input.userId} bloqueado para recontratação (${input.reason}). ` +
        `Liberar: UPDATE resubscribe_blocks SET released_at = now() WHERE user_id = '${input.userId}'.`,
    );
  } catch (erro) {
    console.error("[bloqueio] erro inesperado ao registrar:", erro);
  }
}

export interface BlockRow {
  reason: BlockReason;
  created_at: string;
  user_id: string | null;
}

/**
 * Existe bloqueio ativo para esta identidade?
 *
 * Duas chaves, porque uma sozinha não basta:
 *   user_id    — pega a reincidência na MESMA conta, que é o caso comum.
 *   email_hash — pega quem excluiu a conta e criou outra com o mesmo e-mail.
 *                É por isso que o bloqueio não tem FK para auth.users: com
 *                CASCADE, excluir a conta (botão de LGPD em /conta) apagaria a
 *                própria trava.
 *
 * O que NÃO dá para checar aqui é o CPF: quem coleta é a página hospedada do
 * Asaas, e o `cust_...` só aparece depois do pagamento. Esse caminho é tratado
 * no webhook (`bloqueioPorCustomer`).
 */
export async function bloqueioAtivo(
  userId: string,
  email: string | null,
): Promise<BlockRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const chaves: Array<[coluna: string, valor: string]> = [["user_id", userId]];
  if (email) chaves.push(["email_hash", await hashEmail(email)]);

  for (const [coluna, valor] of chaves) {
    const { data } = await supabaseAdmin
      .from("resubscribe_blocks")
      .select("reason, created_at, user_id")
      .eq(coluna, valor)
      .is("released_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as BlockRow;
  }
  return null;
}

/** Mesma pergunta, pelo cliente do gateway. Só o webhook tem esse dado. */
export async function bloqueioPorCustomer(customerId: string): Promise<BlockRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("resubscribe_blocks")
    .select("reason, created_at, user_id")
    .eq("provider_customer_id", customerId)
    .is("released_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as BlockRow | null) ?? null;
}
