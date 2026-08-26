import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Aplica o resultado da leitura do CV ao perfil do visitante:
 * grava trilha/senioridade detectadas (ou corrigidas na hora) e importa as
 * skills extraídas com confiança alta para user_skills — sempre como
 * não verificadas, porque a revisão continua obrigatória no dashboard.
 * Nenhum score é calculado aqui: a fórmula vive só em compute-gap.
 */
export const applyCvAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        cvId: z.string().uuid(),
        trackId: z.string().uuid().optional(),
        seniority: z.enum(["junior", "pleno", "senior", "staff"]).optional(),
        marketSegment: z.enum(["br", "remoto_global"]).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: version } = await supabase
      .from("cv_versions")
      .select("detected_track_id, detected_seniority, detection_confidence")
      .eq("cv_id", data.cvId)
      .order("parsed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const trackId = data.trackId ?? version?.detected_track_id ?? null;
    const seniority = data.seniority ?? version?.detected_seniority ?? "pleno";

    const profileUpdate: Record<string, unknown> = { seniority };
    if (trackId) profileUpdate["current_track_id"] = trackId;
    if (data.marketSegment) {
      profileUpdate["target_region"] = data.marketSegment;
      profileUpdate["target_currency"] = data.marketSegment === "remoto_global" ? "USD" : "BRL";
    }
    await supabase.from("profiles").update(profileUpdate).eq("id", userId);

    const { data: extracted } = await supabase
      .from("cv_extracted_skills")
      .select("skill_id, confidence, level_hint, years_hint, last_year, evidence_snippet")
      .eq("cv_id", data.cvId)
      .gte("confidence", 0.7)
      .not("skill_id", "is", null);

    const rows = (extracted ?? [])
      .filter((e) => e.skill_id)
      .map((e) => ({
        user_id: userId,
        skill_id: e.skill_id!,
        level: Math.max(1, Math.min(5, e.level_hint ?? 2)),
        years: e.years_hint,
        source: "cv" as const,
        evidence: e.evidence_snippet,
        last_used_year: e.last_year,
        is_verified: false,
        updated_at: new Date().toISOString(),
      }));

    if (rows.length > 0) {
      await supabase.from("user_skills").upsert(rows, { onConflict: "user_id,skill_id" });
    }

    return {
      trackId,
      seniority,
      detectionConfidence: version?.detection_confidence ?? null,
      importedSkills: rows.length,
    };
  });
