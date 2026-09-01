import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Toda função aqui exige profiles.is_admin = true (checado sob RLS do próprio usuário). */
async function assertAdmin(supabase: { from: (t: string) => any }, userId: string) {
  const { data } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
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
  .inputValidator((data: unknown) =>
    z.object({ source_keys: z.array(z.string()).optional() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { runIngest } = await import("@/lib/ingest/run.server");
    return runIngest(data.source_keys);
  });

export const toggleSource = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("job_sources")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
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
    z
      .object({
        content: z.string().min(1).max(4_000_000),
        source_key: z.string().default("csv_manual"),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { parseCsv } = await import("@/lib/ingest/adapters/csv-manual");
    const { ingestJobs, startRun, finishRun } = await import("@/lib/ingest/pipeline.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const rows = parseCsv(data.content, data.source_key);
    const valid = rows.filter((r) => r.job).map((r) => r.job!);
    const invalid = rows.length - valid.length;
    if (valid.length === 0)
      return {
        received: rows.length,
        created: 0,
        updated: 0,
        rejected: rows.length,
        errors: ["Nenhuma linha válida."],
      };
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
      .select(
        "id, term, lang, occurrences, distinct_jobs, example_snippet, suggested_skill_id, first_seen, last_seen",
      )
      .eq("status", "novo")
      .gte("distinct_jobs", MIN_DISTINCT_JOBS)
      .order("distinct_jobs", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const ids = Array.from(
      new Set((data ?? []).map((t) => t.suggested_skill_id).filter(Boolean) as string[]),
    );
    const names = new Map<string, string>();
    if (ids.length > 0) {
      const { data: skills } = await supabaseAdmin
        .from("skills")
        .select("id, canonical_name")
        .in("id", ids);
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
      const { error } = await supabaseAdmin.from("skill_aliases").insert({
        skill_id: skillId,
        alias: term.term,
        lang: term.lang ?? "pt",
        source: "curadoria",
      });
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
      .update({
        status: "rejeitado",
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
      })
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

    const [{ data: tracks }, { data: variants }, { data: baselines }, { data: jobs }] =
      await Promise.all([
        supabaseAdmin.from("career_tracks").select("id, key, name, is_active").order("name"),
        supabaseAdmin.from("track_role_variants").select("track_id, name"),
        supabaseAdmin.from("track_skill_baselines").select("track_id"),
        supabaseAdmin.from("job_postings").select("track_id, market_segment").eq("is_active", true),
      ]);

    const variantMap = new Map<string, string[]>();
    for (const v of variants ?? []) {
      const arr = variantMap.get(v.track_id) ?? [];
      arr.push(v.name);
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
      else if (j.market_segment === "remoto_global")
        jobsGlobal.set(j.track_id, (jobsGlobal.get(j.track_id) ?? 0) + 1);
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
  .inputValidator((data: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("career_tracks")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertTrack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        key: z
          .string()
          .min(2)
          .max(40)
          .regex(/^[a-z_]+$/),
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

    // A tabela exige key (NOT NULL, UNIQUE por track) e name (NOT NULL). A UI só
    // manda o nome de exibição, então a key é derivada dele; sufixo numérico
    // resolve nomes que colidem depois de normalizados.
    const usedKeys = new Set<string>();
    const rows = data.role_variants.map((name, sort_order) => {
      const base =
        name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "")
          .slice(0, 40) || `variante_${sort_order + 1}`;
      let key = base;
      let n = 2;
      while (usedKeys.has(key)) key = `${base}_${n++}`.slice(0, 40);
      usedKeys.add(key);
      // search_terms vazio deixa a variante inerte no matching de vagas; o nome
      // em minúsculas é o mínimo útil.
      return { track_id: trackId, key, name, search_terms: [name.toLowerCase()], sort_order };
    });
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
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_anonymous", false),
      supabaseAdmin
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since7d),
      supabaseAdmin.from("job_postings").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("job_postings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true),
      supabaseAdmin
        .from("job_postings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("market_segment", "br"),
      supabaseAdmin
        .from("job_postings")
        .select("*", { count: "exact", head: true })
        .eq("is_active", true)
        .eq("market_segment", "remoto_global"),
      supabaseAdmin.from("gap_analyses").select("*", { count: "exact", head: true }),
      supabaseAdmin
        .from("gap_analyses")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since7d),
      supabaseAdmin
        .from("pending_skill_terms")
        .select("*", { count: "exact", head: true })
        .eq("status", "novo"),
      supabaseAdmin
        .from("app_settings")
        .select("key, value")
        .in("key", ["mv_salary_refreshed_at", "mv_tool_refreshed_at", "cron_last_run"]),
    ]);

    const settingsMap = new Map((appSettings ?? []).map((r) => [r.key, r.value as string]));

    const { count: studyPlansCount } = await supabaseAdmin
      .from("study_plans")
      .select("*", { count: "exact", head: true });
    const studyPlansTotal = studyPlansCount ?? 0;

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

// ─── Gestão de usuários ───────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string | null;
  fullName: string | null;
  isAdmin: boolean;
  isAnonymous: boolean;
  /** Conta desativada via ban do GoTrue. */
  isBanned: boolean;
  emailConfirmed: boolean;
  trackName: string | null;
  seniority: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  studyPlans: number;
  certifications: number;
  gapAnalyses: number;
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminUser[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // auth.users só é acessível pela admin API; profiles vem por query normal.
    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authErr) throw new Error(authErr.message);

    const [{ data: profiles }, { data: tracks }, { data: plans }, { data: certs }, { data: gaps }] =
      await Promise.all([
        supabaseAdmin
          .from("profiles")
          .select("id, full_name, is_admin, is_anonymous, current_track_id, seniority"),
        supabaseAdmin.from("career_tracks").select("id, name"),
        supabaseAdmin.from("study_plans").select("user_id"),
        supabaseAdmin.from("user_certifications").select("user_id"),
        supabaseAdmin.from("gap_analyses").select("user_id"),
      ]);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const trackMap = new Map((tracks ?? []).map((t) => [t.id, t.name]));
    const count = (rows: Array<{ user_id: string }> | null) => {
      const m = new Map<string, number>();
      for (const r of rows ?? []) m.set(r.user_id, (m.get(r.user_id) ?? 0) + 1);
      return m;
    };
    const planCount = count(plans);
    const certCount = count(certs);
    const gapCount = count(gaps);

    return authList.users.map((u) => {
      const p = profileMap.get(u.id);
      const bannedUntil = (u as { banned_until?: string | null }).banned_until ?? null;
      return {
        id: u.id,
        email: u.email ?? null,
        fullName: p?.full_name ?? null,
        isAdmin: p?.is_admin ?? false,
        isAnonymous: Boolean(u.is_anonymous),
        isBanned: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
        emailConfirmed: Boolean(u.email_confirmed_at),
        trackName: p?.current_track_id ? (trackMap.get(p.current_track_id) ?? null) : null,
        seniority: p?.seniority ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        studyPlans: planCount.get(u.id) ?? 0,
        certifications: certCount.get(u.id) ?? 0,
        gapAnalyses: gapCount.get(u.id) ?? 0,
      };
    });
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), isAdmin: z.boolean() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Trava anti-lockout: ninguém remove o próprio admin. Outro admin faz isso.
    if (data.userId === context.userId && !data.isAdmin) {
      throw new Error(
        "Você não pode remover o próprio acesso de admin. Peça a outro administrador.",
      );
    }

    // Conta anônima não vira admin — não há como recuperar o acesso depois.
    if (data.isAdmin) {
      const { data: alvo } = await supabaseAdmin
        .from("profiles")
        .select("is_anonymous")
        .eq("id", data.userId)
        .maybeSingle();
      if (alvo?.is_anonymous) {
        throw new Error(
          "Conta anônima não pode ser administrador. Peça para criar conta primeiro.",
        );
      }
    }

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_admin: data.isAdmin })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ userId: z.string().uuid(), active: z.boolean() }).parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.userId === context.userId && !data.active) {
      throw new Error("Você não pode desativar a própria conta.");
    }

    // GoTrue não tem flag "ativo": desativar = ban longo, ativar = ban zerado.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Moderação de salários ────────────────────────────────────────────────────

export interface AdminSalaryRow {
  id: string;
  status: string;
  source: string;
  trackId: string | null;
  trackName: string | null;
  seniority: string | null;
  marketSegment: string;
  currency: string;
  amountMin: number | null;
  amountMax: number | null;
  period: string;
  observedAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** De onde veio: título/empresa da vaga, ou e-mail de quem contribuiu. */
  origem: string | null;
  /** Equivalente mensal — permite comparar hora, mês e ano na mesma régua. */
  mensalEquivalente: number | null;
  /** Mediana das APROVADAS do mesmo balde (trilha+senioridade+segmento+moeda). */
  medianaDoBalde: number | null;
  /** Quantas aprovadas existem no balde. Abaixo de 3 não dá para julgar. */
  amostraDoBalde: number;
  /** Razão para a mediana: 3 = três vezes acima; 0,33 = um terço dela. */
  desvio: number | null;
}

/** Converte para mensal para comparar períodos diferentes. */
function paraMensal(min: number | null, max: number | null, period: string): number | null {
  const base = min !== null && max !== null ? (min + max) / 2 : (min ?? max);
  if (base === null) return null;
  if (period === "year") return base / 12;
  if (period === "hour") return base * 160;
  return base;
}

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const s = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(s.length / 2);
  return s.length % 2 === 0
    ? ((s[meio - 1] as number) + (s[meio] as number)) / 2
    : (s[meio] as number);
}

const baldeDe = (r: {
  track_id: string | null;
  seniority: string | null;
  market_segment: string;
  currency: string;
}) => `${r.track_id ?? "-"}|${r.seniority ?? "-"}|${r.market_segment}|${r.currency}`;

export const listSalaryObservations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["todos", "pendente", "aprovada", "rejeitada"]).default("pendente"),
        source: z.enum(["todos", "user", "posting"]).default("todos"),
        marketSegment: z.enum(["todos", "br", "remoto_global"]).default("todos"),
        onlyOutliers: z.boolean().default(false),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(data),
  )
  .handler(async ({ context, data }): Promise<AdminSalaryRow[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("salary_observations")
      .select(
        "id, status, source, track_id, seniority, market_segment, currency, amount_min, amount_max, period, observed_at, reviewed_at, review_note, user_id, job_postings(title, company_name_raw)",
      )
      .order("observed_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "todos") q = q.eq("status", data.status);
    if (data.source !== "todos") q = q.eq("source", data.source);
    if (data.marketSegment !== "todos") q = q.eq("market_segment", data.marketSegment);

    // A régua de comparação é só o que já está aprovado — pendente não pode
    // servir de referência para julgar outro pendente.
    const [{ data: rows, error }, { data: tracks }, { data: aprovadas }] = await Promise.all([
      q,
      supabaseAdmin.from("career_tracks").select("id, name"),
      supabaseAdmin
        .from("salary_observations")
        .select("track_id, seniority, market_segment, currency, amount_min, amount_max, period")
        .eq("status", "aprovada"),
    ]);
    if (error) throw new Error(error.message);

    const trackMap = new Map((tracks ?? []).map((t) => [t.id, t.name]));

    const baldes = new Map<string, number[]>();
    for (const a of aprovadas ?? []) {
      const m = paraMensal(a.amount_min, a.amount_max, a.period);
      if (m === null) continue;
      const k = baldeDe(a);
      baldes.set(k, [...(baldes.get(k) ?? []), m]);
    }
    const medianas = new Map<string, number>();
    for (const [k, vals] of baldes) {
      const med = mediana(vals);
      if (med !== null) medianas.set(k, med);
    }

    // E-mail de quem contribuiu, para dar rastro às linhas source='user'.
    const userIds = Array.from(
      new Set((rows ?? []).map((r) => r.user_id).filter(Boolean) as string[]),
    );
    const emails = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: lista } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      for (const u of lista?.users ?? []) if (u.email) emails.set(u.id, u.email);
    }

    const saida: AdminSalaryRow[] = (rows ?? []).map((r) => {
      const vaga = r.job_postings as { title: string; company_name_raw: string | null } | null;
      const m = paraMensal(r.amount_min, r.amount_max, r.period);
      const k = baldeDe(r);
      const med = medianas.get(k) ?? null;
      return {
        id: r.id,
        status: r.status,
        source: r.source,
        trackId: r.track_id,
        trackName: r.track_id ? (trackMap.get(r.track_id) ?? null) : null,
        seniority: r.seniority,
        marketSegment: r.market_segment,
        currency: r.currency,
        amountMin: r.amount_min,
        amountMax: r.amount_max,
        period: r.period,
        observedAt: r.observed_at,
        reviewedAt: r.reviewed_at,
        reviewNote: r.review_note,
        origem: vaga
          ? `${vaga.title}${vaga.company_name_raw ? " — " + vaga.company_name_raw : ""}`
          : r.user_id
            ? (emails.get(r.user_id) ?? "contribuição de usuário")
            : null,
        mensalEquivalente: m,
        medianaDoBalde: med,
        amostraDoBalde: baldes.get(k)?.length ?? 0,
        desvio: m !== null && med !== null && med > 0 ? Number((m / med).toFixed(2)) : null,
      };
    });

    if (!data.onlyOutliers) return saida;
    return saida.filter(
      (r) => r.desvio !== null && r.amostraDoBalde >= 3 && (r.desvio > 2.5 || r.desvio < 0.4),
    );
  });

/**
 * Entrada manual do admin — hoje a única fonte que alimenta a estatística.
 *
 * A ingestão de vagas parou de gravar salário (o track_id vinha nulo na maioria
 * e mv_salary_stats descarta nulo, ver 20260828120000_salarios_manuais.sql), e
 * contribuição de usuário nasce 'pendente'. O que o admin digita aqui nasce
 * 'aprovada': ele é a curadoria, não faz sentido pedir que se auto-modere.
 *
 * trackId e seniority são OBRIGATÓRIOS aqui, ao contrário da coluna, que aceita
 * nulo. Sem trilha a linha não entra na view, e sem senioridade ela cai no balde
 * 'nao_informado', que a tela não sabe rotular — nos dois casos o admin digitaria
 * um dado que some sem aviso.
 */
export const createSalaryObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        trackId: z.string().uuid(),
        seniority: z.enum(["junior", "pleno", "senior", "staff"]),
        marketSegment: z.enum(["br", "remoto_global"]),
        currency: z.enum(["BRL", "USD", "EUR"]),
        period: z.enum(["hour", "month", "year"]),
        amountMin: z.number().nonnegative().nullable(),
        amountMax: z.number().nonnegative().nullable(),
        note: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.amountMin === null && data.amountMax === null) {
      throw new Error("Informe ao menos um valor: mínimo ou máximo.");
    }
    if (data.amountMin !== null && data.amountMax !== null && data.amountMin > data.amountMax) {
      throw new Error("O valor mínimo não pode ser maior que o máximo.");
    }
    // Zero passa no nonnegative() do zod e viraria uma faixa 0–0 no meio dos
    // percentis. Já aconteceu: havia uma linha com p50 = 0,00 em produção.
    if (data.amountMin === 0 && (data.amountMax === null || data.amountMax === 0)) {
      throw new Error("O valor não pode ser zero.");
    }

    const { error } = await supabaseAdmin.from("salary_observations").insert({
      track_id: data.trackId,
      seniority: data.seniority,
      market_segment: data.marketSegment,
      country: data.marketSegment === "br" ? "BR" : null,
      currency: data.currency,
      period: data.period,
      amount_min: data.amountMin,
      amount_max: data.amountMax,
      source: "admin",
      status: "aprovada",
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.userId,
      ...(data.note ? { review_note: data.note } : {}),
    });
    if (error) throw new Error(error.message);

    // A tela lê a materialized view, não a tabela: sem refresh o admin salva e
    // não vê nada mudar, que é exatamente o sintoma que trouxe a gente até aqui.
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_market_views");
    if (refreshError) throw new Error(`Salvo, mas a estatística não recalculou: ${refreshError.message}`);

    return { ok: true };
  });

export const reviewSalaryObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["aprovada", "rejeitada", "pendente"]),
        note: z.string().max(500).optional(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("salary_observations")
      .update({
        status: data.status,
        reviewed_at: new Date().toISOString(),
        reviewed_by: context.userId,
        ...(data.note ? { review_note: data.note } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // mv_salary_stats só enxerga status='aprovada'. Sem o refresh aqui, aprovar
    // (ou reverter) uma contribuição em /admin/salarios não aparece em /salarios
    // até alguém clicar "Recalcular estatísticas" — mesmo sintoma que
    // createSalaryObservation já teve e corrigiu; faltava replicar aqui.
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_market_views");
    if (refreshError) {
      throw new Error(`Salvo, mas a estatística não recalculou: ${refreshError.message}`);
    }
    return { ok: true };
  });

/** Corrige os valores. Não aprova sozinho — aprovar é uma ação à parte. */
export const updateSalaryObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        amountMin: z.number().nonnegative().nullable(),
        amountMax: z.number().nonnegative().nullable(),
        currency: z.enum(["BRL", "USD", "EUR"]),
        period: z.enum(["hour", "month", "year"]),
        seniority: z.enum(["junior", "pleno", "senior", "staff"]).nullable(),
        marketSegment: z.enum(["br", "remoto_global"]),
        trackId: z.string().uuid().nullable(),
      })
      .parse(data),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.amountMin === null && data.amountMax === null) {
      throw new Error("Informe ao menos um valor: mínimo ou máximo.");
    }
    if (data.amountMin !== null && data.amountMax !== null && data.amountMin > data.amountMax) {
      throw new Error("O valor mínimo não pode ser maior que o máximo.");
    }

    const { error } = await supabaseAdmin
      .from("salary_observations")
      .update({
        amount_min: data.amountMin,
        amount_max: data.amountMax,
        currency: data.currency,
        period: data.period,
        seniority: data.seniority,
        market_segment: data.marketSegment,
        track_id: data.trackId,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    // A linha corrigida pode já estar 'aprovada' (é o caso mais comum de uso
    // desta função) — sem o refresh, o valor errado continua na mediana até
    // alguém clicar "Recalcular estatísticas" manualmente.
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_market_views");
    if (refreshError) {
      throw new Error(`Salvo, mas a estatística não recalculou: ${refreshError.message}`);
    }
    return { ok: true };
  });

export const deleteSalaryObservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("salary_observations").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    // Mesma razão das duas funções acima: excluir uma observação aprovada não
    // tira o valor da mediana em /salarios sem este refresh.
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_market_views");
    if (refreshError) {
      throw new Error(`Excluído, mas a estatística não recalculou: ${refreshError.message}`);
    }
    return { ok: true };
  });

/**
 * Recalcula mv_salary_stats à mão. As quatro funções acima (create/review/
 * update/delete de salary_observations) já chamam refresh_market_views
 * sozinhas — este botão é rede de segurança para o caso de alguém editar a
 * tabela direto no banco, não o único jeito de a view ficar em dia.
 */
export const refreshSalaryStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("refresh_market_views");
    if (error) throw new Error(error.message);
    return { ok: true };
  });
