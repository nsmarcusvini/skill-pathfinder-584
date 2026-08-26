import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Exclui definitivamente a conta do usuário autenticado:
 * remove arquivos do Storage, dados de perfil/preferências e o usuário em auth.
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Arquivos do usuário ficam em <bucket>/<userId>/...
    const buckets = ["cvs", "curriculos"];
    for (const bucket of buckets) {
      const { data: files } = await supabaseAdmin.storage.from(bucket).list(userId);
      if (files && files.length > 0) {
        await supabaseAdmin.storage
          .from(bucket)
          .remove(files.map((f) => `${userId}/${f.name}`));
      }
    }

    await supabaseAdmin.from("user_track_preferences").delete().eq("user_id", userId);
    await supabaseAdmin.from("profiles").delete().eq("id", userId);

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw error;

    return { ok: true };
  });
