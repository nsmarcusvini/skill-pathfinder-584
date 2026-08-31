/**
 * requireActiveSubscription — trava server-side de feature paga.
 *
 * Usa `can_access_paid_features`, não `has_active_subscription`: admin entra
 * sem pagar (senão o dono do produto se tranca para fora do próprio painel).
 *
 * Encadeie DEPOIS de requireSupabaseAuth, nunca no lugar dele:
 *
 *   export const minhaFeaturePaga = createServerFn({ method: "POST" })
 *     .middleware([requireSupabaseAuth, requireActiveSubscription])
 *     .handler(async ({ context }) => { ... });
 *
 * Esconder o botão no front NÃO é proteção. A decisão de quem é pagante sai de
 * `public.has_active_subscription`, a mesma função que a RLS pode usar.
 */
import { createMiddleware } from "@tanstack/react-start";

/** Mensagem estável — o front reconhece para mandar o usuário ao /assinatura. */
export const PAYWALL_ERROR = "RUMVIA_PRO_REQUIRED";

export const requireActiveSubscription = createMiddleware({ type: "function" }).server(
  async ({ next, context }) => {
    const { userId } = (context ?? {}) as unknown as { userId?: string };
    if (!userId) {
      throw new Error("requireActiveSubscription precisa vir depois de requireSupabaseAuth.");
    }

    const { supabaseAdmin } = await import("./client.server");
    const { data, error } = await supabaseAdmin.rpc("can_access_paid_features", {
      _user_id: userId,
    });
    if (error) throw new Error(error.message);
    if (data !== true) throw new Error(PAYWALL_ERROR);

    return next({ context: { isPro: true } });
  },
);
