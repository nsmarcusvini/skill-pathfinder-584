import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_conta/admin")({
  head: () => ({
    meta: [
      { title: "Admin — RUMVIA" },
      { name: "description", content: "Área interna de operação: fontes de vagas, importação e descoberta de ATS." },
      { property: "og:title", content: "Admin — RUMVIA" },
      { property: "og:description", content: "Operação interna do RUMVIA." },
    ],
  }),
  component: AdminLayout,
});

const TABS = [
  { to: "/admin", label: "Visão geral", exact: true },
  { to: "/admin/fontes", label: "Fontes" },
  { to: "/admin/importar", label: "Importar CSV" },
  { to: "/admin/descobrir-ats", label: "Descobrir ATS" },
] as const;

function AdminLayout() {
  return (
    <div className="flex flex-col gap-6">
      <nav className="flex flex-wrap gap-px border border-divider bg-divider">
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            activeOptions={{ exact: "exact" in tab }}
            className="bg-bg px-3 py-2 font-mono text-[12px] uppercase tracking-wide text-text-muted hover:bg-neutral-200"
            activeProps={{ className: "bg-surface text-text" }}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
