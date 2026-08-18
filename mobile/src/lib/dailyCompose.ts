// Rules-only composition (the fallback that makes "you always get a workout"
// true) and the validator that constrains the AI's answer to what it was
// offered — the fuel-plan doctrine, enforced client-side.
import type { CandidatePools } from "./dailyCandidates";
import type {
  SectionMinutes,
  SectionPlan,
  SessionItem,
  SessionSection,
} from "../types/daily";
import { validateSectionMinutes } from "./dailySectionMinutes";

const SECTIONS: SessionSection[] = ["warmup", "mobility", "main", "accessory", "bfr", "cooldown"];

/** Top-of-rank fill, one pass, no exercise used twice. Accessory and BFR
 *  draw from what's left of the main pool — they are main-muscle work at
 *  different intensities, not separate taxonomies. */
export function composeFallback(pools: CandidatePools, budget: SectionPlan[]): SessionItem[] {
  const used = new Set<string>();
  const items: SessionItem[] = [];
  const mainQueue = [...pools.main];

  const take = (from: { exerciseId: string }[], n: number) => {
    const out: string[] = [];
    for (const c of from) {
      if (out.length >= n) break;
      if (used.has(c.exerciseId)) continue;
      used.add(c.exerciseId);
      out.push(c.exerciseId);
    }
    return out;
  };

  for (const plan of budget) {
    if (plan.slots === 0) continue;
    const pool = plan.section === "warmup" ? pools.warmup
      : plan.section === "cooldown" ? pools.cooldown
      : mainQueue;
    for (const id of take(pool, plan.slots)) {
      items.push({
        exerciseId: id,
        section: plan.section,
        itemOrder: items.length,
        targetSets: plan.targetSets,
        targetReps: plan.targetReps,
        restSeconds: plan.restSeconds,
        reason: null,
      });
    }
  }
  return items;
}

export interface ValidatedAiSession {
  items: SessionItem[];
  servedCapturedWorkoutId: string | null;
  /** Null when the model's timings didn't hold up, or weren't asked for. */
  sectionMinutes: SectionMinutes | null;
}

const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : null;

/** Null means "unusable answer" — the caller falls back to rules. */
export function validateAiSession(
  raw: unknown,
  allowedExerciseIds: Set<string>,
  allowedWorkoutIds: Set<string>,
  /** Omitted means the caller doesn't want the model's timings. */
  minutesAvailable?: number,
): ValidatedAiSession | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const servedId = str(r.servedWorkoutId);
  if (servedId) {
    if (!allowedWorkoutIds.has(servedId)) return null;
    // A workout served whole keeps its creator's shape; we didn't compose its
    // sections, so we don't time them.
    return { items: [], servedCapturedWorkoutId: servedId, sectionMinutes: null };
  }

  const items: SessionItem[] = (Array.isArray(r.items) ? r.items : [])
    .map((item, idx): SessionItem | null => {
      if (typeof item !== "object" || item === null) return null;
      const i = item as Record<string, unknown>;
      const id = str(i.exerciseId);
      if (!id || !allowedExerciseIds.has(id)) return null;
      if (!SECTIONS.includes(i.section as SessionSection)) return null;
      const sets = typeof i.sets === "number" && i.sets >= 1
        ? Math.min(6, Math.round(i.sets))
        : null;
      const rest = typeof i.restSeconds === "number" && i.restSeconds >= 0
        ? Math.min(600, Math.round(i.restSeconds))
        : null;
      return {
        exerciseId: id,
        section: i.section as SessionSection,
        itemOrder: idx,
        targetSets: sets,
        targetReps: str(i.reps),
        restSeconds: rest,
        reason: str(i.reason),
      };
    })
    .filter((i): i is SessionItem => i !== null)
    // One appearance per exercise; first mention wins.
    .filter((i, idx, arr) => arr.findIndex((x) => x.exerciseId === i.exerciseId) === idx)
    .map((i, idx) => ({ ...i, itemOrder: idx }));

  if (items.length === 0) return null;
  return {
    items,
    servedCapturedWorkoutId: null,
    sectionMinutes: minutesAvailable === undefined
      ? null
      : validateSectionMinutes(r.sectionMinutes, items, minutesAvailable),
  };
}
