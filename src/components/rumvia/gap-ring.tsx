import { GAP_LABEL, gapColor, gapLevel } from "@/lib/design-tokens";
import { cn } from "@/lib/utils";

export interface GapRingProps {
  /** Aderência em porcentagem (0–100). */
  value: number;
  size?: number;
  thickness?: number;
  label?: string;
  showLabel?: boolean;
  className?: string;
}

/**
 * Anel de aderência. A cor vem sempre da escala de gap — nunca hardcoded.
 */
export function GapRing({
  value,
  size = 128,
  thickness = 8,
  label,
  showLabel = true,
  className,
}: GapRingProps) {
  const pct = Math.max(0, Math.min(100, value));
  const level = gapLevel(pct);
  const color = gapColor(pct);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label={`Aderência ${Math.round(pct)}% — gap ${GAP_LABEL[level]}`}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--neutral-300)"
            strokeWidth={thickness}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={thickness}
            strokeLinecap="butt"
            strokeDasharray={`${(c * pct) / 100} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num font-semibold leading-none" style={{ fontSize: size * 0.26, color }}>
            {Math.round(pct)}
            <span style={{ fontSize: size * 0.14 }}>%</span>
          </span>
        </div>
      </div>
      {showLabel ? (
        <span className="label-h6 text-neutral-700">{label ?? `Gap ${GAP_LABEL[level]}`}</span>
      ) : null}
    </div>
  );
}
