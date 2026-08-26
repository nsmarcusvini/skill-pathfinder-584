/**
 * ESQUELETO — fonte paga (RapidAPI). NÃO entra no MVP.
 * Quando/se for licenciada, basta implementar fetchJobs e remover `disabled`.
 */
import type { JobAdapter } from "../types";

export const jsearchAdapter: JobAdapter = {
  key: "jsearch",
  disabled: true,
  disabledReason: "Fonte paga: fora do MVP.",
  async fetchJobs() {
    const apiKey = process.env["JSEARCH_API_KEY"];
    if (!apiKey) throw new Error("JSearch desativada: credencial ausente.");
    throw new Error("JSearch desativada no MVP (fonte paga).");
  },
};
