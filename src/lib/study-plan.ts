const KEY = "rumvia:plano-estudos";

export interface StudyPlanEntry {
  skillId: string;
  name: string;
  addedAt: string;
}

export function readStudyPlan(): StudyPlanEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as StudyPlanEntry[]) : [];
  } catch {
    return [];
  }
}

/** Retorna true quando a skill foi realmente adicionada (false = já estava no plano). */
export function addToStudyPlan(entry: { skillId: string; name: string }): boolean {
  const plan = readStudyPlan();
  if (plan.some((e) => e.skillId === entry.skillId)) return false;
  plan.push({ ...entry, addedAt: new Date().toISOString() });
  window.localStorage.setItem(KEY, JSON.stringify(plan));
  return true;
}

export function removeFromStudyPlan(skillId: string): void {
  window.localStorage.setItem(
    KEY,
    JSON.stringify(readStudyPlan().filter((e) => e.skillId !== skillId)),
  );
}
