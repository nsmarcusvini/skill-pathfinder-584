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
import { csvManualAdapter } from "./csv-manual";
import { jsearchAdapter } from "./jsearch";
import type { JobAdapter } from "../types";

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

export function getAdapter(key: string): JobAdapter | null {
  return ADAPTERS[key] ?? null;
}
