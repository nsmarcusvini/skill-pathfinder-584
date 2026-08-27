import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Toda função aqui exige profiles.is_admin = true (checado sob RLS do próprio usuário). */
async function assertAdmin(supabase: { from: (t: string) => any }, userId: string) {
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", userId).maybeSingle();
  if (!data?.is_admin) throw new Error("Acesso restrito a administradores.");
}

export interface AdminSource {
  id: string;
  key: string;
  name: string;
  adapter: string;
  source_type: string;
  is_active: boolean;
  has_token: boolean;
  config: Json;
  last_run_at: string | null;
  last_run_status: string | null;
  last_run_count: number;
  error_message: string | null;
  jobs_total: number;
  jobs_active: number;
}

export const listSources = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSource[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: sources }, { data: postings }] = await Promise.all([
      supabaseAdmin.from("job_sources").select("*").order("key"),
      supabaseAdmin.from("job_postings").select("source_id, is_active"),
    ]);

    const counts = new Map<string, { total: number; active: number }>();
    for (const p of postings ?? []) {
      const entry = counts.get(p.source_id) ?? { total: 0, active: 0 };
      entry.total += 1;
      if (p.is_active) entry.active += 1;
      counts.set(p.source_id, entry);
    }

    return (sources ?? []).map((s) => ({
      id: s.id,
      key: s.key,
      name: s.name,
      adapter: s.adapter,
      source_type: s.source_type ?? "pull",
      is_active: s.is_active,
      has_token: Boolean(s.ingest_token_hash),
      config: (s.config ?? {}) as Json,
      last_run_at: s.last_run_at,
      last_run_status: s.last_run_status,
      last_run_count: s.last_run_count ?? 0,
      error_message: s.error_message,
      jobs_total: counts.get(s.id)?.total ?? 0,
      jobs_active: counts.get(s.id)?.active ?? 0,
    }));
  });

export const runIngestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ source_keys: z.array(z.string()).optional() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runIngest } = await import("@/lib/ingest/run.server");
    return runIngest(data.source_keys);
  });

export const toggleSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("job_sources").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Cria (ou renova) uma fonte push e devolve o token em texto UMA única vez. */
export const issuePushToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ key: z.string().min(2).max(60), name: z.string().min(2).max(120) }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { createHash, randomBytes } = await import("crypto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");

    const { error } = await supabaseAdmin.from("job_sources").upsert(
      {
        key: data.key,
        name: data.name,
        adapter: "push",
        source_type: "push",
        ingest_token_hash: hash,
        is_active: true,
        config: { pushed_by: "external" },
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { source_key: data.key, token };
  });

export const importCsvJobs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ content: z.string().min(1).max(4_000_000), source_key: z.string().default("csv_manual") }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { parseCsv } = await import("@/lib/ingest/adapters/csv-manual");
    const { ingestJobs, startRun, finishRun } = await import("@/lib/ingest/pipeline.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rows = parseCsv(data.content, data.source_key);
    const valid = rows.filter((r) => r.job).map((r) => r.job!);
    const invalid = rows.length - valid.length;
    if (valid.length === 0) return { received: rows.length, created: 0, updated: 0, rejected: rows.length, errors: ["Nenhuma linha válida."] };
    if (valid.length > 500) throw new Error("Limite de 500 vagas por importação.");

    const { data: source } = await supabaseAdmin
      .from("job_sources")
      .select("id")
      .eq("key", data.source_key)
      .maybeSingle();
    if (!source) throw new Error(`Fonte "${data.source_key}" não encontrada.`);

    const runId = await startRun(source.id);
    const counters = await ingestJobs(valid, { sourceId: source.id, defaultCountry: "BR" });
    counters.rejected += invalid;
    await finishRun(runId, source.id, counters, "success");
    return counters;
  });

/* ------------------------------------------------- curadoria de skills (JD) */

export const jdHealth = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { extractionHealth } = await import("@/lib/jd/extract.server");
    return extractionHealth();
  });

export const listPendingTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { MIN_DISTINCT_JOBS } = await import("@/lib/jd/extract.server");

    const { data, error } = await supabaseAdmin
      .from("pending_skill_terms")
      .select("id, term, lang, occurrences, distinct_jobs, example_snippet, suggested_skill_id, first_seen, last_seen")
      .eq("status", "novo")
      .gte("distinct_jobs", MIN_DISTINCT_JOBS)
      .order("distinct_jobs", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((data ?? []).map((t) => t.suggested_skill_id).filter(Boolean) as string[]));
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: skills } = await supabaseAdmin.from("skills").select("id, canonical_name").in("id", ids);
      for (const s of skills ?? []) names.set(s.id, s.canonical_name);
    }

    return (data ?? []).map((t) => ({
      ...t,
      suggested_skill_name: t.suggested_skill_id ? (names.get(t.suggested_skill_id) ?? null) : null,
    }));
  });

export const runJdExtraction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ force: z.boolean().optional(), since: z.string().optional() }).parse(data ?? {}),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { extractJdSkills } = await import("@/lib/jd/extract.server");
    return extractJdSkills({
      ...(data.force ? { force: true } : {}),
      ...(data.since ? { since: data.since } : {}),
    });
  });

/** Aprova o termo: vira alias de uma skill existente ou uma skill nova, e reprocessa as vagas afetadas. */
export const approvePendingTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        mode: z.enum(["alias", "new_skill"]),
        skill_id: z.string().uuid().optional(),
        category_id: z.string().uuid().optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: term } = await supabaseAdmin
      .from("pending_skill_terms")
      .select("id, term, lang")
      .eq("id", data.id)
      .maybeSingle();
    if (!term) throw new Error("Termo não encontrado.");

    let skillId = data.skill_id ?? null;

    if (data.mode === "new_skill") {
      const slug = term.term
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      const { data: created, error } = await supabaseAdmin
        .from("skills")
        .insert({
          canonical_name: term.term,
          slug,
          category_id: data.category_id ?? null,
          match_patterns: [],
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      skillId = created.id;
    } else {
      if (!skillId) throw new Error("Selecione a skill para receber o alias.");
      const { error } = await supabaseAdmin
        .from("skill_aliases")
        .insert({ skill_id: skillId, alias: term.term, lang: term.lang ?? "pt", source: "curadoria" });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    }

    await supabaseAdmin
      .from("pending_skill_terms")
      .update({
        status: "aprovado",
        suggested_skill_id: skillId,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
      .eq("id", data.id);

    // enfileira reprocessamento: vagas que citam o termo perdem skills_extracted_at
    const { data: affected } = await supabaseAdmin
      .from("job_postings")
      .select("id")
      .eq("is_active", true)
      .ilike("description_text", `%${term.term}%`)
      .limit(2000);
    const ids = (affected ?? []).map((j) => j.id);
    for (let i = 0; i < ids.length; i += 500) {
      await supabaseAdmin
        .from("job_postings")
        .update({ skills_extracted_at: null })
        .in("id", ids.slice(i, i + 500));
    }

    return { skill_id: skillId, requeued: ids.length };
  });

/** Rejeita: vai para a blocklist e não volta a aparecer na fila. */
export const rejectPendingTerm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), reason: z.string().max(200).optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: term } = await supabaseAdmin
      .from("pending_skill_terms")
      .select("id, term")
      .eq("id", data.id)
      .maybeSingle();
    if (!term) throw new Error("Termo não encontrado.");

    await supabaseAdmin
      .from("skill_term_blocklist")
      .insert({ term: term.term, reason: data.reason ?? null, created_by: context.userId });
    await supabaseAdmin
      .from("pending_skill_terms")
      .update({ status: "rejeitado", reviewed_at: new Date().toISOString(), reviewed_by: context.userId })
      .eq("id", data.id);

    return { ok: true };
  });

export const searchSkillsAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ q: z.string().min(1).max(60) }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: skills } = await supabaseAdmin
      .from("skills")
      .select("id, canonical_name")
      .ilike("canonical_name", `%${data.q}%`)
      .order("canonical_name")
      .limit(20);
    return skills ?? [];
  });

// ─── Trilhas (career_tracks) ─────────────────────────────────────────────────

export interface AdminTrack {
  id: string;
  key: string;
  name: string;
  is_active: boolean;
  role_variants: string[];
  skills_count: number;
  jobs_br: number;
  jobs_global: number;
}

export const listTracks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminTrack[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: tracks }, { data: variants }, { data: baselines }, { data: jobs }] = await Promise.all([
      supabaseAdmin.from("career_tracks").select("id, key, name, is_active").order("name"),
      supabaseAdmin.from("track_role_variants").select("track_id, role_title"),
      supabaseAdmin.from("track_skill_baselines").select("track_id").select("track_id"),
      supabaseAdmin.from("job_postings").select("track_id, market_segment").eq("is_active", true),
    ]);

    const variantMap = new Map<string, string[]>();
    for (const v of variants ?? []) {
      const arr = variantMap.get(v.track_id) ?? [];
      arr.push(v.role_title);
      variantMap.set(v.track_id, arr);
    }

    const skillsCount = new Map<string, number>();
    for (const b of baselines ?? []) {
      skillsCount.set(b.track_id, (skillsCount.get(b.track_id) ?? 0) + 1);
    }

    const jobsBr = new Map<string, number>();
    const jobsGlobal = new Map<string, number>();
    for (const j of jobs ?? []) {
      if (!j.track_id) continue;
      if (j.market_segment === "br") jobsBr.set(j.track_id, (jobsBr.get(j.track_id) ?? 0) + 1);
      else if (j.market_segment === "remoto_global") jobsGlobal.set(j.track_id, (jobsGlobal.get(j.track_id) ?? 0) + 1);
    }

    return (tracks ?? []).map((t) => ({
      id: t.id,
      key: t.key,
      name: t.name,
      is_active: t.is_active ?? true,
      role_variants: variantMap.get(t.id) ?? [],
      skills_count: skillsCount.get(t.id) ?? 0,
      jobs_br: jobsBr.get(t.id) ?? 0,
      jobs_global: jobsGlobal.get(t.id) ?? 0,
    }));
  });

export const toggleTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("career_tracks").update({ is_active: data.is_active }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        key: z.string().min(2).max(40).regex(/^[a-z_]+$/),
        name: z.string().min(2).max(120),
        role_variants: z.array(z.string().min(2).max(120)).min(1),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let trackId = data.id;
    if (trackId) {
      const { error } = await supabaseAdmin
        .from("career_tracks")
        .update({ key: data.key, name: data.name })
        .eq("id", trackId);
      if (error) throw new Error(error.message);
    } else {
      const { data: created, error } = await supabaseAdmin
        .from("career_tracks")
        .insert({ key: data.key, name: data.name, is_active: true })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      trackId = created.id;
    }

    // re-sync role_variants: delete old + insert new
    await supabaseAdmin.from("track_role_variants").delete().eq("track_id", trackId);
    const rows = data.role_variants.map((role_title, sort_order) => ({ track_id: trackId, role_title, sort_order }));
    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("track_role_variants").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { id: trackId };
  });

// ─── Health dashboard ─────────────────────────────────────────────────────────

export interface HealthStats {
  users_total: number;
  users_permanent: number;
  users_anonymous: number;
  users_last_7d: number;
  jobs_total: number;
  jobs_active: number;
  jobs_br: number;
  jobs_global: number;
  gap_analyses_total: number;
  gap_analyses_last_7d: number;
  mv_salary_refreshed_at: string | null;
  mv_tool_refreshed_at: string | null;
  cron_last_run: string | null;
  pending_terms: number;
  study_plans_total: number;
}

export const getHealthStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HealthStats> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [
      { count: usersTotal },
      { count: usersPermanent },
      { count: usersLast7d },
      { count: jobsTotal },
      { count: jobsActive },
      { count: jobsBr },
      { count: jobsGlobal },
      { count: gapTotal },
      { count: gapLast7d },
      { count: pendingTerms },
      { data: appSettings },
    ] = await Promise.all([
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).eq("is_anonymous", false),
      supabaseAdmin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", since7d),
      supabaseAdmin.from("job_postings").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("job_postings").select("*", { count: "exact", head: true }).eq("is_active", true),
      supabaseAdmin.from("job_postings").select("*", { count: "exact", head: true }).eq("is_active", true).eq("market_segment", "br"),
      supabaseAdmin.from("job_postings").select("*", { count: "exact", head: true }).eq("is_active", true).eq("market_segment", "remoto_global"),
      supabaseAdmin.from("gap_analyses").select("*", { count: "exact", head: true }),
      supabaseAdmin.from("gap_analyses").select("*", { count: "exact", head: true }).gte("created_at", since7d),
      supabaseAdmin.from("pending_skill_terms").select("*", { count: "exact", head: true }).eq("status", "novo"),
      supabaseAdmin.from("app_settings").select("key, value").in("key", ["mv_salary_refreshed_at", "mv_tool_refreshed_at", "cron_last_run"]),
    ]);

    const settingsMap = new Map((appSettings ?? []).map((r) => [r.key, r.value as string]));

    // study_plans is a new table — use raw query via rpc or count directly
    let studyPlansTotal = 0;
    try {
      const { count } = await (supabaseAdmin as any).from("study_plans").select("*", { count: "exact", head: true });
      studyPlansTotal = count ?? 0;
    } catch {
      studyPlansTotal = 0;
    }

    return {
      users_total: usersTotal ?? 0,
      users_permanent: usersPermanent ?? 0,
      users_anonymous: (usersTotal ?? 0) - (usersPermanent ?? 0),
      users_last_7d: usersLast7d ?? 0,
      jobs_total: jobsTotal ?? 0,
      jobs_active: jobsActive ?? 0,
      jobs_br: jobsBr ?? 0,
      jobs_global: jobsGlobal ?? 0,
      gap_analyses_total: gapTotal ?? 0,
      gap_analyses_last_7d: gapLast7d ?? 0,
      mv_salary_refreshed_at: settingsMap.get("mv_salary_refreshed_at") ?? null,
      mv_tool_refreshed_at: settingsMap.get("mv_tool_refreshed_at") ?? null,
      cron_last_run: settingsMap.get("cron_last_run") ?? null,
      pending_terms: pendingTerms ?? 0,
      study_plans_total: studyPlansTotal,
    };
  });
