import { createServerFn } from "@tanstack/react-start";

/**
 * Prova de valor pública da landing: números reais da base, sem gate e sem PII.
 * Lê a função agregada landing_stats() com a chave publicável (papel anon).
 */
export interface LandingStats {
  jobs: number;
  skills: number;
  tracks: { key: string; name: string; description: string | null }[];
  devopsTopTools: { name: string; share: number }[];
  /** devops · pleno, um item por segmento. Vazio quando a amostra não passa
   *  do piso (>= 5, mesmo usado em /ferramentas) — nunca preenchido com valor
   *  inventado. */
  devopsSalary: {
    segment: "br" | "remoto_global";
    currency: string;
    p25: number;
    p50: number;
    p75: number;
    sampleSize: number;
  }[];
}

export const getLandingStats = createServerFn({ method: "GET" }).handler(
  async (): Promise<LandingStats> => {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const url = process.env["SUPABASE_URL"]!;

    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
            h.delete("Authorization");
          }
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });

    const { data, error } = await client.rpc("landing_stats");
    if (error || !data) {
      return { jobs: 0, skills: 0, tracks: [], devopsTopTools: [], devopsSalary: [] };
    }

    const raw = data as {
      jobs: number;
      skills: number;
      tracks: { key: string; name: string; description: string | null }[];
      devops_top_tools: { name: string; share: number | string }[];
      devops_salary: {
        segment: "br" | "remoto_global";
        currency: string;
        p25: number | string;
        p50: number | string;
        p75: number | string;
        sampleSize: number | string;
      }[];
    };

    return {
      jobs: Number(raw.jobs ?? 0),
      skills: Number(raw.skills ?? 0),
      tracks: raw.tracks ?? [],
      devopsTopTools: (raw.devops_top_tools ?? []).map((t) => ({
        name: t.name,
        share: Number(t.share ?? 0),
      })),
      devopsSalary: (raw.devops_salary ?? []).map((s) => ({
        segment: s.segment,
        currency: s.currency,
        p25: Number(s.p25 ?? 0),
        p50: Number(s.p50 ?? 0),
        p75: Number(s.p75 ?? 0),
        sampleSize: Number(s.sampleSize ?? 0),
      })),
    };
  },
);
