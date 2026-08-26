/** REFRESH MATERIALIZED VIEW CONCURRENTLY de todas as mv_, com log de execução. */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const MATERIALIZED_VIEWS = [
  "mv_skill_demand_by_track",
  "mv_tool_demand",
  "mv_company_hiring",
  "mv_salary_stats",
] as const;

export interface RefreshResult {
  status: "success" | "error";
  views_refreshed: number;
  duration_ms: number;
  error?: string;
}

export async function refreshMarketViews(): Promise<RefreshResult> {
  const startedAt = Date.now();
  const { data: logRow } = await supabaseAdmin
    .from("view_refresh_log")
    .insert({ status: "running" })
    .select("id")
    .maybeSingle();

  try {
    // A função no banco faz REFRESH ... CONCURRENTLY nas quatro views.
    const { error } = await supabaseAdmin.rpc("refresh_market_views");
    if (error) throw new Error(error.message);

    const duration = Date.now() - startedAt;
    if (logRow?.id) {
      await supabaseAdmin
        .from("view_refresh_log")
        .update({
          status: "success",
          finished_at: new Date().toISOString(),
          duration_ms: duration,
          views_refreshed: MATERIALIZED_VIEWS.length,
        })
        .eq("id", logRow.id);
    }
    return { status: "success", views_refreshed: MATERIALIZED_VIEWS.length, duration_ms: duration };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const duration = Date.now() - startedAt;
    if (logRow?.id) {
      await supabaseAdmin
        .from("view_refresh_log")
        .update({
          status: "error",
          finished_at: new Date().toISOString(),
          duration_ms: duration,
          error: message.slice(0, 1000),
        })
        .eq("id", logRow.id);
    }
    return { status: "error", views_refreshed: 0, duration_ms: duration, error: message };
  }
}
