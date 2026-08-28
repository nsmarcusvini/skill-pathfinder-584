import { createFileRoute, Link } from "@tanstack/react-router";

import { PageHeader } from "@/components/rumvia/page-header";

export const Route = createFileRoute("/_conta/admin/")({
  component: AdminHome,
});

const CARDS = [
  {
    to: "/admin/usuarios",
    title: "Usuários",
    text: "Quem usa o RUMVIA, o que cada um já gerou, e quem pode administrar. Conceda ou remova admin e desative contas.",
  },
  {
    to: "/admin/salarios",
    title: "Salários",
    text: "Contribuições de usuários aguardando aprovação. Corrija valores, aprove ou rejeite — só o aprovado entra na mediana.",
  },
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
    to: "/admin/skills",
    title: "Curadoria de skills",
    text: "Fila de termos desconhecidos minerados das vagas. Aprove como alias ou crie skill nova.",
  },
  {
    to: "/admin/trilhas",
    title: "Trilhas de carreira",
    text: "Gerencie trilhas ativas e variantes de cargo. Adicionar trilha = dados no banco, zero código.",
  },
  {
    to: "/admin/saude",
    title: "Saúde do sistema",
    text: "Usuários, vagas, análises de gap, frescor das materialized views e último cron.",
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
      <PageHeader
        eyebrow="Interno"
        title="Admin"
        subtitle="Usuários, ingestão de vagas, curadoria de skills e saúde do sistema."
      />
      <div className="grid gap-px bg-divider md:grid-cols-3">
        {CARDS.map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="flex flex-col gap-2 bg-bg p-4 hover:bg-surface"
          >
            <span className="font-display text-base uppercase tracking-wide">{card.title}</span>
            <span className="text-sm text-text-muted">{card.text}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
