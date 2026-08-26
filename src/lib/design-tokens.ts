/**
 * Tokens do Design System RUMVIA expostos ao TypeScript.
 * Única fonte para valores que precisam existir em JS (gráficos, SVG).
 * Nunca escreva hex solto em componente — importe daqui.
 */

export const NEUTRAL = {
  100: "#f5f5f8",
  200: "#e7e7ea",
  300: "#d4d4d7",
  400: "#b7b7ba",
  500: "#98989b",
  600: "#7a7a7d",
  700: "#5d5d60",
  800: "#424244",
  900: "#2b2b2d",
} as const;

export const ACCENT = {
  100: "#eef6ff",
  200: "#d6ebff",
  300: "#b5d9fd",
  400: "#94bce3",
  500: "#749dc4",
  600: "#597ea3",
  700: "#416180",
  800: "#2c455d",
  900: "#1d2d3d",
} as const;

export const ACCENT2 = {
  100: "#eef6ff",
  200: "#d6ebff",
  300: "#bdd8f2",
  400: "#9ebbd8",
  500: "#7e9cb8",
  600: "#627d98",
  700: "#486077",
  800: "#314457",
  900: "#1f2d3a",
} as const;

export const BASE = {
  bg: "#f2f2f3",
  surface: "#e9e9ea",
  text: "#1d1f20",
  accent: "#5980a6",
  accent2: "#728fab",
  divider: "rgb(29 31 32 / 0.16)",
} as const;

export const SEMANTIC = {
  success: "#52785f",
  warning: "#b3862e",
  danger: "#a3452f",
  info: BASE.accent,
} as const;

/** Escala de gap (aderência). Nunca hardcode estas cores fora daqui. */
export const GAP_SCALE = {
  critical: "#a3452f",
  low: "#b3862e",
  mid: "#749dc4",
  high: "#52785f",
} as const;

export type GapLevel = keyof typeof GAP_SCALE;

/** Faixa de aderência -> nível de gap. */
export function gapLevel(percent: number): GapLevel {
  const p = Math.max(0, Math.min(100, percent));
  if (p < 40) return "critical";
  if (p < 60) return "low";
  if (p < 80) return "mid";
  return "high";
}

export function gapColor(percent: number): string {
  return GAP_SCALE[gapLevel(percent)];
}

export const GAP_LABEL: Record<GapLevel, string> = {
  critical: "Crítico",
  low: "Baixo",
  mid: "Médio",
  high: "Alto",
};

export const GAP_CLASS: Record<GapLevel, string> = {
  critical: "text-gap-critical",
  low: "text-gap-low",
  mid: "text-gap-mid",
  high: "text-gap-high",
};

/** Paleta fixa de séries para gráficos, nesta ordem. */
export const CHART_SERIES = [
  ACCENT[700],
  ACCENT2[500],
  ACCENT[300],
  NEUTRAL[700],
  ACCENT[400],
  NEUTRAL[500],
] as const;

export function chartColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length] as string;
}

export const CHART_AXIS = {
  stroke: "rgba(29,31,32,0.16)",
  tickFill: NEUTRAL[600],
  tickFontSize: 13,
} as const;
