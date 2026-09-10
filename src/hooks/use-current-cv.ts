import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * O CV atual desta sessão (anônima ou permanente), se já foi lido.
 *
 * FONTE ÚNICA: tanto /analise (retoma uma análise em andamento) quanto
 * /cadastro (exige extração antes de deixar criar conta) leem daqui. Duas
 * cópias da mesma query divergiriam no dia em que o critério de "já
 * extraído" mudasse — e cache reuso entre as duas telas é bônus, não custo.
 */
export function useCurrentCv(options?: { enabled?: boolean }) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["analise-cv", user?.id],
    // `ProtectedRoute` chama este hook em toda rota de conta, mas só precisa do
    // dado quando o portão de CV está ligado — sem o opt-out seria uma consulta
    // a mais em cada navegação do painel.
    enabled: (options?.enabled ?? true) && Boolean(user),
    queryFn: async () => {
      const { data } = await supabase
        .from("cvs")
        .select("id, status, created_at")
        .eq("is_current", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data ?? null;
    },
  });
}

/** true quando o CV desta sessão já foi lido com sucesso (status "parsed"). */
export function hasExtractedCv(cv: { status: string } | null | undefined): boolean {
  return cv?.status === "parsed";
}
