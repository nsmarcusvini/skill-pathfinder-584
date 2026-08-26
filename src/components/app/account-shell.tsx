import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Award,
  Building2,
  FileText,
  GraduationCap,
  Gauge,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  ShieldCheck,
  Wallet,
  Wrench,
} from "lucide-react";

import { AppShell, type NavItem } from "@/components/rumvia/app-shell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useMarket, SEGMENT_LABEL, type MarketSegment } from "@/hooks/use-market";

const NAV: NavItem[] = [
  { label: "Dashboard", to: "/dashboard", icon: <LayoutDashboard className="size-4" aria-hidden /> },
  { label: "Meu CV", to: "/cv", icon: <FileText className="size-4" aria-hidden /> },
  { label: "Minhas skills", to: "/minhas-skills", icon: <ListChecks className="size-4" aria-hidden /> },
  { label: "Ferramentas", to: "/ferramentas", icon: <Wrench className="size-4" aria-hidden /> },
  { label: "Empresas", to: "/empresas", icon: <Building2 className="size-4" aria-hidden /> },
  { label: "Salários", to: "/salarios", icon: <Wallet className="size-4" aria-hidden /> },
  { label: "Progresso", to: "/progresso", icon: <Gauge className="size-4" aria-hidden /> },
  { label: "Certificações", to: "/certificacoes", icon: <Award className="size-4" aria-hidden /> },
  { label: "Cursos", to: "/cursos", icon: <GraduationCap className="size-4" aria-hidden /> },
  { label: "Conta", to: "/conta", icon: <Settings className="size-4" aria-hidden /> },
  { label: "Admin", to: "/admin", icon: <ShieldCheck className="size-4" aria-hidden /> },
];

export function AccountShell({ children }: { children: React.ReactNode }) {
  const { profile, user, signOut } = useAuth();
  const market = useMarket();
  const navigate = useNavigate();

  const trackOptions = market.tracks.map((t) => ({ value: t.id, label: t.name }));

  return (
    <AppShell
      nav={NAV}
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
      {children}
    </AppShell>
  );
}
