import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Exclui definitivamente a conta do usuário autenticado:
 * encerra a assinatura, remove arquivos do Storage, dados de perfil/preferências
 * e o usuário em auth.
 *
 * A ORDEM IMPORTA. Encerrar a assinatura vem PRIMEIRO, e não é detalhe: o
 * cancelamento precisa do `provider_subscription_id` gravado na linha de
 * `subscriptions`, que é apagada em cascata junto com o usuário. Invertida, a
 * ordem destrói o ponteiro antes de usá-lo — e aí não há como parar a cobrança
 * nem descobrir qual assinatura no Asaas pertencia a quem.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Excluir a conta não pode deixar cobrança viva. Antes disto, quem exercia
    // o direito de exclusão (LGPD) sumia do banco e continuava sendo cobrado
    // todo mês no Asaas — e o registro local ia junto, então o webhook da
    // cobrança seguinte não achava dono e ficava `handled: false`. Ninguém
    // percebia até o cliente reclamar da fatura.
    //
    // Reaproveita o mesmo caminho do botão "cancelar": estorna se estiver no
    // prazo do CDC e cancela no Asaas. Devolve null quando não há assinatura
    // viva, que é o caso comum de quem exclui a conta.
    const { encerrarAssinaturaViva } = await import("@/lib/billing.functions");
    await encerrarAssinaturaViva(userId);

    // Arquivos do usuário ficam em <bucket>/<userId>/...
    const buckets = ["cvs", "curriculos"];
    for (const bucket of buckets) {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId);
      if (files && files.length > 0) {
        await supabaseAdmin.storage.from(bucket).remove(files.map((f) => `${userId}/${f.name}`));
      }
    }

    await supabaseAdmin.from("user_track_preferences").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return { ok: true };
  });
