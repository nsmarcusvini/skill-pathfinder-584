/**
 * Cliente da Bright Data — Web Scraper API (datasets v3).
 *
 * Contrato confirmado na documentação oficial em 2026-08-27:
 *   POST /datasets/v3/trigger?dataset_id=...   -> { snapshot_id }
 *   GET  /datasets/v3/progress/{snapshot_id}   -> { snapshot_id, dataset_id, status }
 *   GET  /datasets/v3/snapshot/{snapshot_id}   -> registros
 *   Autenticação: Authorization: Bearer <API_KEY>
 *
 * NÃO inventar parâmetros aqui. O que não estiver documentado não entra: os
 * `dataset_id` (gd_...) são específicos da conta e saem do painel do cliente
 * (brightdata.com/cp/datasets), por isso vivem em job_sources.config e nunca
 * no código.
 *
 * A coleta é ASSÍNCRONA: trigger devolve na hora, os dados demoram. Este módulo
 * só fala HTTP — quem guarda o estado do snapshot entre execuções é
 * `snapshots.server.ts`.
 */

const BASE = "https://api.brightdata.com/datasets/v3";

/** Status possíveis do snapshot, conforme a API. */
export const SNAPSHOT_STATUS = ["starting", "running", "ready", "failed", "canceled"] as const;
export type SnapshotStatus = (typeof SNAPSHOT_STATUS)[number];

/** Terminais: não adianta continuar consultando. */
export const STATUS_FINAL: readonly SnapshotStatus[] = ["ready", "failed", "canceled"];

export interface BrightDataTriggerInput {
  datasetId: string;
  /** Corpo do POST: array de entradas. A forma varia por dataset. */
  payload: Array<Record<string, unknown>>;
  /** "discover_new" para descoberta; ausente = coleta por URL informada. */
  type?: "discover_new";
  /** Só com type=discover_new. Ex.: "keyword". */
  discoverBy?: string;
  /** Teto de registros por entrada — controla custo. */
  limitPerInput?: number;
  /** Traz os erros de coleta junto, em vez de descartar em silêncio. */
  includeErrors?: boolean;
}

export interface BrightDataError extends Error {
  status?: number;
  /** Erro de rede ou 5xx/429: vale repetir. 4xx de payload: não vale. */
  retryable: boolean;
}

function erro(message: string, status?: number, retryable = false): BrightDataError {
  const e = new Error(message) as BrightDataError;
  if (status !== undefined) e.status = status;
  e.retryable = retryable;
  return e;
}

function apiKey(): string {
  const key = process.env["BRIGHT_DATA_API_KEY"];
  if (!key) {
    throw erro(
      "BRIGHT_DATA_API_KEY ausente. Defina como variável de ambiente do servidor (CLAUDE.md, regra 8).",
    );
  }
  return key;
}

/** Timeout por requisição; a coleta em si é assíncrona e não espera aqui. */
const TIMEOUT_MS = Number(process.env["BRIGHT_DATA_TIMEOUT_MS"] ?? 30_000);
const MAX_TENTATIVAS = Number(process.env["BRIGHT_DATA_MAX_RETRIES"] ?? 4);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Requisição com backoff exponencial e jitter.
 * Repete só o que faz sentido repetir: rede, 429 e 5xx. Um 400 por payload
 * errado repetido 4 vezes é 4 vezes o mesmo erro, e ainda gasta cota.
 */
async function requisitar(
  url: string,
  init: RequestInit,
  tentativas = MAX_TENTATIVAS,
): Promise<Response> {
  let ultimoErro: BrightDataError | null = null;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey()}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

      if (res.ok) return res;

      const corpo = await res.text().catch(() => "");
      const repetivel = res.status === 429 || res.status >= 500;
      ultimoErro = erro(
        `Bright Data HTTP ${res.status} em ${url}: ${corpo.slice(0, 300)}`,
        res.status,
        repetivel,
      );
      if (!repetivel) throw ultimoErro;
    } catch (e) {
      const abortado = e instanceof Error && e.name === "AbortError";
      if (abortado) {
        ultimoErro = erro(`Timeout de ${TIMEOUT_MS}ms em ${url}`, undefined, true);
      } else if ((e as BrightDataError).retryable === false) {
        throw e; // 4xx já classificado: não insiste
      } else if (!(e as BrightDataError).retryable) {
        ultimoErro = erro(`Falha de rede em ${url}: ${(e as Error).message}`, undefined, true);
      }
    } finally {
      clearTimeout(timer);
    }

    if (tentativa < tentativas) {
      // 1s, 2s, 4s… com jitter para não sincronizar várias execuções.
      const espera = 2 ** (tentativa - 1) * 1000 + Math.random() * 500;
      await sleep(espera);
    }
  }

  throw ultimoErro ?? erro(`Falha em ${url} após ${tentativas} tentativas`, undefined, true);
}

/** Dispara a coleta. Devolve o snapshot_id imediatamente — os dados vêm depois. */
export async function dispararColeta(input: BrightDataTriggerInput): Promise<string> {
  const params = new URLSearchParams({ dataset_id: input.datasetId, format: "json" });
  if (input.type) params.set("type", input.type);
  if (input.discoverBy) params.set("discover_by", input.discoverBy);
  if (input.limitPerInput !== undefined) params.set("limit_per_input", String(input.limitPerInput));
  if (input.includeErrors) params.set("include_errors", "true");

  const res = await requisitar(`${BASE}/trigger?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify(input.payload),
  });

  const json = (await res.json()) as { snapshot_id?: string };
  if (!json.snapshot_id) {
    throw erro(`Bright Data não devolveu snapshot_id: ${JSON.stringify(json).slice(0, 300)}`);
  }
  return json.snapshot_id;
}

export interface ProgressoSnapshot {
  snapshotId: string;
  datasetId: string | null;
  status: SnapshotStatus;
  /** Status desconhecido é tratado como não-terminal, para não perder dado. */
  finalizado: boolean;
}

export async function consultarProgresso(snapshotId: string): Promise<ProgressoSnapshot> {
  const res = await requisitar(`${BASE}/progress/${encodeURIComponent(snapshotId)}`, {
    method: "GET",
  });
  const json = (await res.json()) as { snapshot_id?: string; dataset_id?: string; status?: string };
  const status = (json.status ?? "running") as SnapshotStatus;
  return {
    snapshotId: json.snapshot_id ?? snapshotId,
    datasetId: json.dataset_id ?? null,
    status,
    finalizado: STATUS_FINAL.includes(status),
  };
}

/**
 * Baixa os registros de um snapshot pronto.
 * A API pode devolver JSON array ou NDJSON — aceitamos os dois, porque o
 * formato varia por dataset e não vale quebrar a coleta por causa disso.
 */
export async function baixarSnapshot(snapshotId: string): Promise<Array<Record<string, unknown>>> {
  const res = await requisitar(`${BASE}/snapshot/${encodeURIComponent(snapshotId)}?format=json`, {
    method: "GET",
  });
  const texto = await res.text();
  if (!texto.trim()) return [];

  try {
    const json = JSON.parse(texto);
    if (Array.isArray(json)) return json as Array<Record<string, unknown>>;
    // Alguns datasets embrulham em { data: [...] }.
    if (json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)) {
      return (json as { data: Array<Record<string, unknown>> }).data;
    }
    return [json as Record<string, unknown>];
  } catch {
    // NDJSON: uma linha por registro.
    return texto
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((l) => {
        try {
          return JSON.parse(l) as Record<string, unknown>;
        } catch {
          return null;
        }
      })
      .filter((r): r is Record<string, unknown> => r !== null);
  }
}

/** A conta está configurada? Serve para o adapter falhar com mensagem clara. */
export function brightDataConfigurada(): boolean {
  return Boolean(process.env["BRIGHT_DATA_API_KEY"]);
}
