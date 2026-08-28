import { adzunaAdapter } from "./adzuna";
import {
  arbeitnowAdapter,
  himalayasAdapter,
  jobicyAdapter,
  remoteokAdapter,
  remotiveAdapter,
} from "./aggregators";
import {
  ashbyAdapter,
  greenhouseAdapter,
  leverAdapter,
  smartrecruitersAdapter,
  workableAdapter,
} from "./ats";
import {
  brightDataGlassdoorAdapter,
  brightDataIndeedAdapter,
  brightDataLinkedinJobsAdapter,
  jobgetherAdapter,
} from "./bright-data";
import { csvManualAdapter } from "./csv-manual";
import { jsearchAdapter } from "./jsearch";
import type { AsyncJobAdapter, JobAdapter } from "../types";

/** Registro de adapters por `job_sources.adapter`. */
export const ADAPTERS: Record<string, JobAdapter> = {
  greenhouse: greenhouseAdapter,
  lever: leverAdapter,
  ashby: ashbyAdapter,
  workable: workableAdapter,
  smartrecruiters: smartrecruitersAdapter,
  remotive: remotiveAdapter,
  remoteok: remoteokAdapter,
  himalayas: himalayasAdapter,
  jobicy: jobicyAdapter,
  arbeitnow: arbeitnowAdapter,
  manual: csvManualAdapter,
  adzuna: adzunaAdapter,
  jsearch: jsearchAdapter,
};

/**
 * Adapters de coleta assíncrona (duas fases). Ficam num registro separado
 * porque o orquestrador é outro: dispara agora, colhe depois. Ver
 * `bright-data.server.ts`.
 */
export const ASYNC_ADAPTERS: Record<string, AsyncJobAdapter> = {
  bd_linkedin_jobs: brightDataLinkedinJobsAdapter,
  bd_indeed: brightDataIndeedAdapter,
  bd_glassdoor: brightDataGlassdoorAdapter,
  bd_jobgether: jobgetherAdapter,
};

export function getAdapter(key: string): JobAdapter | null {
  return ADAPTERS[key] ?? null;
}

export function getAsyncAdapter(key: string): AsyncJobAdapter | null {
  return ASYNC_ADAPTERS[key] ?? null;
}

/** Uma chave de adapter é assíncrona? Usado por run.server para escolher o fluxo. */
export function isAsyncAdapterKey(key: string): boolean {
  return key in ASYNC_ADAPTERS;
}
