import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ItemStatus = "backlog" | "em_andamento" | "concluido";
export type ItemType = "curso" | "certificacao" | "projeto" | "leitura" | "lab" | "outro";
export type PlanStatus = "ativo" | "pausado" | "concluido";

export interface StudyPlan {
  id: string;
  trackId: string | null;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: PlanStatus;
  createdAt: string;
}

export interface StudyItem {
  id: string;
  planId: string;
  skillId: string | null;
  title: string;
  type: ItemType;
  resourceUrl: string | null;
  status: ItemStatus;
  priority: number;
  estimatedHours: number | null;
  spentHours: number;
  progressPercent: number;
  startDate: string | null;
  dueDate: string | null;
  completedAt: string | null;
  notes: string | null;
  sourceGapItemId: string | null;
  createdAt: string;
}

export interface StudyLogHeatmapRow {
  date: string;
  hours: number;
}

// ─── Plans ───────────────────────────────────────────────────────────────────

export const getStudyPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<StudyPlan[]> => {
    const db = context.supabase;
    const { data, error } = await db
      .from("study_plans")
      .select("id, track_id, title, description, target_date, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      id: r.id,
      trackId: r.track_id ?? null,
      title: r.title,
      description: r.description ?? null,
      targetDate: r.target_date ?? null,
      status: r.status as PlanStatus,
      createdAt: r.created_at,
    }));
  });

export const createStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { trackId?: string; title: string; description?: string; targetDate?: string }) =>
      input,
  )
  .handler(async ({ data, context }): Promise<StudyPlan> => {
    const db = context.supabase;
    const insert = {
      user_id: context.userId,
      title: data.title,
      status: "ativo",
      ...(data.trackId ? { track_id: data.trackId } : {}),
      ...(data.description ? { description: data.description } : {}),
      ...(data.targetDate ? { target_date: data.targetDate } : {}),
    };
    const { data: row, error } = await db.from("study_plans").insert(insert).select().single();
    if (error) throw new Error(error.message);
    return {
      id: row.id,
      trackId: row.track_id ?? null,
      title: row.title,
      description: row.description ?? null,
      targetDate: row.target_date ?? null,
      status: row.status as PlanStatus,
      createdAt: row.created_at,
    };
  });

export const updatePlanStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string; status: PlanStatus }) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const { error } = await db
      .from("study_plans")
      .update({ status: data.status })
      .eq("id", data.planId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
  });

// ─── Items ────────────────────────────────────────────────────────────────────

function mapItem(r: Record<string, unknown>): StudyItem {
  return {
    id: r["id"] as string,
    planId: r["plan_id"] as string,
    skillId: (r["skill_id"] as string | null) ?? null,
    title: r["title"] as string,
    type: r["type"] as ItemType,
    resourceUrl: (r["resource_url"] as string | null) ?? null,
    status: r["status"] as ItemStatus,
    priority: (r["priority"] as number) ?? 0,
    estimatedHours: (r["estimated_hours"] as number | null) ?? null,
    spentHours: (r["spent_hours"] as number) ?? 0,
    progressPercent: (r["progress_percent"] as number) ?? 0,
    startDate: (r["start_date"] as string | null) ?? null,
    dueDate: (r["due_date"] as string | null) ?? null,
    completedAt: (r["completed_at"] as string | null) ?? null,
    notes: (r["notes"] as string | null) ?? null,
    sourceGapItemId: (r["source_gap_item_id"] as string | null) ?? null,
    createdAt: r["created_at"] as string,
  };
}

export const getStudyItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { planId: string }) => input)
  .handler(async ({ data, context }): Promise<StudyItem[]> => {
    const db = context.supabase;
    const { data: rows, error } = await db
      .from("study_items")
      .select("*")
      .eq("plan_id", data.planId)
      .eq("user_id", context.userId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []).map(mapItem);
  });

interface CreateItemInput {
  planId: string;
  title: string;
  type?: ItemType;
  skillId?: string;
  resourceUrl?: string;
  estimatedHours?: number;
  dueDate?: string;
  priority?: number;
  sourceGapItemId?: string;
}

export const createStudyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateItemInput) => input)
  .handler(async ({ data, context }): Promise<StudyItem> => {
    const db = context.supabase;
    const insert = {
      plan_id: data.planId,
      user_id: context.userId,
      title: data.title,
      type: data.type ?? "outro",
      status: "backlog",
      ...(data.skillId ? { skill_id: data.skillId } : {}),
      ...(data.resourceUrl ? { resource_url: data.resourceUrl } : {}),
      ...(data.estimatedHours !== undefined ? { estimated_hours: data.estimatedHours } : {}),
      ...(data.dueDate ? { due_date: data.dueDate } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...(data.sourceGapItemId ? { source_gap_item_id: data.sourceGapItemId } : {}),
    };
    const { data: row, error } = await db.from("study_items").insert(insert).select().single();
    if (error) throw new Error(error.message);
    return mapItem(row as Record<string, unknown>);
  });

interface UpdateItemInput {
  itemId: string;
  status?: ItemStatus;
  progressPercent?: number;
  spentHours?: number;
  notes?: string;
  priority?: number;
  completedAt?: string | null;
}

export const updateStudyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateItemInput) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const patch = {
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.progressPercent !== undefined ? { progress_percent: data.progressPercent } : {}),
      ...(data.spentHours !== undefined ? { spent_hours: data.spentHours } : {}),
      ...(data.notes !== undefined ? { notes: data.notes } : {}),
      ...(data.priority !== undefined ? { priority: data.priority } : {}),
      ...("completedAt" in data ? { completed_at: data.completedAt ?? null } : {}),
    };
    if (Object.keys(patch).length === 0) return;
    const { error } = await db
      .from("study_items")
      .update(patch)
      .eq("id", data.itemId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
  });

export const deleteStudyItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { itemId: string }) => input)
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const { error } = await db
      .from("study_items")
      .delete()
      .eq("id", data.itemId)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
  });

// ─── Logs ─────────────────────────────────────────────────────────────────────

export const addStudyLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { itemId: string; hours: number; note?: string; loggedAt?: string }) => input,
  )
  .handler(async ({ data, context }): Promise<void> => {
    const db = context.supabase;
    const insert = {
      item_id: data.itemId,
      user_id: context.userId,
      hours: data.hours,
      ...(data.note ? { note: data.note } : {}),
      ...(data.loggedAt ? { logged_at: data.loggedAt } : {}),
    };
    const { error } = await db.from("study_logs").insert(insert);
    if (error) throw new Error(error.message);
  });

export const getStudyHeatmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<StudyLogHeatmapRow[]> => {
    const db = context.supabase;
    const since = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data, error } = await db
      .from("study_logs")
      .select("logged_at, hours")
      .eq("user_id", context.userId)
      .gte("logged_at", since)
      .order("logged_at", { ascending: true });
    if (error) throw new Error(error.message);
    const map = new Map<string, number>();
    for (const r of data ?? []) {
      const d = r.logged_at as string;
      map.set(d, (map.get(d) ?? 0) + (r.hours as number));
    }
    return Array.from(map.entries()).map(([date, hours]) => ({ date, hours }));
  });

// ─── Generate plan from gap ───────────────────────────────────────────────────

interface GeneratePlanInput {
  trackId: string;
  seniority: string;
  marketSegment: string;
  periodDays: number;
}

export const generatePlanFromGap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: GeneratePlanInput) => input)
  .handler(async ({ data, context }): Promise<StudyPlan> => {
    const { supabase, userId } = context;
    const db = supabase;

    const { data: latestGap } = await supabase
      .from("gap_analyses")
      .select("id")
      .eq("user_id", userId)
      .eq("market_segment", data.marketSegment)
      .eq("seniority", data.seniority)
      .order("computed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!latestGap) throw new Error("Nenhuma análise de gap encontrada.");

    const { data: gapItems, error: gapError } = await supabase
      .from("gap_analysis_items")
      .select("id, skill_id, gap_score, status, skills!inner(canonical_name)")
      .eq("gap_analysis_id", latestGap.id)
      .in("status", ["faltante", "parcial"])
      .order("gap_score", { ascending: false })
      .limit(10);
    if (gapError) throw new Error(gapError.message);

    const { data: plan, error: planError } = await db
      .from("study_plans")
      .insert({
        user_id: userId,
        track_id: data.trackId,
        title: "Plano gerado pelas minhas lacunas",
        status: "ativo",
      })
      .select()
      .single();
    if (planError) throw new Error(planError.message);

    if ((gapItems ?? []).length > 0) {
      const items = (gapItems ?? []).map((g, i) => {
        const skillRow = g.skills as { canonical_name: string } | null;
        return {
          plan_id: plan.id,
          user_id: userId,
          skill_id: g.skill_id ?? null,
          title: `Aprender: ${skillRow?.canonical_name ?? "skill"}`,
          type: "outro",
          status: "backlog",
          priority: i,
          source_gap_item_id: g.id,
          estimated_hours: 20,
        };
      });
      await db.from("study_items").insert(items);
    }

    return {
      id: plan.id,
      trackId: plan.track_id ?? null,
      title: plan.title,
      description: plan.description ?? null,
      targetDate: plan.target_date ?? null,
      status: plan.status as PlanStatus,
      createdAt: plan.created_at,
    };
  });

// ─── Adicionar skill ao plano (atalho de 1 clique) ────────────────────────────

interface AddSkillToPlanInput {
  trackId: string;
  skillId: string;
  skillName: string;
}

/**
 * Usado pelos botões "Adicionar ao plano de estudos" do dashboard e de
 * ferramentas — não abrem diálogo escolhendo o plano, então esta função acha
 * o plano ativo da trilha ou cria um. O item entra em `study_items`, a mesma
 * tabela que a aba Progresso lê; sem isso o clique não aparecia em lugar
 * nenhum que o usuário revisitasse.
 */
export const addSkillToStudyPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AddSkillToPlanInput) => input)
  .handler(async ({ data, context }): Promise<{ added: boolean; planId: string }> => {
    const db = context.supabase;
    const userId = context.userId;

    const { data: existingPlan, error: planQueryError } = await db
      .from("study_plans")
      .select("id")
      .eq("user_id", userId)
      .eq("track_id", data.trackId)
      .eq("status", "ativo")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (planQueryError) throw new Error(planQueryError.message);

    let planId = existingPlan?.id as string | undefined;
    if (!planId) {
      const { data: createdPlan, error: createPlanError } = await db
        .from("study_plans")
        .insert({
          user_id: userId,
          track_id: data.trackId,
          title: "Meu plano de estudos",
          status: "ativo",
        })
        .select("id")
        .single();
      if (createPlanError) throw new Error(createPlanError.message);
      planId = createdPlan.id;
    }

    const { data: existingItem, error: itemQueryError } = await db
      .from("study_items")
      .select("id")
      .eq("plan_id", planId)
      .eq("skill_id", data.skillId)
      .maybeSingle();
    if (itemQueryError) throw new Error(itemQueryError.message);
    if (existingItem) return { added: false, planId };

    const { error: insertError } = await db.from("study_items").insert({
      plan_id: planId,
      user_id: userId,
      skill_id: data.skillId,
      title: `Aprender: ${data.skillName}`,
      type: "outro",
      status: "backlog",
    });
    if (insertError) throw new Error(insertError.message);

    return { added: true, planId };
  });
