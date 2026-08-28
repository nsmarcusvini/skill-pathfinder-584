/**
 * Orquestração da coleta assíncrona (Bright Data).
 *
 * Duas fases, cada uma chamável de forma independente pelo cron:
 *
 *   dispararColetas()  -> pede a coleta às fontes e grava provider_snapshots
 *   colherSnapshots()  -> consulta os pendentes; os prontos são baixados e
 *                         ingeridos pelo pipeline ÚNICO (pipeline.server.ts)
 *
 * A separação é o que torna a coleta durável: se o processo cair entre o
 * disparo e a colheita, o snapshot continua registrado e a próxima execução o
 * encontra. E é o que garante idempotência: um snapshot só é ingerido uma vez,
 * porque vira 'ingested' e sai do filtro de pendentes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { getAsyncAdapter } from "./adapters";
import { baixarSnapshot, consultarProgresso } from "./providers/bright-data";
import {
  dedupeJobPostings,
  finishRun,
  ingestJobs,
  startRun,
  type DedupeResult,
} from "./pipeline.server";
import type { AdapterConfig } from "./types";

/** Teto de consultas por snapshot: evita gastar cota com lote preso para sempre. */
const MAX_POLLS = Number(process.env["BRIGHT_DATA_MAX_POLLS"] ?? 60);
/** Snapshot sem desfecho depois disso é abandonado. */
const IDADE_MAX_HORAS = Number(process.env["BRIGHT_DATA_SNAPSHOT_TTL_HOURS"] ?? 24);

export interface ResultadoDisparo {
  source_key: string;
  status: "disparado" | "pulado" | "erro";
  snapshot_id?: string;
  error?: string;
}

/** Log estruturado com a fonte sempre identificada, como pedido na especificação. */
function log(evento: string, dados: Record<string, unknown>) {
  console.info(JSON.stringify({ evento, provider: "bright_data", ...dados }));
}

/* ------------------------------------------------------------- fase 1 */

export async function dispararColetas(sourceKeys?: string[]): Promise<ResultadoDisparo[]> {
  let q = supabaseAdmin.from("job_sources").select("id, key, adapter, config, is_active");
  if (sourceKeys?.length) q = q.in("key", sourceKeys);
  else q = q.eq("is_active", true);

  const { data: fontes, error } = await q;
  if (error) throw new Error(`Falha ao ler job_sources: ${error.message}`);

  const resultados: ResultadoDisparo[] = [];

  for (const fonte of fontes ?? []) {
    const adapter = getAsyncAdapter(fonte.adapter);
    if (!adapter) continue; // fonte síncrona: não é deste fluxo

    if (adapter.disabled) {
      resultados.push({
        source_key: fonte.key,
        status: "pulado",
        error: adapter.disabledReason ?? "adapter desativado",
      });
      continue;
    }

    // Não dispara em cima de um lote da mesma fonte ainda em andamento —
    // duplicaria custo e dado.
    const { count: emAndamento } = await supabaseAdmin
      .from("provider_snapshots")
      .select("id", { count: "exact", head: true })
      .eq("source_id", fonte.id)
      .in("status", ["starting", "running", "ready"]);

    if ((emAndamento ?? 0) > 0) {
      resultados.push({
        source_key: fonte.key,
        status: "pulado",
        error: `já existe lote em andamento (${emAndamento})`,
      });
      continue;
    }

    try {
      const cfg = (fonte.config ?? {}) as AdapterConfig;
      const { snapshotId, request } = await adapter.trigger(cfg);

      await supabaseAdmin.from("provider_snapshots").insert({
        source_id: fonte.id,
        provider: "bright_data",
        provider_snapshot_id: snapshotId,
        dataset_id: typeof request["dataset_id"] === "string" ? request["dataset_id"] : null,
        status: "starting",
        request: request as never,
      });

      log("coleta_disparada", { source: fonte.key, snapshot_id: snapshotId });
      resultados.push({ source_key: fonte.key, status: "disparado", snapshot_id: snapshotId });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log("coleta_falhou", { source: fonte.key, erro: msg });
      resultados.push({ source_key: fonte.key, status: "erro", error: msg });
    }
  }

  return resultados;
}

/* ------------------------------------------------------------- fase 2 */

export interface ResultadoColheita {
  source_key: string;
  snapshot_id: string;
  status: string;
  records?: number;
  created?: number;
  updated?: number;
  rejected?: number;
  error?: string;
}

export interface ResultadoColheitaLote {
  snapshots: ResultadoColheita[];
  dedupe: DedupeResult | null;
}

export async function colherSnapshots(): Promise<ResultadoColheitaLote> {
  const { data: pendentes, error } = await supabaseAdmin
    .from("provider_snapshots")
    .select("*, job_sources(key)")
    .in("status", ["starting", "running", "ready"])
    .order("triggered_at", { ascending: true })
    .limit(20);
  if (error) throw new Error(`Falha ao ler provider_snapshots: ${error.message}`);

  const saida: ResultadoColheita[] = [];
  /** Só reelege canônicos se algum snapshot de fato entrou — senão é trabalho à toa. */
  let ingeriuAlgo = false;

  for (const snap of pendentes ?? []) {
    const fonte = snap.job_sources as { key: string } | null;
    const sourceKey = fonte?.key ?? "desconhecida";

    // Abandona o que passou do prazo: melhor perder um lote do que consultar
    // para sempre um snapshot que nunca vai ficar pronto.
    const horas = (Date.now() - new Date(snap.triggered_at).getTime()) / 3_600_000;
    if (horas > IDADE_MAX_HORAS || snap.poll_count >= MAX_POLLS) {
      await supabaseAdmin
        .from("provider_snapshots")
        .update({
          status: "failed",
          error: `Abandonado: ${horas.toFixed(1)}h, ${snap.poll_count} consultas.`,
        })
        .eq("id", snap.id);
      log("snapshot_abandonado", {
        source: sourceKey,
        snapshot_id: snap.provider_snapshot_id,
        horas: Number(horas.toFixed(1)),
      });
      saida.push({
        source_key: sourceKey,
        snapshot_id: snap.provider_snapshot_id,
        status: "abandonado",
      });
      continue;
    }

    try {
      const progresso = await consultarProgresso(snap.provider_snapshot_id);

      await supabaseAdmin
        .from("provider_snapshots")
        .update({
          status: progresso.status,
          poll_count: snap.poll_count + 1,
          last_polled_at: new Date().toISOString(),
        })
        .eq("id", snap.id);

      if (progresso.status !== "ready") {
        log("snapshot_aguardando", {
          source: sourceKey,
          snapshot_id: snap.provider_snapshot_id,
          status: progresso.status,
        });
        saida.push({
          source_key: sourceKey,
          snapshot_id: snap.provider_snapshot_id,
          status: progresso.status,
        });
        continue;
      }

      // Pronto: baixa, converte e manda pelo pipeline único.
      const registros = await baixarSnapshot(snap.provider_snapshot_id);

      const { data: fonteCompleta } = await supabaseAdmin
        .from("job_sources")
        .select("id, key, adapter, config")
        .eq("id", snap.source_id)
        .maybeSingle();

      const adapter = fonteCompleta ? getAsyncAdapter(fonteCompleta.adapter) : null;
      if (!adapter || !fonteCompleta) {
        throw new Error(`Adapter não encontrado para a fonte ${sourceKey}`);
      }

      const vagas = adapter.collect(registros, (fonteCompleta.config ?? {}) as AdapterConfig);

      const runId = await startRun(fonteCompleta.id);
      const counters = await ingestJobs(vagas, {
        sourceId: fonteCompleta.id,
        defaultCountry:
          typeof (fonteCompleta.config as AdapterConfig)?.["country"] === "string"
            ? ((fonteCompleta.config as AdapterConfig)["country"] as string)
            : null,
      });
      await finishRun(runId, fonteCompleta.id, counters, "success");
      ingeriuAlgo = true;

      await supabaseAdmin
        .from("provider_snapshots")
        .update({
          status: "ingested",
          records_downloaded: registros.length,
          jobs_created: counters.created,
          jobs_updated: counters.updated,
          jobs_rejected: counters.rejected,
          ingested_at: new Date().toISOString(),
        })
        .eq("id", snap.id);

      log("snapshot_ingerido", {
        source: sourceKey,
        snapshot_id: snap.provider_snapshot_id,
        registros: registros.length,
        vagas_normalizadas: vagas.length,
        criadas: counters.created,
        atualizadas: counters.updated,
        rejeitadas: counters.rejected,
      });

      saida.push({
        source_key: sourceKey,
        snapshot_id: snap.provider_snapshot_id,
        status: "ingested",
        records: registros.length,
        created: counters.created,
        updated: counters.updated,
        rejected: counters.rejected,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await supabaseAdmin
        .from("provider_snapshots")
        .update({ error: msg.slice(0, 1000), poll_count: snap.poll_count + 1 })
        .eq("id", snap.id);
      log("colheita_falhou", {
        source: sourceKey,
        snapshot_id: snap.provider_snapshot_id,
        erro: msg,
      });
      saida.push({
        source_key: sourceKey,
        snapshot_id: snap.provider_snapshot_id,
        status: "erro",
        error: msg,
      });
    }
  }

  // É AQUI que a deduplicação entre fontes ganha sentido: a mesma vaga chega
  // pelo LinkedIn, pelo Indeed e pelo Glassdoor, e sem esta chamada ela contaria
  // três vezes na demanda — que é o número que o produto vende.
  //
  // Roda depois do laço inteiro, não por snapshot: a eleição precisa enxergar
  // as três cópias juntas. Fazendo por snapshot, a primeira a chegar viraria
  // canônica sozinha e a ordem de colheita decidiria o resultado.
  let dedupe: DedupeResult | null = null;
  if (ingeriuAlgo) {
    try {
      dedupe = await dedupeJobPostings();
      log("dedupe_concluida", { ...dedupe });
    } catch (e) {
      // Falha na dedupe não invalida a colheita: as vagas entraram. O pior caso
      // é a duplicata contar até a próxima execução.
      log("dedupe_falhou", { erro: e instanceof Error ? e.message : String(e) });
    }
  }

  return { snapshots: saida, dedupe };
}
