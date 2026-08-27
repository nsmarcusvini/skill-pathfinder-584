import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/rumvia/page-header";
import { LoadingState } from "@/components/rumvia/states";
import { getHealthStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_conta/admin/saude")({
  component: AdminSaudePage,
});

function fmt(n: number) {
  return n.toLocaleString("pt-BR");
}

function fmtDate(iso: string | null) {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function StatCard({
  label,
  value,
  sub,
  warning,
}: {
  label: string;
  value: string;
  sub?: string;
  warning?: boolean;
}) {
  return (
    <div className="border p-4 flex flex-col gap-1">
      <div
        className="text-xs uppercase tracking-wide font-mono"
        style={{ color: "var(--color-muted-foreground, #888)" }}
      >
        {label}
      </div>
      <div
        className="font-display text-2xl"
        style={{ color: warning ? "var(--color-danger)" : undefined }}
      >
        {value}
      </div>
      {sub && (
        <div className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="border-b pb-1 font-mono text-xs uppercase tracking-wide" style={{ color: "var(--color-muted-foreground, #888)" }}>
      {title}
    </div>
  );
}

function AdminSaudePage() {
  const getStats = useServerFn(getHealthStats);

  const statsQuery = useQuery({
    queryKey: ["admin", "health"],
    queryFn: () => getStats({}),
    refetchInterval: 60_000,
  });

  if (statsQuery.isLoading) return <LoadingState />;

  const s = statsQuery.data;
  if (!s) return null;

  const pctAnon = s.users_total > 0 ? Math.round((s.users_anonymous / s.users_total) * 100) : 0;
  const pctBr = s.jobs_active > 0 ? Math.round((s.jobs_br / s.jobs_active) * 100) : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Interno"
        title="Saúde do sistema"
        subtitle="Métricas de uso, banco e qualidade do dado. Atualiza a cada 60 s."
      />

      <SectionHeader title="Usuários" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
        <StatCard label="Total" value={fmt(s.users_total)} />
        <StatCard label="Permanentes" value={fmt(s.users_permanent)} sub={`${100 - pctAnon}% do total`} />
        <StatCard label="Anônimos" value={fmt(s.users_anonymous)} sub={`${pctAnon}% do total`} />
        <StatCard label="Novos (7d)" value={fmt(s.users_last_7d)} />
      </div>

      <SectionHeader title="Vagas" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
        <StatCard label="Total no banco" value={fmt(s.jobs_total)} />
        <StatCard label="Ativas" value={fmt(s.jobs_active)} />
        <StatCard label="BR (ativas)" value={fmt(s.jobs_br)} sub={`${pctBr}%`} />
        <StatCard label="Remoto global (ativas)" value={fmt(s.jobs_global)} sub={`${100 - pctBr}%`} />
      </div>

      <SectionHeader title="Análises de gap" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
        <StatCard label="Total geradas" value={fmt(s.gap_analyses_total)} />
        <StatCard label="Últimos 7d" value={fmt(s.gap_analyses_last_7d)} />
        <StatCard label="Planos de estudo" value={fmt(s.study_plans_total)} />
        <StatCard
          label="Termos na fila"
          value={fmt(s.pending_terms)}
          warning={s.pending_terms > 50}
          sub={s.pending_terms > 50 ? "Curar em Skills" : undefined}
        />
      </div>

      <SectionHeader title="Materialized views" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
        <StatCard label="mv_salary_stats" value={fmtDate(s.mv_salary_refreshed_at)} />
        <StatCard label="mv_tool_ranking" value={fmtDate(s.mv_tool_refreshed_at)} />
        <StatCard label="Último cron" value={fmtDate(s.cron_last_run)} />
      </div>

      <p className="text-xs" style={{ color: "var(--color-muted-foreground, #888)" }}>
        Se as views estiverem desatualizadas, acesse Admin → Fontes → "Rodar ingestão" ou espere o próximo ciclo do pg_cron.
      </p>
    </div>
  );
}
