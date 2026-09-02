import * as React from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTour, type UseTourReturn } from "@/hooks/use-tour";
import { cn } from "@/lib/utils";

const CARD_WIDTH = 328;
const CARD_EST_HEIGHT = 240;
const GAP = 14;
const HIGHLIGHT_PADDING = 6;

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function rectFromDom(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function placeCard(anchor: Rect, isSidebar: boolean): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (isSidebar) {
    const left = Math.min(anchor.left + anchor.width + GAP, vw - CARD_WIDTH - 16);
    const top = Math.min(Math.max(anchor.top, 16), Math.max(16, vh - CARD_EST_HEIGHT - 16));
    return { top, left: Math.max(16, left) };
  }
  const left = Math.min(Math.max(anchor.left, 16), Math.max(16, vw - CARD_WIDTH - 16));
  const top = Math.min(anchor.top + anchor.height + GAP, Math.max(16, vh - CARD_EST_HEIGHT - 16));
  return { top, left };
}

/** Corpo do card, compartilhado entre a variante ancorada (desktop) e o Drawer (mobile). */
function TourCardBody({
  tour,
  showClose = true,
}: {
  tour: UseTourReturn;
  /** O SheetContent já renderiza o próprio botão de fechar — evita X duplicado. */
  showClose?: boolean;
}) {
  const step = tour.current;
  const navigate = useNavigate();
  if (!step) return null;
  const Icon = step.icon;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center border border-divider bg-surface text-accent-700">
          <Icon className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="label-h6 text-neutral-600">
            Passo {tour.step + 1} de {tour.total}
          </p>
          <h2 className="mt-0.5 text-body font-semibold text-neutral-900">{step.title}</h2>
        </div>
        {showClose ? (
          <button
            type="button"
            onClick={tour.skip}
            // Rótulo diferente do botão "Pular tour" logo abaixo: os dois fazem a
            // mesma coisa, e repetir o label faz o leitor de tela anunciar dois
            // controles idênticos no mesmo card.
            aria-label="Fechar tour"
            className="flex size-6 shrink-0 cursor-pointer items-center justify-center text-neutral-600 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        ) : null}
      </div>

      <p className="text-caption leading-relaxed text-neutral-700">{step.body}</p>

      <Progress value={((tour.step + 1) / tour.total) * 100} />

      {tour.isLast ? (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          <Button type="button" variant="outline" size="sm" onClick={tour.finish}>
            Fechar
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              tour.finish();
              void navigate({ to: "/cv" });
            }}
          >
            Começar pelo meu CV
          </Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 pt-1">
          <Button type="button" variant="ghost" size="sm" onClick={tour.skip}>
            Pular tour
          </Button>
          <div className="flex items-center gap-2">
            {!tour.isFirst ? (
              <Button type="button" variant="outline" size="sm" onClick={tour.back}>
                Voltar
              </Button>
            ) : null}
            <Button type="button" size="sm" onClick={tour.next}>
              Próximo
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** resetKey muda a cada passo do tour — refaz o foco/trap para o card novo. */
function useFocusTrap(containerRef: React.RefObject<HTMLDivElement | null>, resetKey: number) {
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    el.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !el) return;
      const focusables = el.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    el.addEventListener("keydown", onKeyDown);
    return () => {
      el.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [containerRef, resetKey]);
}

function DesktopTour({ tour }: { tour: UseTourReturn }) {
  const anchorId = tour.current?.anchor;
  const isSidebar = Boolean(anchorId && anchorId !== "tour-topbar-filtros");
  const [anchorRect, setAnchorRect] = React.useState<Rect | null>(null);
  const [bump, setBump] = React.useState(0);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const reducedMotion = React.useMemo(prefersReducedMotion, []);

  React.useEffect(() => {
    const aside = document.querySelector("aside");
    if (!aside) return;
    const ro = new ResizeObserver(() => setBump((b) => b + 1));
    ro.observe(aside);
    return () => ro.disconnect();
  }, []);

  React.useLayoutEffect(() => {
    function recompute() {
      if (!anchorId) {
        setAnchorRect(null);
        return;
      }
      const el = document.querySelector(`[data-tour="${anchorId}"]`);
      setAnchorRect(el ? rectFromDom(el) : null);
    }
    recompute();
    window.addEventListener("resize", recompute);
    return () => window.removeEventListener("resize", recompute);
  }, [anchorId, bump]);

  useFocusTrap(cardRef, tour.step);

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") tour.skip();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [tour]);

  const transition = reducedMotion
    ? undefined
    : "top 180ms ease, left 180ms ease, width 180ms ease, height 180ms ease";

  const cardPos = anchorRect ? placeCard(anchorRect, isSidebar) : null;

  return (
    <div className="fixed inset-0 z-[70]" aria-hidden={false}>
      <span className="sr-only" aria-live="polite">
        {tour.current ? `Passo ${tour.step + 1} de ${tour.total}: ${tour.current.title}` : ""}
      </span>

      {/* Camada de bloqueio: nada na página fica clicável enquanto o tour roda —
          o clique é capturado aqui e só avança o passo (no último, encerra). */}
      <div
        className="fixed inset-0 z-[70] bg-transparent"
        style={anchorRect ? undefined : { backgroundColor: "rgb(var(--rgb-text) / 0.6)" }}
        onClick={() => (tour.isLast ? tour.finish() : tour.next())}
      />

      {anchorRect ? (
        <div
          className="fixed z-[71] border-2 pointer-events-none"
          style={{
            top: anchorRect.top - HIGHLIGHT_PADDING,
            left: anchorRect.left - HIGHLIGHT_PADDING,
            width: anchorRect.width + HIGHLIGHT_PADDING * 2,
            height: anchorRect.height + HIGHLIGHT_PADDING * 2,
            borderColor: "var(--accent-700)",
            boxShadow: "0 0 0 9999px rgb(var(--rgb-text) / 0.6)",
            transition,
          }}
        />
      ) : null}

      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-label={tour.current?.title ?? "Tour guiado"}
        tabIndex={-1}
        className={cn(
          "fixed z-[72] border border-divider bg-surface p-4 shadow-lg focus:outline-none",
          !cardPos && "inset-0 m-auto flex h-fit w-full max-w-sm items-start",
        )}
        style={
          cardPos
            ? { top: cardPos.top, left: cardPos.left, width: CARD_WIDTH, transition }
            : { width: "min(384px, calc(100vw - 32px))" }
        }
      >
        <TourCardBody tour={tour} />
      </div>
    </div>
  );
}

function MobileTour({ tour }: { tour: UseTourReturn }) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) tour.skip();
      }}
    >
      <SheetContent
        side="bottom"
        className="z-[70] max-h-[80vh] overflow-y-auto"
        onPointerDownOutside={(e) => e.preventDefault()}
        aria-label={tour.current?.title ?? "Tour guiado"}
      >
        <span className="sr-only" aria-live="polite">
          {tour.current ? `Passo ${tour.step + 1} de ${tour.total}: ${tour.current.title}` : ""}
        </span>
        <TourCardBody tour={tour} showClose={false} />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Tour guiado pós-cadastro. Monta-se no AccountShell (cobre todas as rotas
 * /_conta) e não renderiza nada fora da janela em que está ativo.
 */
export function Tour() {
  const tour = useTour();
  const isMobile = useIsMobile();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  if (!tour.active || !mounted) return null;

  return createPortal(
    isMobile ? <MobileTour tour={tour} /> : <DesktopTour tour={tour} />,
    document.body,
  );
}
