import { cn } from "@/lib/utils";

export type SkillStatus = "dominada" | "parcial" | "faltante" | "extra";

const STATUS: Record<SkillStatus, { label: string; className: string }> = {
  dominada: { label: "Dominada", className: "border-success text-success bg-transparent" },
  parcial: { label: "Parcial", className: "border-warning text-warning bg-transparent" },
  faltante: { label: "Faltante", className: "border-danger text-danger bg-transparent" },
  extra: { label: "Extra", className: "border-accent-400 text-accent-700 bg-accent-100" },
};

export interface SkillBadgeProps {
  name: string;
  status: SkillStatus;
  /** Exibe o rótulo do status ao lado do nome. */
  showStatus?: boolean;
  className?: string;
}

export function SkillBadge({ name, status, showStatus = false, className }: SkillBadgeProps) {
  const s = STATUS[status];
  return (
    <span className={cn("tag", s.className, className)} title={`${name} — ${s.label}`}>
      <span
        aria-hidden
        className="mr-1 inline-block size-1.5"
        style={{ backgroundColor: "currentColor" }}
      />
      {name}
      {showStatus ? <span className="ml-1 opacity-70">· {s.label}</span> : null}
    </span>
  );
}

export const SKILL_STATUS_LABEL = Object.fromEntries(
  Object.entries(STATUS).map(([k, v]) => [k, v.label]),
) as Record<SkillStatus, string>;
