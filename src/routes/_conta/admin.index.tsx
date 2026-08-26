import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/rumvia/page-header";

export const Route = createFileRoute("/_conta/admin/")({
  component: AdminHome,
});

const CARDS = [
  {
    to: "/admin/fontes",
    title: "Fontes de vagas",
    text: "Status da última execução, contagem de vagas e botão para rodar a ingestão agora.",
  },
  {
    to: "/admin/importar",
    title: "Importar CSV",
    text: "Cobre vagas brasileiras que nenhuma API gratuita entrega. Validação linha a linha e pré-visualização.",
  },
  {
    to: "/admin/descobrir-ats",
    title: "Descobrir ATS",
    text: "Cole a URL da página de carreiras e descubra o ATS e o board_token sugerido.",
  },
] as const;

function AdminHome() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Interno" title="Admin" subtitle="Ingestão de vagas, importação manual e descoberta de ATS." />
      <div className="grid gap-px bg-divider md:grid-cols-3">
        {CARDS.map((card) => (
          <Link key={card.to} to={card.to} className="flex flex-col gap-2 bg-bg p-4 hover:bg-surface">
            <span className="font-display text-base uppercase tracking-wide">{card.title}</span>
            <span className="text-sm text-text-muted">{card.text}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
