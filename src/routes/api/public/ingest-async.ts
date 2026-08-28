/**
 * ingest-async — coleta em duas fases (Bright Data e futuros provedores assíncronos).
 *
 * Chamado pelo pg_cron via pg_net, com o mesmo x-cron-secret do ingest-jobs.
 *
 * Uma chamada faz as DUAS fases, nesta ordem:
 *   1. colher  — snapshots já prontos são baixados e ingeridos
 *   2. disparar — pede coletas novas
 *
 * Colher antes de disparar é deliberado: assim o lote pedido no ciclo anterior
 * é recolhido agora, e o novo disparo não esbarra na trava de "lote em
 * andamento". Invertendo a ordem, cada ciclo pularia o disparo.
 *
 * ?fase=colher | disparar limita a uma delas, útil para operar manualmente.
 */
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/ingest-async")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided = request.headers.get("x-cron-secret");
        const envSecret = process.env["LOVABLE_CRON_SECRET"];
        let authorized = Boolean(provided && envSecret && provided === envSecret);

        if (!authorized && provided) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.rpc("verify_cron_secret", { _token: provided });
          authorized = data === true;
        }

        if (!authorized) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }

        const fase = new URL(request.url).searchParams.get("fase");

        try {
          const { colherSnapshots, dispararColetas } =
            await import("@/lib/ingest/bright-data.server");

          const lote =
            fase === "disparar" ? { snapshots: [], dedupe: null } : await colherSnapshots();
          const colheita = lote.snapshots;
          const disparos = fase === "colher" ? [] : await dispararColetas();

          return new Response(
            JSON.stringify({
              colheita,
              disparos,
              dedupe: lote.dedupe,
              resumo: {
                snapshots_processados: colheita.length,
                snapshots_ingeridos: colheita.filter((c) => c.status === "ingested").length,
                vagas_criadas: colheita.reduce((a, c) => a + (c.created ?? 0), 0),
                vagas_atualizadas: colheita.reduce((a, c) => a + (c.updated ?? 0), 0),
                coletas_disparadas: disparos.filter((d) => d.status === "disparado").length,
                // Quantas cópias da mesma vaga foram tiradas da contagem agora.
                duplicatas_entre_fontes: lote.dedupe?.duplicatas ?? 0,
              },
            }),
            {
              status: 200,
              headers: { "content-type": "application/json", "cache-control": "no-store" },
            },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error("ingest-async falhou:", message);
          return new Response(JSON.stringify({ error: message }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
