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
      return { jobs: 0, skills: 0, tracks: [], devopsTopTools: [] };
    }

    const raw = data as {
      jobs: number;
      skills: number;
      tracks: { key: string; name: string; description: string | null }[];
      devops_top_tools: { name: string; share: number | string }[];
    };

    return {
      jobs: Number(raw.jobs ?? 0),
      skills: Number(raw.skills ?? 0),
      tracks: raw.tracks ?? [],
      devopsTopTools: (raw.devops_top_tools ?? []).map((t) => ({
        name: t.name,
        share: Number(t.share ?? 0),
      })),
    };
  },
);
