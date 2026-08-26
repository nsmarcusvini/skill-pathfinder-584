/**
 * ESQUELETO — fonte paga. NÃO entra no MVP.
 * Assinatura pronta e credencial lida de Secrets; `disabled` impede execução.
 */
import type { JobAdapter } from "../types";

export const adzunaAdapter: JobAdapter = {
  key: "adzuna",
  disabled: true,
  disabledReason: "Fonte paga: fora do MVP.",
  async fetchJobs() {
    const appId = process.env["ADZUNA_APP_ID"];
    const appKey = process.env["ADZUNA_APP_KEY"];
    if (!appId || !appKey) throw new Error("Adzuna desativada: credenciais ausentes.");
    throw new Error("Adzuna desativada no MVP (fonte paga).");
  },
};
