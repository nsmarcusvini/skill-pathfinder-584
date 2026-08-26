import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * compute-gap — ÚNICA fonte da fórmula de aderência do RUMVIA.
 * Nenhuma tela recalcula score por conta própria: todas consomem este retorno.
 *
 * Fórmula:
 *   cobertura_i = required_level > 0 ? min(level_usuario / required_level, 1) : (level > 0 ? 1 : 0)
 *   score       = Σ(importancia_i * cobertura_i) / Σ(importancia_i) * 100
 * Escopo: baselines da trilha + senioridade-alvo. market_segment não entra na
 * fórmula (é dimensão de mercado), mas viaja no retorno para as telas.
 */
export const computeGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("current_track_id, seniority, target_region")
      .eq("id", userId)
      .maybeSingle();

    const trackId = profile?.current_track_id ?? null;
    const seniority = profile?.seniority ?? "pleno";
    const marketSegment = profile?.target_region === "remoto_global" ? "remoto_global" : "br";

    if (!trackId) {
      return {
        trackId: null,
        seniority,
        marketSegment,
        score: 0,
        computedAt: new Date().toISOString(),
        items: [] as GapItem[],
      };
    }

    const [{ data: baselines }, { data: userSkills }] = await Promise.all([
      supabase
        .from("track_skill_baselines")
        .select("skill_id, importance, required_level, is_core, skills(canonical_name)")
        .eq("track_id", trackId)
        .eq("seniority", seniority),
      supabase.from("user_skills").select("skill_id, level").eq("user_id", userId),
    ]);

    const levelBySkill = new Map<string, number>(
      (userSkills ?? []).map((s) => [s.skill_id, s.level ?? 0]),
    );

    let weighted = 0;
    let totalWeight = 0;
    const items: GapItem[] = [];

    for (const b of baselines ?? []) {
      const importance = b.importance ?? 0;
      const required = b.required_level ?? 0;
      const level = levelBySkill.get(b.skill_id) ?? 0;
      const coverage = required > 0 ? Math.min(level / required, 1) : level > 0 ? 1 : 0;

      weighted += importance * coverage;
      totalWeight += importance;

      items.push({
        skillId: b.skill_id,
        name: (b.skills as { canonical_name: string } | null)?.canonical_name ?? "",
        importance,
        requiredLevel: required,
        userLevel: level,
        isCore: b.is_core ?? false,
        coverage: Math.round(coverage * 1000) / 1000,
      });
    }

    items.sort((a, b) => b.importance * (1 - b.coverage) - a.importance * (1 - a.coverage));

    return {
      trackId,
      seniority,
      marketSegment,
      score: totalWeight > 0 ? Math.round((weighted / totalWeight) * 100) : 0,
      computedAt: new Date().toISOString(),
      items,
    };
  });

export interface GapItem {
  skillId: string;
  name: string;
  importance: number;
  requiredLevel: number;
  userLevel: number;
  isCore: boolean;
  coverage: number;
}
