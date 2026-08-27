import * as React from "react";
import { Link } from "@tanstack/react-router";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export interface NavItem {
  label: string;
  to: string;
  icon?: React.ReactNode;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface AppShellProps {
  nav: NavItem[];
  children: React.ReactNode;
  /** Trilha de carreira selecionada. Opções vêm do banco, nunca do código. */
  trackOptions?: SelectOption[] | undefined;
  track?: string | undefined;
  onTrackChange?: ((value: string) => void) | undefined;
  /** Segmento de mercado: 'br' ou 'remoto_global'. Nunca misture os dois. */
  segmentOptions?: SelectOption[] | undefined;
  segment?: string | undefined;
  onSegmentChange?: ((value: string) => void) | undefined;
  topbarExtra?: React.ReactNode | undefined;
}

const DEFAULT_SEGMENTS: SelectOption[] = [
  { value: "br", label: "Brasil (BRL)" },
  { value: "remoto_global", label: "Remoto global (USD)" },
];

export function AppShell({
  nav,
  children,
  trackOptions = [],
  track,
  onTrackChange,
  segmentOptions = DEFAULT_SEGMENTS,
  segment,
  onSegmentChange,
  topbarExtra,
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-divider bg-surface transition-[width] duration-150 md:flex",
          collapsed ? "w-12" : "w-52",
        )}
      >
        <div className="flex h-12 items-center gap-2 border-b border-divider px-3">
          {!collapsed ? (
            <span className="label-h6 truncate text-accent-700">RUMVIA</span>
          ) : (
            <span className="label-h6 text-accent-700">R</span>
          )}
        </div>

        <nav className="nav flex-1 py-2" aria-label="Navegação principal">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to as never}
              activeProps={{ "data-active": "true" }}
              title={item.label}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed ? <span className="truncate">{item.label}</span> : null}
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-10 cursor-pointer items-center gap-2 border-t border-divider px-3 text-caption text-neutral-700 hover:bg-neutral-200"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" aria-hidden />
          ) : (
            <>
              <PanelLeftClose className="size-4" aria-hidden />
              <span>Recolher</span>
            </>
          )}
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-divider bg-bg px-4">
          <span className="label-h6 shrink-0 text-accent-700 md:hidden">RUMVIA</span>

          {trackOptions.length > 0 ? (
            <label className="flex min-w-0 items-center gap-2">
              <span className="label-h6 hidden shrink-0 text-neutral-600 sm:inline">Trilha</span>
              <select
                className="field h-7 w-auto min-w-0 py-0"
                value={track}
                onChange={(e) => onTrackChange?.(e.target.value)}
              >
                {trackOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="flex min-w-0 items-center gap-2">
            <span className="label-h6 hidden shrink-0 text-neutral-600 sm:inline">Segmento</span>
            <select
              className="field h-7 w-auto min-w-0 py-0"
              value={segment}
              onChange={(e) => onSegmentChange?.(e.target.value)}
            >
              {segmentOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <div className="ml-auto flex shrink-0 items-center gap-2">{topbarExtra}</div>
        </header>

        <main className="rumvia-container flex-1 py-6 pb-20 md:pb-6">{children}</main>
      </div>

      {/* Mobile bottom nav — only first 6 items to fit the bar */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex h-14 items-stretch border-t border-divider bg-bg md:hidden"
        aria-label="Navegação principal (mobile)"
      >
        {nav.slice(0, 5).map((item) => (
          <Link
            key={item.to}
            to={item.to as never}
            className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-neutral-600 hover:bg-surface"
            activeProps={{ className: "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-accent-700 bg-surface font-semibold" }}
            title={item.label}
          >
            <span aria-hidden>{item.icon}</span>
            <span className="truncate px-0.5">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
