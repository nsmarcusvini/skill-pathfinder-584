import { createFileRoute } from "@tanstack/react-router";

/** Atualiza as views materializadas de mercado. Só o agendamento chama. */
export const Route = createFileRoute("/api/public/refresh-market-views")({
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

        const { refreshMarketViews } = await import("@/lib/jd/refresh.server");
        const result = await refreshMarketViews();
        return new Response(JSON.stringify(result), {
          status: result.status === "success" ? 200 : 500,
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
