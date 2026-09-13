import * as React from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Blueprint } from "./blueprint";

export interface NavItem {
  label: string;
  to: string;
  icon?: React.ReactNode;
  /** Âncora do tour guiado (data-tour). Só o menu desktop recebe o atributo. */
  tourId?: string;
  /**
   * Adianta o DADO da tela por intenção, como o router já faz com o código
   * (`defaultPreload: "intent"`). Disparado no hover, no foco por teclado e no
   * primeiro toque. Deve ser idempotente e barato quando o cache está fresco —
   * `prefetchQuery` já garante isso.
   */
  onPrefetch?: () => void;
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
  /**
   * Recorte trocando: o conteúdo em tela é do recorte ANTIGO até as consultas
   * voltarem. Escurece o conteúdo, trava os seletores (dois cliques seguidos
   * disparariam duas invalidações em corrida) e anuncia o que está vindo.
   */
  busy?: boolean | undefined;
  /** Frase principal do aviso. Diga o DESTINO: "Recalculando para Back-End". */
  busyLabel?: string | undefined;
  /** Linha de apoio. É onde a espera vira evidência de trabalho, não de lentidão. */
  busyHint?: string | undefined;
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
  busy = false,
  busyLabel,
  busyHint,
}: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="flex min-h-screen bg-bg">
      <aside
        className={cn(
          "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-divider bg-surface transition-[width] duration-300 ease-in-out md:flex",
          collapsed ? "w-12" : "w-52",
        )}
      >
        <div className="flex h-12 items-center gap-2 overflow-hidden border-b border-divider px-3">
          {/* As duas grafias ficam montadas o tempo todo, uma sobre a outra, e só
              a opacidade troca. Um unmount condicional (como antes) some e
              aparece no instante exato do clique — sem transição nenhuma — e é
              isso que faz o recolher parecer brusco mesmo com a largura já
              suave. Crossfade: nenhuma das duas pisca, uma se apaga enquanto a
              outra surge. */}
          <span className="relative flex h-6 w-40 shrink-0 items-center">
            <img
              src="/logo-rumvia.png"
              alt="RUMVIA"
              aria-hidden={collapsed}
              className={cn(
                "block h-6 w-auto transition-opacity duration-300 ease-in-out",
                collapsed ? "opacity-0" : "opacity-100",
              )}
            />
            <img
              src="/logo-rumvia-icon.png"
              alt="RUMVIA"
              aria-hidden={!collapsed}
              className={cn(
                "absolute inset-y-0 left-0 h-6 w-auto transition-opacity duration-300 ease-in-out",
                collapsed ? "opacity-100" : "opacity-0",
              )}
            />
          </span>
        </div>

        <nav className="nav flex-1 overflow-hidden py-2" aria-label="Navegação principal">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to as never}
              activeProps={{ "data-active": "true" }}
              title={item.label}
              data-tour={item.tourId}
              onMouseEnter={item.onPrefetch}
              onFocus={item.onPrefetch}
              onTouchStart={item.onPrefetch}
            >
              <span className="shrink-0">{item.icon}</span>
              {/* Sempre montado; encolhe e apaga junto, no mesmo ritmo da
                  largura do aside, em vez de sumir de golpe. */}
              <span
                aria-hidden={collapsed}
                className={cn(
                  "truncate transition-[opacity,max-width] duration-300 ease-in-out",
                  collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100",
                )}
              >
                {item.label}
              </span>
            </Link>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex h-10 cursor-pointer items-center gap-2 overflow-hidden border-t border-divider px-3 text-caption text-neutral-700 hover:bg-neutral-200"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          <span className="relative flex size-4 shrink-0 items-center justify-center">
            <PanelLeftClose
              aria-hidden
              className={cn(
                "absolute size-4 transition-opacity duration-300 ease-in-out",
                collapsed ? "opacity-0" : "opacity-100",
              )}
            />
            <PanelLeftOpen
              aria-hidden
              className={cn(
                "absolute size-4 transition-opacity duration-300 ease-in-out",
                collapsed ? "opacity-100" : "opacity-0",
              )}
            />
          </span>
          <span
            aria-hidden={collapsed}
            className={cn(
              "truncate transition-[opacity,max-width] duration-300 ease-in-out",
              collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100",
            )}
          >
            Recolher
          </span>
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-12 items-center gap-3 border-b border-divider bg-bg px-4">
          <img src="/logo-rumvia.png" alt="RUMVIA" className="h-6 w-auto shrink-0 md:hidden" />

          <div data-tour="tour-topbar-filtros" className="flex min-w-0 items-center gap-3">
            {trackOptions.length > 0 ? (
              <label className="flex min-w-0 items-center gap-2">
                <span className="label-h6 hidden shrink-0 text-neutral-600 sm:inline">Trilha</span>
                <select
                  className="field h-7 w-auto min-w-0 py-0 disabled:cursor-progress disabled:opacity-60"
                  value={track}
                  disabled={busy}
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
                className="field h-7 w-auto min-w-0 py-0 disabled:cursor-progress disabled:opacity-60"
                value={segment}
                disabled={busy}
                onChange={(e) => onSegmentChange?.(e.target.value)}
              >
                {segmentOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">{topbarExtra}</div>

          {/* Fio na borda de baixo do topo. Fica FORA do fluxo (absolute) para
              não empurrar o conteúdo 2px quando aparece — um salto de layout a
              cada troca seria mais perceptível que o próprio carregamento. */}
          {busy ? (
            <span
              aria-hidden
              className="absolute inset-x-0 -bottom-px h-0.5 animate-pulse bg-accent-600"
            />
          ) : null}
        </header>

        <main
          aria-busy={busy}
          className={cn(
            "rumvia-container flex-1 py-6 pb-20 md:pb-6",
            // Escurecer em vez de esvaziar: o usuário mantém a referência de
            // onde estava na página, e os números velhos ficam ilegíveis o
            // bastante para ninguém tentar lê-los como se fossem os novos.
            busy && "pointer-events-none opacity-40 transition-opacity duration-200",
          )}
        >
          {children}
        </main>

        {busy ? (
          <Blueprint
            role="status"
            aria-live="polite"
            // Centralizado por `inset-x-4 + mx-auto`, e não por
            // `left-1/2 + -translate-x-1/2`: com `left:50%` a largura DISPONÍVEL
            // vira metade da viewport, e no celular o cartão encolhia para
            // 188px — o texto quebrava em cinco linhas dentro de uma coluna
            // estreita. `w-fit` mantém o encolher ao conteúdo no desktop.
            className="fixed inset-x-4 top-1/2 z-40 mx-auto flex w-fit max-w-[22rem] -translate-y-1/2 items-start gap-3 bg-bg px-5 py-4"
          >
            <Loader2 className="mt-0.5 size-5 shrink-0 animate-spin text-accent-700" aria-hidden />
            <div className="min-w-0">
              <p className="text-body font-semibold text-neutral-900">
                {busyLabel ?? "Recalculando…"}
              </p>
              {busyHint ? <p className="caption mt-0.5">{busyHint}</p> : null}
            </div>
          </Blueprint>
        ) : null}
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
            activeProps={{
              className:
                "flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] text-accent-700 bg-surface font-semibold",
            }}
            title={item.label}
            onTouchStart={item.onPrefetch}
          >
            <span aria-hidden>{item.icon}</span>
            <span className="truncate px-0.5">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
