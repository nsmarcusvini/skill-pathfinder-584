/**
 * Contrato único de ingestão de vagas do RUMVIA.
 * Todo adapter (pull) e todo coletor externo (push) fala nesta forma.
 */
export interface NormalizedJob {
  external_id: string;
  source_key: string;
  title: string;
  company_name: string;
  location_raw: string | null;
  is_remote: boolean;
  country: string | null;
  description_html: string | null;
  description_text: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  employment_type: string | null;
  seniority_hint: string | null;
  posted_at: string | null;
  apply_url: string | null;
  raw: Record<string, unknown>;

  /* Campos opcionais. Fontes ricas (Bright Data) preenchem; as demais omitem,
     e o pipeline grava null sem quebrar nada. */

  /** remoto | hibrido | presencial. `is_remote` é booleano e não distingue os dois últimos. */
  work_modality?: "remoto" | "hibrido" | "presencial" | null;
  /** Seção de requisitos, quando a fonte separa do corpo da descrição. */
  requirements_text?: string | null;
  qualifications_text?: string | null;
  benefits_text?: string | null;
  /** O anúncio em si. `apply_url` é o link de candidatura, que pode diferir. */
  source_url?: string | null;
  /** Id da vaga NA PLATAFORMA de origem, distinto de `external_id` (nosso, por fonte). */
  source_job_id?: string | null;
  /** Quando a fonte diz que a vaga mudou. */
  source_updated_at?: string | null;
}

export interface AdapterConfig {
  board_tokens?: string[];
  query?: string;
  tags?: string[];
  market_segment?: string;
  country?: string;
  [key: string]: unknown;
}

export interface JobAdapter {
  key: string;
  /** Fonte paga ou ainda não homologada: fica no catálogo, mas não roda no MVP. */
  disabled?: boolean;
  disabledReason?: string;
  fetchJobs(cfg: AdapterConfig): Promise<NormalizedJob[]>;
}

/**
 * Adapter de coleta em duas fases, para provedores assíncronos.
 *
 * Fontes como a Bright Data não devolvem as vagas na chamada: elas aceitam o
 * pedido, retornam um identificador e ficam prontas minutos depois. Esperar em
 * polling dentro de `fetchJobs` bloquearia a execução, estouraria timeout de
 * serverless e perderia tudo se o processo caísse no meio.
 *
 * Por isso a coleta vira duas etapas duráveis, com o estado em
 * `provider_snapshots`:
 *   1. `trigger` pede a coleta e devolve o id do lote
 *   2. `collect` é chamada depois, quando o lote está pronto, e converte os
 *      registros crus em NormalizedJob
 *
 * O contrato síncrono continua valendo para os 12 adapters atuais: quem
 * implementa `JobAdapter` não muda nada.
 */
export interface AsyncJobAdapter {
  key: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Pede a coleta. Devolve o id do lote no provedor. */
  trigger(cfg: AdapterConfig): Promise<{ snapshotId: string; request: Record<string, unknown> }>;
  /** Converte os registros crus do lote em vagas normalizadas. */
  collect(registros: Array<Record<string, unknown>>, cfg: AdapterConfig): NormalizedJob[];
}

export function isAsyncAdapter(a: JobAdapter | AsyncJobAdapter): a is AsyncJobAdapter {
  return typeof (a as AsyncJobAdapter).trigger === "function";
}

export const MAX_JOBS_PER_REQUEST = 500;
