import { createServerFn } from "@tanstack/react-start";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * compute-gap — ÚNICA fonte da fórmula de aderência do RUMVIA.
 * Nenhuma tela recalcula score por conta própria.
 *
 * Fórmula (System Design, sem desvio):
 *   demanda(skill) = vagas_com_skill / total_vagas   (trilha + senioridade + segmento + janela + is_active)
 *   peso(skill)    = 0.7 * demanda + 0.3 * (baseline_importance / 100)
 *   cobertura      = min(user_level / required_level, 1); 0 se não possui
 *   aderencia      = Σ(peso * cobertura) / Σ(peso) * 100
 */

export type GapStatus = "dominada" | "parcial" | "faltante" | "extra";
export type WideningStep = "base" | "janela_180" | "senioridades_adjacentes" | "ambos_segmentos";

export const WIDENING_LABEL: Record<WideningStep, string> = {
  base: "recorte padrão",
  janela_180: "janela ampliada para 180 dias",
  senioridades_adjacentes: "senioridades adjacentes incluídas",
  ambos_segmentos: "ambos os segmentos de mercado",
};

export const MIN_SAMPLE = 30;
const EXTRA_DEMAND_MAX = 0.05;
const MARKET_ONLY_DEMAND_MIN = 0.1;
const DEFAULT_REQUIRED_LEVEL = 3;

export interface GapItem {
  skillId: string;
  name: string;
  categoryKey: string | null;
  categoryName: string | null;
  marketDemand: number;
  baselineImportance: number;
  weight: number;
  userLevel: number;
  requiredLevel: number;
  coverage: number;
  gapScore: number;
  status: GapStatus;
}

export interface CategoryScore {
  key: string;
  name: string;
  score: number;
  skills: number;
}

export interface GapResult {
  analysisId: string | null;
  trackId: string | null;
  roleVariantId: string | null;
  seniority: string;
  marketSegment: string;
  currency: string;
  periodDays: number;
  score: number;
  previousScore: number | null;
  delta: number | null;
  categoryScores: CategoryScore[];
  postingsSample: number;
  lowConfidence: boolean;
  wideningStep: WideningStep;
  companiesHiring30d: number;
  salaryMedian: number | null;
  computedAt: string;
  cached: boolean;
  items: GapItem[];
}

const SENIORITY_ORDER = ["junior", "pleno", "senior", "staff"] as const;

function adjacentSeniorities(seniority: string): string[] {
  const i = SENIORITY_ORDER.indexOf(seniority as (typeof SENIORITY_ORDER)[number]);
  if (i < 0) return [seniority];
  return SENIORITY_ORDER.filter((_, idx) => Math.abs(idx - i) <= 1);
}

function hashParams(parts: Array<string | number | null>): string {
  const raw = parts.join("|");
  let h = 5381;
  for (let i = 0; i < raw.length; i += 1) h = ((h << 5) + h + raw.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}-${raw.length.toString(36)}`;
}

/**
 * `unranked`: aceita vagas sem senioridade declarada. Só no último degrau —
 * ali a amostra já está escassa e o resultado sai marcado como low_confidence,
 * então incluir nível desconhecido ajuda mais do que atrapalha. Nos degraus
 * iniciais, misturar isso pioraria a precisão sem necessidade.
 */
function stepConfig(
  step: WideningStep,
  periodDays: number,
  seniority: string,
  marketSegment: string,
): { days: number; sen: string[]; seg: string[]; unranked: boolean } {
  switch (step) {
    case "janela_180":
      return { days: 180, sen: [seniority], seg: [marketSegment], unranked: false };
    case "senioridades_adjacentes":
      return {
        days: 180,
        sen: adjacentSeniorities(seniority),
        seg: [marketSegment],
        unranked: false,
      };
    case "ambos_segmentos":
      return {
        days: 180,
        sen: adjacentSeniorities(seniority),
        seg: ["br", "remoto_global"],
        unranked: true,
      };
    default:
      return { days: periodDays, sen: [seniority], seg: [marketSegment], unranked: false };
  }
}

interface ComputeInput {
  seniority?: string;
  marketSegment?: "br" | "remoto_global";
  periodDays?: number;
  force?: boolean;
}

export const computeGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: ComputeInput | undefined) => input ?? {})
  .handler(async ({ data, context }): Promise<GapResult> => {
    const supabase = context.supabase;
    const userId = context.userId;

    const { data: profile } = await supabase
      .from("profiles")
      .select("current_track_id, seniority, target_region, target_currency")
      .eq("id", userId)
      .maybeSingle();

    const trackId = profile?.current_track_id ?? null;
    const seniority = data.seniority ?? profile?.seniority ?? "pleno";
    const marketSegment =
      data.marketSegment ?? (profile?.target_region === "remoto_global" ? "remoto_global" : "br");
    const currency = marketSegment === "remoto_global" ? "USD" : "BRL";
    const periodDays = data.periodDays ?? 90;

    const { data: pref } = await supabase
      .from("user_track_preferences")
      .select("role_variant_id")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .maybeSingle();
    const roleVariantId = pref?.role_variant_id ?? null;

    const empty: GapResult = {
      analysisId: null,
      trackId,
      roleVariantId,
      seniority,
      marketSegment,
      currency,
      periodDays,
      score: 0,
      previousScore: null,
      delta: null,
      categoryScores: [],
      postingsSample: 0,
      lowConfidence: true,
      wideningStep: "base",
      companiesHiring30d: 0,
      salaryMedian: null,
      computedAt: new Date().toISOString(),
      cached: false,
      items: [],
    };
    if (!trackId) return empty;

    const paramsHash = hashParams([trackId, roleVariantId, seniority, marketSegment, periodDays]);

    // ---- cache: 24h, invalidado por qualquer alteração em user_skills ----
    const { data: lastSkill } = await supabase
      .from("user_skills")
      .select("updated_at")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: previousRows } = await supabase
      .from("gap_analyses")
      .select("*")
      .eq("user_id", userId)
      .eq("params_hash", paramsHash)
      .order("computed_at", { ascending: false })
      .limit(2);

    const latest = previousRows?.[0] ?? null;
    const previousScore = previousRows?.[1]?.overall_score ?? null;

    if (latest && !data.force) {
      const fresh = Date.now() - new Date(latest.computed_at).getTime() < 24 * 60 * 60 * 1000;
      const skillsUnchanged =
        !lastSkill?.updated_at ||
        new Date(latest.computed_at).getTime() >= new Date(lastSkill.updated_at).getTime();
      const cachedStep = (latest.widening_step as WideningStep) ?? "base";
      const cfg = stepConfig(cachedStep, periodDays, seniority, marketSegment);
      const { data: cachedStats } = await supabase.rpc("market_scope_stats", {
        _track_id: trackId,
        _seniorities: cfg.sen,
        _segments: cfg.seg,
        _since: new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000).toISOString(),
        _include_unranked: cfg.unranked,
        // Sempre o segmento escolhido pelo usuário, nunca cfg.seg — na ampliação
        // "ambos_segmentos" ele traz br + remoto_global juntos, e misturar BRL com
        // USD na mediana dá um número sem sentido (regra 5 do CLAUDE.md).
        _salary_segment: marketSegment,
      });
      const cs = cachedStats?.[0];

      // O cache também tem de morrer quando o MERCADO muda, não só as skills do
      // usuário. Sem isto, uma análise feita com a base vazia sobrevivia 24h:
      // o painel mostrava score congelado e "0 vagas analisadas" mesmo depois de
      // milhares de vagas entrarem — e ainda misturava, na mesma tela, empresas e
      // mediana recém-consultadas com um score velho.
      // postings_sample guarda o total_jobs do recorte, então basta compará-lo
      // com a estatística fresca que já buscamos acima: nenhuma consulta a mais.
      const mercadoIgual = Number(cs?.total_jobs ?? 0) === Number(latest.postings_sample ?? 0);

      if (fresh && skillsUnchanged && mercadoIgual) {
        const { data: items } = await supabase
          .from("gap_analysis_items")
          .select("*, skills(canonical_name, skill_categories(key, name))")
          .eq("gap_analysis_id", latest.id);
        return {
          ...empty,
          analysisId: latest.id,
          score: Number(latest.overall_score),
          previousScore: previousScore === null ? null : Number(previousScore),
          delta:
            previousScore === null
              ? null
              : Math.round((Number(latest.overall_score) - Number(previousScore)) * 10) / 10,
          categoryScores: (latest.category_scores as unknown as CategoryScore[]) ?? [],
          postingsSample: latest.postings_sample,
          lowConfidence: latest.low_confidence,
          wideningStep: (latest.widening_step as WideningStep) ?? "base",
          companiesHiring30d: Number(cs?.companies_30d ?? 0),
          salaryMedian:
            cs?.salary_median === null || cs?.salary_median === undefined
              ? null
              : Number(cs.salary_median),
          computedAt: latest.computed_at,
          cached: true,
          items: (items ?? []).map((it) => {
            const skill = it.skills as unknown as {
              canonical_name: string;
              skill_categories: { key: string; name: string } | null;
            } | null;
            return {
              skillId: it.skill_id,
              name: skill?.canonical_name ?? "",
              categoryKey: skill?.skill_categories?.key ?? null,
              categoryName: skill?.skill_categories?.name ?? null,
              marketDemand: Number(it.market_demand),
              baselineImportance: it.baseline_importance,
              weight: Number(it.weight),
              userLevel: it.user_level,
              requiredLevel: it.required_level,
              coverage: Number(it.coverage),
              gapScore: Number(it.gap_score),
              status: it.status as GapStatus,
            };
          }),
        };
      }
    }

    // ---- recorte de mercado, com degraus de ampliação ----
    const steps = (
      ["base", "janela_180", "senioridades_adjacentes", "ambos_segmentos"] as const
    ).map((step) => ({ step, ...stepConfig(step, periodDays, seniority, marketSegment) }));

    let usedStep: WideningStep = "base";
    let totalJobs = 0;
    let demandRows: Array<{ skill_id: string; jobs: number; total_jobs: number }> = [];
    let stats = { total_jobs: 0, companies_30d: 0, salary_median: null as number | null };

    for (const s of steps) {
      const since = new Date(Date.now() - s.days * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows } = await supabase.rpc("market_demand", {
        _track_id: trackId,
        _seniorities: s.sen,
        _segments: s.seg,
        _since: since,
        _include_unranked: s.unranked,
      });
      const { data: statRows } = await supabase.rpc("market_scope_stats", {
        _track_id: trackId,
        _seniorities: s.sen,
        _segments: s.seg,
        _since: since,
        _include_unranked: s.unranked,
        _salary_segment: marketSegment,
      });
      const st = statRows?.[0];
      usedStep = s.step;
      demandRows = (rows ?? []) as typeof demandRows;
      totalJobs = Number(st?.total_jobs ?? 0);
      stats = {
        total_jobs: totalJobs,
        companies_30d: Number(st?.companies_30d ?? 0),
        salary_median:
          st?.salary_median === null || st?.salary_median === undefined
            ? null
            : Number(st.salary_median),
      };
      if (totalJobs >= MIN_SAMPLE) break;
    }

    const lowConfidence = usedStep !== "base" || totalJobs < MIN_SAMPLE;
    const demandBySkill = new Map<string, number>(
      demandRows.map((r) => [r.skill_id, totalJobs > 0 ? Number(r.jobs) / totalJobs : 0]),
    );

    const [{ data: baselines }, { data: userSkills }] = await Promise.all([
      supabase
        .from("track_skill_baselines")
        .select("skill_id, importance, required_level")
        .eq("track_id", trackId)
        .eq("seniority", seniority),
      supabase.from("user_skills").select("skill_id, level").eq("user_id", userId),
    ]);

    const levelBySkill = new Map<string, number>(
      (userSkills ?? []).map((s) => [s.skill_id, s.level ?? 0]),
    );
    const baselineBySkill = new Map<string, { importance: number; required: number }>(
      (baselines ?? []).map((b) => [
        b.skill_id,
        { importance: b.importance ?? 0, required: b.required_level ?? DEFAULT_REQUIRED_LEVEL },
      ]),
    );

    // universo: baseline ∪ skills de alta demanda no mercado ∪ skills do usuário
    const universe = new Set<string>([
      ...baselineBySkill.keys(),
      ...[...demandBySkill.entries()]
        .filter(([, d]) => d >= MARKET_ONLY_DEMAND_MIN)
        .map(([id]) => id),
      ...levelBySkill.keys(),
    ]);

    const { data: skillRows } = await supabase
      .from("skills")
      .select("id, canonical_name, skill_categories(key, name)")
      .in("id", [...universe]);

    const skillMeta = new Map(
      (skillRows ?? []).map((s) => [
        s.id,
        {
          name: s.canonical_name,
          category: (s.skill_categories as unknown as { key: string; name: string } | null) ?? null,
        },
      ]),
    );

    let weighted = 0;
    let totalWeight = 0;
    const byCategory = new Map<string, { name: string; w: number; wc: number; n: number }>();
    const items: GapItem[] = [];

    for (const skillId of universe) {
      const meta = skillMeta.get(skillId);
      if (!meta) continue;
      const demand = demandBySkill.get(skillId) ?? 0;
      const base = baselineBySkill.get(skillId);
      const importance = base?.importance ?? 0;
      const required = base?.required ?? DEFAULT_REQUIRED_LEVEL;
      const level = levelBySkill.get(skillId) ?? 0;
      const weight = 0.7 * demand + 0.3 * (importance / 100);
      const coverage = level <= 0 ? 0 : Math.min(level / Math.max(required, 1), 1);

      const isExtra = !base && level > 0 && demand < EXTRA_DEMAND_MAX;
      const status: GapStatus = isExtra
        ? "extra"
        : coverage >= 1
          ? "dominada"
          : coverage > 0
            ? "parcial"
            : "faltante";

      if (!isExtra) {
        weighted += weight * coverage;
        totalWeight += weight;
        const cat = meta.category;
        if (cat) {
          const acc = byCategory.get(cat.key) ?? { name: cat.name, w: 0, wc: 0, n: 0 };
          acc.w += weight;
          acc.wc += weight * coverage;
          acc.n += 1;
          byCategory.set(cat.key, acc);
        }
      }

      items.push({
        skillId,
        name: meta.name,
        categoryKey: meta.category?.key ?? null,
        categoryName: meta.category?.name ?? null,
        marketDemand: Math.round(demand * 1000) / 1000,
        baselineImportance: importance,
        weight: Math.round(weight * 10000) / 10000,
        userLevel: level,
        requiredLevel: required,
        coverage: Math.round(coverage * 1000) / 1000,
        gapScore: Math.round(weight * (1 - coverage) * 10000) / 10000,
        status,
      });
    }

    items.sort((a, b) => b.gapScore - a.gapScore);

    const score = totalWeight > 0 ? Math.round((weighted / totalWeight) * 1000) / 10 : 0;
    const categoryScores: CategoryScore[] = [...byCategory.entries()]
      .map(([key, v]) => ({
        key,
        name: v.name,
        score: v.w > 0 ? Math.round((v.wc / v.w) * 1000) / 10 : 0,
        skills: v.n,
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    // ---- persistência (cache por params_hash) ----
    const computedAt = new Date().toISOString();
    const { data: inserted } = await supabase
      .from("gap_analyses")
      .insert({
        user_id: userId,
        track_id: trackId,
        role_variant_id: roleVariantId,
        seniority,
        market_segment: marketSegment,
        currency,
        overall_score: score,
        category_scores: categoryScores as unknown as never,
        postings_sample: totalJobs,
        low_confidence: lowConfidence,
        widening_step: usedStep,
        params_hash: paramsHash,
        computed_at: computedAt,
      })
      .select("id")
      .single();

    if (inserted) {
      await supabase.from("gap_analysis_items").insert(
        items.map((i) => ({
          gap_analysis_id: inserted.id,
          skill_id: i.skillId,
          market_demand: i.marketDemand,
          baseline_importance: i.baselineImportance,
          weight: i.weight,
          user_level: i.userLevel,
          required_level: i.requiredLevel,
          coverage: i.coverage,
          gap_score: i.gapScore,
          status: i.status,
        })),
      );
    }

    const prevForDelta = latest ? Number(latest.overall_score) : null;

    return {
      analysisId: inserted?.id ?? null,
      trackId,
      roleVariantId,
      seniority,
      marketSegment,
      currency,
      periodDays,
      score,
      previousScore: prevForDelta,
      delta: prevForDelta === null ? null : Math.round((score - prevForDelta) * 10) / 10,
      categoryScores,
      postingsSample: totalJobs,
      lowConfidence,
      wideningStep: usedStep,
      companiesHiring30d: stats.companies_30d,
      salaryMedian: stats.salary_median,
      computedAt,
      cached: false,
      items,
    };
  });
