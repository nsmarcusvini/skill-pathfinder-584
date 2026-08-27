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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyDb = any;

// ─── Plans ───────────────────────────────────────────────────────────────────

export const getStudyPlans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<StudyPlan[]> => {
    const db = context.supabase as AnyDb;
    const { data, error } = await db
      .from("study_plans")
      .select("id, track_id, title, description, target_date, status, created_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: AnyDb) => ({
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
    const db = context.supabase as AnyDb;
    const insert: Record<string, unknown> = {
      user_id: context.userId,
      title: data.title,
      status: "ativo",
    };
    if (data.trackId) insert["track_id"] = data.trackId;
    if (data.description) insert["description"] = data.description;
    if (data.targetDate) insert["target_date"] = data.targetDate;
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
    const db = context.supabase as AnyDb;
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
    const db = context.supabase as AnyDb;
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
    const db = context.supabase as AnyDb;
    const insert: Record<string, unknown> = {
      plan_id: data.planId,
      user_id: context.userId,
      title: data.title,
      type: data.type ?? "outro",
      status: "backlog",
    };
    if (data.skillId) insert["skill_id"] = data.skillId;
    if (data.resourceUrl) insert["resource_url"] = data.resourceUrl;
    if (data.estimatedHours !== undefined) insert["estimated_hours"] = data.estimatedHours;
    if (data.dueDate) insert["due_date"] = data.dueDate;
    if (data.priority !== undefined) insert["priority"] = data.priority;
    if (data.sourceGapItemId) insert["source_gap_item_id"] = data.sourceGapItemId;
    const { data: row, error } = await db
      .from("study_items")
      .insert(insert)
      .select()
      .single();
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
    const db = context.supabase as AnyDb;
    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) patch["status"] = data.status;
    if (data.progressPercent !== undefined) patch["progress_percent"] = data.progressPercent;
    if (data.spentHours !== undefined) patch["spent_hours"] = data.spentHours;
    if (data.notes !== undefined) patch["notes"] = data.notes;
    if (data.priority !== undefined) patch["priority"] = data.priority;
    if ("completedAt" in data) patch["completed_at"] = data.completedAt ?? null;
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
    const db = context.supabase as AnyDb;
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
    const db = context.supabase as AnyDb;
    const insert: Record<string, unknown> = {
      item_id: data.itemId,
      user_id: context.userId,
      hours: data.hours,
    };
    if (data.note) insert["note"] = data.note;
    if (data.loggedAt) insert["logged_at"] = data.loggedAt;
    const { error } = await db.from("study_logs").insert(insert);
    if (error) throw new Error(error.message);
  });

export const getStudyHeatmap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<StudyLogHeatmapRow[]> => {
    const db = context.supabase as AnyDb;
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
    const db = supabase as AnyDb;

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
      const items = (gapItems ?? []).map((g: AnyDb, i: number) => {
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
