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

export interface FullIngestReport {
  colheita: { snapshots: number; ingeridos: number; criadas: number; atualizadas: number };
  fontes: Array<{ key: string; status: string; created: number; updated: number; error?: string }>;
  desativadas: number;
  duplicatas: number;
  skills: number;
  disparos: Array<{ key: string; status: string; error?: string }>;
  aguardando: number;
  brightDataErro: string | null;
  viewsAtualizadas: boolean;
}

/**
 * Coleta completa num clique: as quatro fases, na ordem em que dependem uma da
 * outra. É o mesmo caminho dos crons — nada aqui reimplementa pipeline (regra 4).
 *
 * A ordem colher-antes-de-disparar é a mesma de `/api/public/ingest-async`, e
 * pelo mesmo motivo: o lote pedido no ciclo anterior entra agora e libera a
 * trava de "lote em andamento", senão todo disparo seria pulado.
 *
 * O que este botão NÃO faz, e a tela precisa dizer: as vagas da Bright Data
 * pedidas no passo 3 não chegam nesta resposta. A API deles é assíncrona (leva
 * minutos), e esperar em polling estouraria o timeout da função. Elas entram na
 * próxima colheita — outro clique aqui, ou o cron de domingo/segunda.
 */
export const runFullIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Record<string, never>) => input)
  .handler(async ({ context }): Promise<FullIngestReport> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { colherSnapshots, dispararColetas } = await import("@/lib/ingest/bright-data.server");
    const { runIngest } = await import("@/lib/ingest/run.server");

    // 1. Colher o que a Bright Data já deixou pronto de ciclos anteriores.
    // Provedor externo fora do ar não pode derrubar a coleta das fontes
    // gratuitas, que é de onde vem 81% da base — por isso as duas fases dele
    // ficam isoladas e o erro vira relato, não exceção.
    let brightDataErro: string | null = null;
    let colheita = { snapshots: 0, ingeridos: 0, criadas: 0, atualizadas: 0 };
    try {
      const lote = await colherSnapshots();
      colheita = {
        snapshots: lote.snapshots.length,
        ingeridos: lote.snapshots.filter((s) => s.status === "ingested").length,
        criadas: lote.snapshots.reduce((a, s) => a + (s.created ?? 0), 0),
        atualizadas: lote.snapshots.reduce((a, s) => a + (s.updated ?? 0), 0),
      };
    } catch (e) {
      brightDataErro = e instanceof Error ? e.message : String(e);
    }

    // 2. Fontes síncronas: já inclui dedupe, expiração e extração de skills.
    const pull = await runIngest();

    // 3. Pedir lote novo à Bright Data (chega depois, ver doc acima).
    let disparos: FullIngestReport["disparos"] = [];
    try {
      disparos = (await dispararColetas()).map((d) => ({
        key: d.source_key,
        status: d.status,
        ...(d.error ? { error: d.error } : {}),
      }));
    } catch (e) {
      brightDataErro = brightDataErro ?? (e instanceof Error ? e.message : String(e));
    }

    // 4. Sem isto o admin coleta e não vê nada mudar: as telas leem matview.
    const { error: refreshError } = await supabaseAdmin.rpc("refresh_market_views");

    const { count: aguardando } = await supabaseAdmin
      .from("provider_snapshots")
      .select("id", { count: "exact", head: true })
      .in("status", ["starting", "running", "ready"]);

    return {
      colheita,
      fontes: pull.sources.map((s) => ({
        key: s.source_key,
        status: s.status,
        created: s.created,
        updated: s.updated,
        ...(s.error ? { error: s.error } : {}),
      })),
      desativadas: pull.deactivated,
      duplicatas: pull.dedupe?.duplicatas ?? 0,
      skills: (pull.extraction ?? []).reduce((a, e) => a + e.skills_written, 0),
      disparos,
      aguardando: aguardando ?? 0,
      brightDataErro,
      viewsAtualizadas: !refreshError,
    };
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

// ─── Clientes e assinaturas ───────────────────────────────────────────────────

/**
 * Dia de calendário em Brasília, em `YYYY-MM-DD`, com deslocamento em dias.
 *
 * `usage_daily.day` é gravado por `record_usage` como
 * `(now() AT TIME ZONE 'America/Sao_Paulo')::date`. Montar a janela a partir do
 * UTC do servidor deslocaria o recorte em relação ao dado: entre 21h e
 * meia-noite de Brasília o UTC já virou o dia e a coluna não, e "hoje" viria
 * vazio. `en-CA` é o locale que o `Intl` formata em ISO — o caminho mais curto
 * para uma data de calendário em outro fuso sem arrastar biblioteca de datas.
 */
function diaEmBrasilia(deslocamentoDias = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + deslocamentoDias);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/**
 * Uso agregado de um cliente numa janela de dias.
 *
 * É o que responde "ele usa?" e "o que ele usa?" sem abrir o detalhe. Vem de
 * `usage_daily` (o agregado que sobrevive ao expurgo), nunca de `usage_events`
 * — o detalhe é efêmero e some com a retenção.
 */
export interface AdminUsageSummary {
  /** Tamanho da janela, para a tela não precisar assumir 30 ou 90. */
  janelaDias: number;
  /** Eventos na janela inteira. */
  total: number;
  /** Eventos nos últimos 7 dias da janela. Uso recente pesa mais que volume. */
  ultimos7: number;
  /** Dias distintos com ao menos um evento. Mede hábito, não pico. */
  diasAtivos: number;
  /** Último dia com uso (`YYYY-MM-DD`), ou `null` se não usou na janela. */
  ultimoDia: string | null;
  /** Contagem por tipo, do maior para o menor — o "o que ele usa". */
  porEvento: Array<{ event: string; count: number }>;
  /** Uma posição por dia, do mais antigo ao de hoje. Alimenta a sparkline. */
  serie: number[];
}

function usoVazio(janelaDias: number): AdminUsageSummary {
  return {
    janelaDias,
    total: 0,
    ultimos7: 0,
    diasAtivos: 0,
    ultimoDia: null,
    porEvento: [],
    serie: new Array<number>(janelaDias).fill(0),
  };
}

interface LinhaUsoDiario {
  user_id: string;
  day: string;
  event_type: string;
  count: number;
}

/**
 * Agrupa linhas de `usage_daily` por usuário numa passada só.
 *
 * Uma query para todo mundo e o agrupamento em memória, em vez de uma query por
 * cliente: a tela lista dezenas de assinaturas, e N+1 aqui viraria N+1 idas ao
 * banco a cada refresh do admin.
 */
function agruparUso(linhas: LinhaUsoDiario[], janelaDias: number): Map<string, AdminUsageSummary> {
  const indiceDoDia = new Map<string, number>();
  for (let i = 0; i < janelaDias; i++) {
    indiceDoDia.set(diaEmBrasilia(-(janelaDias - 1 - i)), i);
  }

  const acumulado = new Map<
    string,
    { serie: number[]; porEvento: Map<string, number>; ultimoDia: string | null }
  >();

  for (const linha of linhas) {
    let acc = acumulado.get(linha.user_id);
    if (!acc) {
      acc = { serie: new Array<number>(janelaDias).fill(0), porEvento: new Map(), ultimoDia: null };
      acumulado.set(linha.user_id, acc);
    }
    const i = indiceDoDia.get(linha.day);
    if (i !== undefined) acc.serie[i] = (acc.serie[i] ?? 0) + linha.count;
    acc.porEvento.set(linha.event_type, (acc.porEvento.get(linha.event_type) ?? 0) + linha.count);
    if (!acc.ultimoDia || linha.day > acc.ultimoDia) acc.ultimoDia = linha.day;
  }

  const corte7 = Math.max(0, janelaDias - 7);
  const saida = new Map<string, AdminUsageSummary>();
  for (const [userId, acc] of acumulado) {
    saida.set(userId, {
      janelaDias,
      serie: acc.serie,
      total: acc.serie.reduce((a, b) => a + b, 0),
      ultimos7: acc.serie.slice(corte7).reduce((a, b) => a + b, 0),
      diasAtivos: acc.serie.filter((n) => n > 0).length,
      ultimoDia: acc.ultimoDia,
      porEvento: [...acc.porEvento]
        .map(([event, count]) => ({ event, count }))
        .sort((a, b) => b.count - a.count),
    });
  }
  return saida;
}

/** Eventos de webhook que mexem em dinheiro. `CONFIRMED` e `RECEIVED` são a MESMA cobrança. */
const EVENTOS_DE_DINHEIRO = [
  "PAYMENT_CONFIRMED",
  "PAYMENT_RECEIVED",
  "PAYMENT_REFUNDED",
  "PAYMENT_CHARGEBACK_REQUESTED",
] as const;

/**
 * Campos de `billing_events` que interessam para somar dinheiro.
 *
 * Puxa os três escalares de dentro do JSON pelo operador `->>` do PostgREST em
 * vez de trazer `payload` inteiro: um payload do Asaas tem dezenas de campos e
 * alguns KB, e isto roda para todos os pagamentos de todos os clientes.
 */
// prettier-ignore
const SELECT_PAGAMENTO =
  "subscription_id, event_type, received_at, paymentId:payload->payment->>id, valorTexto:payload->payment->>value, receiptUrl:payload->payment->>transactionReceiptUrl, customerId:payload->payment->>customer";

interface LinhaPagamento {
  subscription_id: string | null;
  event_type: string;
  received_at: string;
  paymentId: string | null;
  valorTexto: string | null;
  receiptUrl: string | null;
  customerId: string | null;
}

export interface AdminPagamento {
  /** id da cobrança no Asaas (`pay_...`). É a chave de deduplicação. */
  paymentId: string;
  /** Quando o primeiro evento daquela cobrança chegou. */
  at: string;
  amountCents: number;
  /** Estornada ou com chargeback aberto: entrou e voltou. */
  estornado: boolean;
  /**
   * COMO o dinheiro voltou. Reembolso é decisão nossa — o cancelamento dentro
   * dos 7 dias do CDC art. 49 estorna sozinho. Chargeback é o cliente
   * contestando no banco, e vale como sinal de risco, não de atendimento.
   * `estornado` sozinho não separa os dois, e mostrar contestação como
   * reembolso esconderia justamente o caso que precisa de atenção.
   */
  estornoTipo: "reembolso" | "chargeback" | null;
  /**
   * Quando o dinheiro VOLTOU. Não dá para reaproveitar `at` para isso: `at` é
   * a data do evento mais antigo, ou seja, de quando a cobrança entrou. Uma
   * cobrança de janeiro estornada em março tem `at` em janeiro.
   */
  estornoAt: string | null;
  receiptUrl: string | null;
  /** `cus_...` do Asaas. É o único fio para achar o dono de cobrança órfã. */
  customerId: string | null;
}

/**
 * Reduz eventos de webhook a cobranças únicas.
 *
 * Deduplica por `payment.id` porque o Asaas manda `PAYMENT_CONFIRMED` (cartão
 * autorizado) e depois `PAYMENT_RECEIVED` (dinheiro liquidado) para a MESMA
 * cobrança — somar os dois dobraria o faturamento de todo cliente de cartão.
 * `value` vem em reais no payload; o resto do sistema conta em centavos.
 */
function deduplicarCobrancas(linhas: LinhaPagamento[]): AdminPagamento[] {
  const cobrancas = new Map<string, AdminPagamento>();

  for (const linha of linhas) {
    if (!linha.paymentId) continue;

    const valor = Number(linha.valorTexto);
    const existente = cobrancas.get(linha.paymentId);
    const chargeback = linha.event_type === "PAYMENT_CHARGEBACK_REQUESTED";
    const reembolso = linha.event_type === "PAYMENT_REFUNDED";
    const estorno = reembolso || chargeback;

    // Chargeback vence reembolso quando os dois eventos chegam para a MESMA
    // cobrança (acontece: estornamos e o cliente contesta assim mesmo, ou o
    // contrário). Contestação no banco é o fato mais grave dos dois, e é ele
    // que a tela precisa mostrar.
    const tipoAnterior = existente?.estornoTipo ?? null;
    const estornoTipo: AdminPagamento["estornoTipo"] =
      chargeback || tipoAnterior === "chargeback"
        ? "chargeback"
        : reembolso || tipoAnterior === "reembolso"
          ? "reembolso"
          : null;

    cobrancas.set(linha.paymentId, {
      paymentId: linha.paymentId,
      // O evento mais ANTIGO marca quando o dinheiro entrou; o estorno chega
      // depois e não pode reescrever a data da cobrança.
      at: existente && existente.at < linha.received_at ? existente.at : linha.received_at,
      amountCents:
        Number.isFinite(valor) && valor > 0
          ? Math.round(valor * 100)
          : (existente?.amountCents ?? 0),
      estornado: (existente?.estornado ?? false) || estorno,
      estornoTipo,
      // Ao contrário de `at`, aqui vale o evento MAIS RECENTE: é a última vez
      // que aquele dinheiro voltou.
      estornoAt: estorno
        ? existente?.estornoAt && existente.estornoAt > linha.received_at
          ? existente.estornoAt
          : linha.received_at
        : (existente?.estornoAt ?? null),
      receiptUrl: linha.receiptUrl ?? existente?.receiptUrl ?? null,
      customerId: linha.customerId ?? existente?.customerId ?? null,
    });
  }

  return [...cobrancas.values()].sort((a, b) => b.at.localeCompare(a.at));
}

function pagamentosPorAssinatura(linhas: LinhaPagamento[]): Map<string, AdminPagamento[]> {
  const grupos = new Map<string, LinhaPagamento[]>();
  for (const linha of linhas) {
    if (!linha.subscription_id) continue;
    const grupo = grupos.get(linha.subscription_id);
    if (grupo) grupo.push(linha);
    else grupos.set(linha.subscription_id, [linha]);
  }

  const saida = new Map<string, AdminPagamento[]>();
  for (const [subId, doGrupo] of grupos) saida.set(subId, deduplicarCobrancas(doGrupo));
  return saida;
}

/**
 * Cobrança que chegou sem assinatura correlacionada (`subscription_id IS NULL`).
 *
 * É dinheiro que entrou e não achou dono: o `findSubscription` do webhook não
 * conseguiu ligar o pagamento a nenhuma linha local. Some do faturamento por
 * cliente e, pior, o pagante fica sem acesso mesmo tendo pagado — então tem que
 * aparecer em destaque, não virar silêncio numa tabela.
 */
export const listOrphanPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminPagamento[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data, error } = await supabaseAdmin
      .from("billing_events")
      .select(SELECT_PAGAMENTO)
      .is("subscription_id", null)
      .in("event_type", [...EVENTOS_DE_DINHEIRO]);
    if (error) throw new Error(error.message);

    return deduplicarCobrancas((data ?? []) as unknown as LinhaPagamento[]);
  });

export interface AdminSubscriber {
  /** id da linha em `subscriptions` — um usuário pode ter várias, no histórico. */
  id: string;
  userId: string;
  email: string | null;
  fullName: string | null;
  status: string;
  /** Vocabulário do Asaas: CREDIT_CARD | PIX. Nulo em linha antiga sem método. */
  method: string | null;
  planKey: string | null;
  planName: string | null;
  /** Chave crua do Asaas (MONTHLY/QUARTERLY/YEARLY); a tela é quem traduz. */
  planCycle: string | null;
  /** Cobrado pelo ciclo inteiro, congelado no checkout — preço antigo é honrado. */
  amountCents: number;
  /**
   * `amountCents / meses do ciclo`. É a única régua que compara mensal,
   * trimestral e anual no mesmo número. Derivado, nunca gravado.
   */
  monthlyEquivalentCents: number | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  /** Motivo gravado no cancelamento (pedido do cliente, inadimplência, estorno). */
  cancelledDueTo: string | null;
  lastPaymentAt: string | null;
  lastReceiptUrl: string | null;
  /**
   * Primeira vez que ESTA assinatura foi ativada. É o "cliente desde" de
   * verdade: `createdAt` marca quando o checkout abriu, e quem abriu e nunca
   * pagou não é cliente desde coisa nenhuma.
   */
  firstActivatedAt: string | null;
  createdAt: string;
  devMode: boolean;
  /** `cus_...` do Asaas — é por onde se acha o cliente no painel do gateway. */
  providerCustomerId: string | null;
  /**
   * Acesso valendo AGORA. Espelha `has_active_subscription`: status vivo E
   * período não vencido. Um `active` com data passada (PIX que ainda não foi
   * expirado pelo cron) não conta — e é justamente o caso em que olhar só o
   * status enganaria quem lê a tela.
   */
  accessNow: boolean;

  // ─── conta (`auth.users` + `profiles`) ─────────────────────────────────────
  accountCreatedAt: string | null;
  /** Último login. É o sinal mais barato de "sumiu" — não depende de trilha de uso. */
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  isAdmin: boolean;
  trackName: string | null;
  seniority: string | null;
  onboardingCompleted: boolean;

  // ─── dinheiro que entrou de fato (`billing_events`) ────────────────────────
  /** Cobranças distintas pagas e não estornadas nesta assinatura. */
  paidCycles: number;
  /** Somatório dessas cobranças, em centavos. Recebido, não contratado. */
  paidTotalCents: number;
  /**
   * Cobranças que voltaram — reembolso ou chargeback. Ficam FORA de
   * `paidCycles`/`paidTotalCents`, que contam caixa de verdade; contadas aqui
   * porque dinheiro devolvido não é dinheiro que nunca existiu, e some da tela
   * se ninguém somar.
   */
  refundedCount: number;
  refundedTotalCents: number;
  /** Data do estorno mais recente, não da cobrança que foi estornada. */
  lastRefundAt: string | null;
  /**
   * Subconjunto de `refundedCount` que foi contestação no banco. Separado
   * porque reembolso é atendimento e chargeback é risco: quem pede reembolso
   * no prazo do CDC está exercendo um direito, quem abre chargeback deixou de
   * falar com a gente.
   */
  chargebackCount: number;

  // ─── uso (`usage_daily`, janela da lista) ──────────────────────────────────
  usage: AdminUsageSummary;
}

/** Janela da lista. 30 dias cobre um ciclo mensal inteiro. */
const JANELA_LISTA = 30;
/** Janela do detalhe. 90 dias mostra tendência, não só o mês corrente. */
const JANELA_DETALHE = 90;

/**
 * Todos os clientes que já abriram checkout, com plano, método, ciclo, dinheiro
 * recebido e uso dos últimos 30 dias.
 *
 * Lê tudo por `supabaseAdmin` porque a RLS destas tabelas só deixa cada um ver a
 * própria linha (regra 6) — inclusive para admin, que não tem policy de exceção
 * ali. Todas as consultas em paralelo e agrupadas em memória: uma por tabela,
 * nunca uma por cliente.
 */
export const listSubscribers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminSubscriber[]> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const desde = diaEmBrasilia(-(JANELA_LISTA - 1));

    const [
      { data: subs, error },
      { data: profiles },
      { data: authList, error: authErr },
      { data: tracks },
      { data: uso },
      { data: eventosDeCobranca },
    ] = await Promise.all([
      supabaseAdmin
        .from("subscriptions")
        // prettier-ignore
        .select(
          "id, user_id, status, method, amount_cents, current_period_start, current_period_end, cancel_at_period_end, cancelled_at, cancelled_due_to, last_payment_at, last_receipt_url, first_activated_at, provider_customer_id, created_at, dev_mode, billing_plans(key, name, cycle, months)",
        )
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("profiles")
        .select("id, full_name, current_track_id, seniority, onboarding_completed, is_admin"),
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("career_tracks").select("id, name"),
      supabaseAdmin.from("usage_daily").select("user_id, day, event_type, count").gte("day", desde),
      supabaseAdmin
        .from("billing_events")
        .select(SELECT_PAGAMENTO)
        .in("event_type", [...EVENTOS_DE_DINHEIRO]),
    ]);
    if (error) throw new Error(error.message);
    if (authErr) throw new Error(authErr.message);

    const perfis = new Map((profiles ?? []).map((p) => [p.id, p]));
    const trilhas = new Map((tracks ?? []).map((t) => [t.id, t.name]));
    const contas = new Map((authList?.users ?? []).map((u) => [u.id, u]));
    const usoPorUsuario = agruparUso((uso ?? []) as LinhaUsoDiario[], JANELA_LISTA);
    const pagamentos = pagamentosPorAssinatura(
      (eventosDeCobranca ?? []) as unknown as LinhaPagamento[],
    );
    const agora = Date.now();

    return (subs ?? []).map((s) => {
      const plano = s.billing_plans as {
        key: string;
        name: string;
        cycle: string;
        months: number | null;
      } | null;
      const meses = plano?.months && plano.months > 0 ? plano.months : null;
      const periodoVigente =
        !s.current_period_end || new Date(s.current_period_end).getTime() > agora;

      const perfil = perfis.get(s.user_id);
      const conta = contas.get(s.user_id);
      const cobrancas = pagamentos.get(s.id) ?? [];
      const pagas = cobrancas.filter((p) => !p.estornado);
      const estornadas = cobrancas.filter((p) => p.estornado);

      return {
        id: s.id,
        userId: s.user_id,
        email: conta?.email ?? null,
        fullName: perfil?.full_name ?? null,
        status: s.status,
        method: s.method ?? null,
        planKey: plano?.key ?? null,
        planName: plano?.name ?? null,
        planCycle: plano?.cycle ?? null,
        amountCents: s.amount_cents,
        monthlyEquivalentCents: meses ? Math.round(s.amount_cents / meses) : null,
        currentPeriodStart: s.current_period_start ?? null,
        currentPeriodEnd: s.current_period_end ?? null,
        cancelAtPeriodEnd: s.cancel_at_period_end ?? false,
        cancelledAt: s.cancelled_at ?? null,
        cancelledDueTo: s.cancelled_due_to ?? null,
        lastPaymentAt: s.last_payment_at ?? null,
        lastReceiptUrl: s.last_receipt_url ?? null,
        firstActivatedAt: s.first_activated_at ?? null,
        createdAt: s.created_at,
        devMode: s.dev_mode,
        providerCustomerId: s.provider_customer_id ?? null,
        accessNow: (s.status === "active" || s.status === "past_due") && periodoVigente,

        accountCreatedAt: conta?.created_at ?? null,
        lastSignInAt: conta?.last_sign_in_at ?? null,
        emailConfirmed: Boolean(conta?.email_confirmed_at),
        isAdmin: perfil?.is_admin ?? false,
        trackName: perfil?.current_track_id ? (trilhas.get(perfil.current_track_id) ?? null) : null,
        seniority: perfil?.seniority ?? null,
        onboardingCompleted: perfil?.onboarding_completed ?? false,

        paidCycles: pagas.length,
        paidTotalCents: pagas.reduce((a, p) => a + p.amountCents, 0),
        refundedCount: estornadas.length,
        refundedTotalCents: estornadas.reduce((a, p) => a + p.amountCents, 0),
        lastRefundAt: estornadas.reduce<string | null>(
          (maior, p) => (p.estornoAt && (!maior || p.estornoAt > maior) ? p.estornoAt : maior),
          null,
        ),
        chargebackCount: estornadas.filter((p) => p.estornoTipo === "chargeback").length,

        usage: usoPorUsuario.get(s.user_id) ?? usoVazio(JANELA_LISTA),
      };
    });
  });

// ─── Dossiê de um cliente ─────────────────────────────────────────────────────

export interface AdminSubscriberSubscription {
  id: string;
  status: string;
  planName: string | null;
  planCycle: string | null;
  method: string | null;
  amountCents: number;
  createdAt: string;
  firstActivatedAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelledAt: string | null;
  cancelledDueTo: string | null;
  cancelAtPeriodEnd: boolean;
  devMode: boolean;
  providerCustomerId: string | null;
  pagamentos: AdminPagamento[];
}

/** O que a pessoa efetivamente construiu dentro do produto. */
export interface AdminSubscriberProduto {
  cvs: number;
  ultimoCvAt: string | null;
  ultimoCvStatus: string | null;
  analises: number;
  ultimaAnaliseAt: string | null;
  ultimoScore: number | null;
  skills: number;
  planosEstudo: number;
  itensEstudo: number;
  itensConcluidos: number;
  horasRegistradas: number;
  certificacoes: number;
  cursos: number;
  empresasSeguidas: number;
}

export interface AdminSubscriberDetail {
  userId: string;
  email: string | null;
  fullName: string | null;
  headline: string | null;
  localidade: string | null;
  yearsExperience: number | null;
  seniority: string | null;
  trackName: string | null;
  onboardingCompleted: boolean;
  tourStatus: string | null;
  isAdmin: boolean;
  isAnonymous: boolean;
  isBanned: boolean;
  emailConfirmed: boolean;
  accountCreatedAt: string | null;
  lastSignInAt: string | null;
  termosVersao: string | null;
  termosAceitosAt: string | null;
  subscriptions: AdminSubscriberSubscription[];
  usage: AdminUsageSummary;
  /** Últimos eventos crus. Somem com a retenção — é rastro recente, não histórico. */
  ultimosEventos: Array<{ event: string; at: string; subjectId: string | null }>;
  produto: AdminSubscriberProduto;
  /** Bloqueios de reassinatura, em aberto ou já liberados. */
  bloqueios: Array<{
    id: string;
    reason: string;
    createdAt: string;
    releasedAt: string | null;
    releasedNote: string | null;
  }>;
}

/**
 * Dossiê de um cliente. Carregado sob demanda, ao abrir a linha.
 *
 * Separado de `listSubscribers` de propósito: são ~15 consultas, e rodá-las
 * para a lista inteira transformaria a abertura da tela numa varredura do banco
 * para montar dado que ninguém pediu ainda.
 */
export const getSubscriberDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ userId: z.string().uuid() }).parse(data))
  .handler(async ({ context, data }): Promise<AdminSubscriberDetail> => {
    await assertAdmin(context.supabase as never, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const alvo = data.userId;
    const desde = diaEmBrasilia(-(JANELA_DETALHE - 1));
    const contar = (
      tabela:
        | "user_skills"
        | "user_certifications"
        | "user_courses"
        | "user_followed_companies"
        | "study_plans",
    ) => supabaseAdmin.from(tabela).select("*", { count: "exact", head: true }).eq("user_id", alvo);

    const [
      { data: conta, error: contaErr },
      { data: perfil },
      { data: subs, error: subsErr },
      { data: uso },
      { data: eventos },
      { data: termos },
      { data: bloqueios },
    ] = await Promise.all([
      supabaseAdmin.auth.admin.getUserById(alvo),
      supabaseAdmin
        .from("profiles")
        // prettier-ignore
        .select(
          "full_name, headline, city, state, country, years_experience, seniority, current_track_id, onboarding_completed, tour_status, is_admin, is_anonymous",
        )
        .eq("id", alvo)
        .maybeSingle(),
      supabaseAdmin
        .from("subscriptions")
        // prettier-ignore
        .select(
          "id, status, method, amount_cents, created_at, first_activated_at, current_period_start, current_period_end, cancelled_at, cancelled_due_to, cancel_at_period_end, dev_mode, provider_customer_id, billing_plans(name, cycle)",
        )
        .eq("user_id", alvo)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("usage_daily")
        .select("user_id, day, event_type, count")
        .eq("user_id", alvo)
        .gte("day", desde),
      supabaseAdmin
        .from("usage_events")
        .select("event_type, created_at, subject_id")
        .eq("user_id", alvo)
        .order("created_at", { ascending: false })
        .limit(25),
      supabaseAdmin
        .from("terms_acceptances")
        .select("version, accepted_at")
        .eq("user_id", alvo)
        .order("accepted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("resubscribe_blocks")
        .select("id, reason, created_at, released_at, released_note")
        .eq("user_id", alvo)
        .order("created_at", { ascending: false }),
    ]);
    if (contaErr) throw new Error(contaErr.message);
    if (subsErr) throw new Error(subsErr.message);

    const idsAssinatura = (subs ?? []).map((s) => s.id);

    const [
      { data: eventosDeCobranca },
      { data: trilha },
      { data: cvs },
      { data: analises },
      { data: itens },
      { data: logs },
      skills,
      certificacoes,
      cursos,
      empresas,
      planos,
    ] = await Promise.all([
      idsAssinatura.length
        ? supabaseAdmin
            .from("billing_events")
            .select(SELECT_PAGAMENTO)
            .in("subscription_id", idsAssinatura)
            .in("event_type", [...EVENTOS_DE_DINHEIRO])
        : Promise.resolve({ data: [] }),
      perfil?.current_track_id
        ? supabaseAdmin
            .from("career_tracks")
            .select("name")
            .eq("id", perfil.current_track_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabaseAdmin
        .from("cvs")
        .select("status, created_at")
        .eq("user_id", alvo)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("gap_analyses")
        .select("overall_score, computed_at")
        .eq("user_id", alvo)
        .order("computed_at", { ascending: false }),
      supabaseAdmin.from("study_items").select("status").eq("user_id", alvo),
      supabaseAdmin.from("study_logs").select("hours").eq("user_id", alvo),
      contar("user_skills"),
      contar("user_certifications"),
      contar("user_courses"),
      contar("user_followed_companies"),
      contar("study_plans"),
    ]);

    const pagamentos = pagamentosPorAssinatura(
      (eventosDeCobranca ?? []) as unknown as LinhaPagamento[],
    );
    const ultimoCv = (cvs ?? [])[0] ?? null;
    const ultimaAnalise = (analises ?? [])[0] ?? null;
    const u = conta?.user ?? null;
    const bannedUntil = (u as { banned_until?: string | null } | null)?.banned_until ?? null;
    const localidade =
      [perfil?.city, perfil?.state].filter(Boolean).join(" / ") || (perfil?.country ?? null);

    return {
      userId: alvo,
      email: u?.email ?? null,
      fullName: perfil?.full_name ?? null,
      headline: perfil?.headline ?? null,
      localidade,
      yearsExperience: perfil?.years_experience ?? null,
      seniority: perfil?.seniority ?? null,
      trackName: trilha?.name ?? null,
      onboardingCompleted: perfil?.onboarding_completed ?? false,
      tourStatus: perfil?.tour_status ?? null,
      isAdmin: perfil?.is_admin ?? false,
      isAnonymous: perfil?.is_anonymous ?? false,
      isBanned: Boolean(bannedUntil && new Date(bannedUntil).getTime() > Date.now()),
      emailConfirmed: Boolean(u?.email_confirmed_at),
      accountCreatedAt: u?.created_at ?? null,
      lastSignInAt: u?.last_sign_in_at ?? null,
      termosVersao: termos?.version ?? null,
      termosAceitosAt: termos?.accepted_at ?? null,

      subscriptions: (subs ?? []).map((s) => {
        const plano = s.billing_plans as { name: string; cycle: string } | null;
        return {
          id: s.id,
          status: s.status,
          planName: plano?.name ?? null,
          planCycle: plano?.cycle ?? null,
          method: s.method ?? null,
          amountCents: s.amount_cents,
          createdAt: s.created_at,
          firstActivatedAt: s.first_activated_at ?? null,
          currentPeriodStart: s.current_period_start ?? null,
          currentPeriodEnd: s.current_period_end ?? null,
          cancelledAt: s.cancelled_at ?? null,
          cancelledDueTo: s.cancelled_due_to ?? null,
          cancelAtPeriodEnd: s.cancel_at_period_end ?? false,
          devMode: s.dev_mode,
          providerCustomerId: s.provider_customer_id ?? null,
          pagamentos: pagamentos.get(s.id) ?? [],
        };
      }),

      usage:
        agruparUso((uso ?? []) as LinhaUsoDiario[], JANELA_DETALHE).get(alvo) ??
        usoVazio(JANELA_DETALHE),

      ultimosEventos: (eventos ?? []).map((e) => ({
        event: e.event_type,
        at: e.created_at,
        subjectId: e.subject_id ?? null,
      })),

      produto: {
        cvs: (cvs ?? []).length,
        ultimoCvAt: ultimoCv?.created_at ?? null,
        ultimoCvStatus: ultimoCv?.status ?? null,
        analises: (analises ?? []).length,
        ultimaAnaliseAt: ultimaAnalise?.computed_at ?? null,
        ultimoScore: ultimaAnalise?.overall_score ?? null,
        skills: skills.count ?? 0,
        planosEstudo: planos.count ?? 0,
        itensEstudo: (itens ?? []).length,
        itensConcluidos: (itens ?? []).filter((i) => i.status === "done").length,
        horasRegistradas:
          Math.round((logs ?? []).reduce((a, l) => a + (l.hours ?? 0), 0) * 10) / 10,
        certificacoes: certificacoes.count ?? 0,
        cursos: cursos.count ?? 0,
        empresasSeguidas: empresas.count ?? 0,
      },

      bloqueios: (bloqueios ?? []).map((b) => ({
        id: b.id,
        reason: b.reason,
        createdAt: b.created_at,
        releasedAt: b.released_at ?? null,
        releasedNote: b.released_note ?? null,
      })),
    };
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
        seniority: z.enum(["estagiario", "trainee", "junior", "pleno", "senior", "staff"]),
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
    if (refreshError)
      throw new Error(`Salvo, mas a estatística não recalculou: ${refreshError.message}`);

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
        seniority: z
          .enum(["estagiario", "trainee", "junior", "pleno", "senior", "staff"])
          .nullable(),
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
