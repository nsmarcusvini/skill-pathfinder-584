import * as React from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Award,
  Briefcase,
  Building2,
  CreditCard,
  FileText,
  GraduationCap,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Lock,
  Settings,
  ShieldCheck,
  Wallet,
  Wrench,
} from "lucide-react";

import { AppShell, type NavItem } from "@/components/rumvia/app-shell";
import { Blueprint } from "@/components/rumvia/blueprint";
import { Tour } from "@/components/rumvia/tour";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useSubscription } from "@/hooks/use-subscription";
import { useMarket, SEGMENT_LABEL, type MarketSegment } from "@/hooks/use-market";

const NAV: NavItem[] = [
  {
    label: "Dashboard",
    to: "/dashboard",
    icon: <LayoutDashboard className="size-4" aria-hidden />,
    tourId: "tour-nav-dashboard",
  },
  {
    label: "Meu CV",
    to: "/cv",
    icon: <FileText className="size-4" aria-hidden />,
    tourId: "tour-nav-cv",
  },
  {
    label: "Minhas skills",
    to: "/minhas-skills",
    icon: <ListChecks className="size-4" aria-hidden />,
    tourId: "tour-nav-minhas-skills",
  },
  {
    label: "Vagas",
    to: "/vagas",
    icon: <Briefcase className="size-4" aria-hidden />,
    tourId: "tour-nav-vagas",
  },
  {
    label: "Stacks em Alta",
    to: "/ferramentas",
    icon: <Wrench className="size-4" aria-hidden />,
    tourId: "tour-nav-ferramentas",
  },
  {
    label: "Empresas",
    to: "/empresas",
    icon: <Building2 className="size-4" aria-hidden />,
    tourId: "tour-nav-empresas",
  },
  {
    label: "Salários",
    to: "/salarios",
    icon: <Wallet className="size-4" aria-hidden />,
    tourId: "tour-nav-salarios",
  },
  {
    label: "Progresso",
    to: "/progresso",
    icon: <Gauge className="size-4" aria-hidden />,
    tourId: "tour-nav-progresso",
  },
  {
    label: "Certificações",
    to: "/certificacoes",
    icon: <Award className="size-4" aria-hidden />,
    tourId: "tour-nav-certificacoes",
  },
  {
    label: "Cursos",
    to: "/cursos",
    icon: <GraduationCap className="size-4" aria-hidden />,
    tourId: "tour-nav-cursos",
  },
  {
    label: "Assinatura",
    to: "/assinatura",
    icon: <CreditCard className="size-4" aria-hidden />,
    tourId: "tour-nav-assinatura",
  },
  {
    label: "Conta",
    to: "/conta",
    icon: <Settings className="size-4" aria-hidden />,
    tourId: "tour-nav-conta",
  },
];

/** Só entra no menu de quem tem profiles.is_admin. A proteção real é server-side
 *  (assertAdmin em admin.functions.ts); esconder aqui evita link quebrado. */
const ADMIN_NAV: NavItem = {
  label: "Admin",
  to: "/admin",
  icon: <ShieldCheck className="size-4" aria-hidden />,
};

/**
 * Recado permanente para quem entrou na conta mas ainda não pagou. Só sobra
 * `/conta` navegável (o paywall barra o resto), então o aviso mora aqui, no
 * shell, e não em cada tela. Em `/assinatura` a própria página já avisa —
 * repetir viraria dois alertas empilhados.
 */
function FaixaAcessoBloqueado() {
  return (
    <Blueprint className="mb-4 flex flex-wrap items-center gap-3 border-danger p-4" role="alert">
      <Lock className="size-4 shrink-0 text-danger" aria-hidden />
      <p className="flex-1 text-caption text-neutral-700">
        <strong>Acesso bloqueado.</strong> Seu painel só abre depois que a assinatura for paga.
      </p>
      <Button size="sm" asChild>
        <Link to="/assinatura">Assinar agora</Link>
      </Button>
    </Blueprint>
  );
}

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const market = useMarket();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { canAccess, resolvendo } = useSubscription();
  const mostrarFaixa = !resolvendo && !canAccess && pathname !== "/assinatura";

  const nav = React.useMemo(
    () => (profile?.is_admin ? [...NAV, ADMIN_NAV] : NAV),
    [profile?.is_admin],
  );

  const trackOptions = market.tracks.map((t) => ({ value: t.id, label: t.name }));

  return (
    <AppShell
      nav={nav}
      trackOptions={trackOptions}
      track={market.trackId ?? undefined}
      onTrackChange={(value) => void market.setTrackId(value)}
      segment={market.segment}
      onSegmentChange={(value) => void market.setSegment(value as MarketSegment)}
      segmentOptions={[
        { value: "br", label: SEGMENT_LABEL.br },
        { value: "remoto_global", label: SEGMENT_LABEL.remoto_global },
      ]}
      topbarExtra={
        <div className="flex items-center gap-2">
          <span className="hidden max-w-40 truncate text-caption text-neutral-700 sm:inline">
            {profile?.full_name || user?.email}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              void navigate({ to: "/login", replace: true });
            }}
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">Sair</span>
          </Button>
        </div>
      }
    >
      {mostrarFaixa ? <FaixaAcessoBloqueado /> : null}
      {children}
      <Tour />
    </AppShell>
  );
}
