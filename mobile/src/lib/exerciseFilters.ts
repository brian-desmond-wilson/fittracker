// Client-side filtering of the captured exercise catalog. The whole catalog
// is one query's result, so every axis runs here — instantly, offline,
// testable. Spec §5: AND across axes, OR within an axis; an off axis passes
// everything; a null skill never matches a skill that is on.
import type { CatalogEntry } from "../types/capture";
import type { ExerciseFilters } from "../types/exerciseFilters";
import { EMPTY_EXERCISE_FILTERS, PICTURE_LABELS } from "../types/exerciseFilters";
import type { FilterChip } from "./filterChips";
import { muscleChips } from "./filterChips";
import { SUPPORT_SURFACES, byGridOrder, equipmentLabel } from "./workoutEquipment";

const hasPicture = (e: CatalogEntry): boolean => !!e.imageUrl && e.imageUrl.trim() !== "";

function passes(e: CatalogEntry, f: ExerciseFilters): boolean {
  if (f.creators.length > 0) {
    if (!e.sources.some((s) => s.posterHandle !== null && f.creators.includes(s.posterHandle))) return false;
  }
  if (f.muscles.length > 0) {
    if (!e.muscles.some((m) => m.isPrimary && f.muscles.includes(m.name))) return false;
  }
  if (f.equipment.length > 0) {
    if (!e.equipmentTypes.some((n) => f.equipment.includes(n))) return false;
  }
  if (f.goalTypes.length > 0) {
    if (!e.goalTypes.some((g) => f.goalTypes.includes(g))) return false;
  }
  if (f.skills.length > 0) {
    if (e.skillLevel === null || !f.skills.includes(e.skillLevel)) return false;
  }
  if (f.picture === "has" && !hasPicture(e)) return false;
  if (f.picture === "missing" && hasPicture(e)) return false;
  return true;
}

export function applyExerciseFilters(entries: CatalogEntry[], f: ExerciseFilters): CatalogEntry[] {
  return entries.filter((e) => passes(e, f));
}

/** Filters, then the header search — the order the tab uses. Search is a
 *  case-insensitive substring on the name or any source handle. */
export function applyExerciseFiltersAndSearch(
  entries: CatalogEntry[], f: ExerciseFilters, search: string,
): CatalogEntry[] {
  const q = search.trim().toLowerCase();
  const filtered = applyExerciseFilters(entries, f);
  if (!q) return filtered;
  return filtered.filter((e) =>
    e.name.toLowerCase().includes(q) ||
    e.sources.some((s) => s.posterHandle?.toLowerCase().includes(q)),
  );
}

/** What the Filters chip's badge shows. */
export function countActiveExerciseFilters(f: ExerciseFilters): number {
  return (
    f.creators.length + f.muscles.length + f.equipment.length + f.goalTypes.length + f.skills.length +
    (f.picture !== "any" ? 1 : 0)
  );
}

export type ExerciseFilterAxis = keyof ExerciseFilters;
export type ExerciseFilterChip = FilterChip<ExerciseFilterAxis>;

/** Chips in sheet order: creator, muscle, equipment, type, skill, picture.
 *  A fully selected muscle group becomes one "<Group> group" chip. */
export function activeExerciseFilterChips(f: ExerciseFilters): ExerciseFilterChip[] {
  const chips: ExerciseFilterChip[] = [];
  for (const c of f.creators) chips.push({ axis: "creators", label: c, values: [c] });

  chips.push(...muscleChips("muscles", f.muscles));

  for (const e of f.equipment) chips.push({ axis: "equipment", label: equipmentLabel(e), values: [e] });
  for (const g of f.goalTypes) chips.push({ axis: "goalTypes", label: g, values: [g] });
  for (const s of f.skills) chips.push({ axis: "skills", label: s, values: [s] });
  if (f.picture !== "any") chips.push({ axis: "picture", label: PICTURE_LABELS[f.picture], values: [f.picture] });
  return chips;
}

/** The filters with one chip's values taken away. */
export function removeExerciseChip(f: ExerciseFilters, chip: ExerciseFilterChip): ExerciseFilters {
  switch (chip.axis) {
    case "picture": return { ...f, picture: "any" };
    case "creators": return { ...f, creators: f.creators.filter((v) => !chip.values.includes(v)) };
    case "muscles": return { ...f, muscles: f.muscles.filter((v) => !chip.values.includes(v)) };
    case "equipment": return { ...f, equipment: f.equipment.filter((v) => !chip.values.includes(v)) };
    case "goalTypes": return { ...f, goalTypes: f.goalTypes.filter((v) => !chip.values.includes(v)) };
    case "skills": return { ...f, skills: f.skills.filter((v) => !chip.values.includes(v)) };
  }
}

/** The filters with one whole axis switched off. Fresh arrays, not the
 *  EMPTY constant's own, because the result can land in React state. */
export function clearExerciseAxis(f: ExerciseFilters, axis: ExerciseFilterAxis): ExerciseFilters {
  const empty = EMPTY_EXERCISE_FILTERS[axis];
  return { ...f, [axis]: Array.isArray(empty) ? [...empty] : empty } as ExerciseFilters;
}

/** Sheet order, top to bottom. Ties in mostRestrictiveExerciseAxis go to the
 *  axis furthest DOWN this list. */
const AXIS_ORDER: ExerciseFilterAxis[] = ["creators", "muscles", "equipment", "goalTypes", "skills", "picture"];

function axisLabel(f: ExerciseFilters, axis: ExerciseFilterAxis): string {
  const labels = activeExerciseFilterChips(f).filter((c) => c.axis === axis).map((c) => c.label);
  return labels.length > 0 ? labels.join(" + ") : axis;
}

export interface RestrictiveExerciseAxis {
  axis: ExerciseFilterAxis;
  label: string;
  /** How many exercises the list would show with this axis cleared. */
  count: number;
}

/** When the list is empty: which single axis, if cleared, brings back the
 *  most exercises. Null when no single clearing brings back any. */
export function mostRestrictiveExerciseAxis(
  entries: CatalogEntry[], f: ExerciseFilters, search: string,
): RestrictiveExerciseAxis | null {
  let best: RestrictiveExerciseAxis | null = null;
  for (const axis of AXIS_ORDER) {
    const isOn = axis === "picture" ? f.picture !== "any" : (f[axis] as string[]).length > 0;
    if (!isOn) continue;
    const count = applyExerciseFiltersAndSearch(entries, clearExerciseAxis(f, axis), search).length;
    if (count > 0 && (best === null || count >= best.count)) {
      best = { axis, label: axisLabel(f, axis), count };
    }
  }
  return best;
}

/** Handles present in the catalog, most exercises first, then A–Z. An
 *  exercise captured twice from the same handle counts once for it. */
export function exerciseCreatorCounts(entries: CatalogEntry[]): { handle: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const e of entries) {
    const handles = new Set(e.sources.map((s) => s.posterHandle).filter((h): h is string => !!h));
    for (const h of handles) tally.set(h, (tally.get(h) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));
}

/** Tiles for the equipment grid: every name the catalog carries, the fixed
 *  grid's order first and then A–Z, surfaces never offered. */
export function catalogEquipmentNames(entries: CatalogEntry[]): { name: string; label: string }[] {
  const names = new Set<string>();
  for (const e of entries) for (const n of e.equipmentTypes) if (!SUPPORT_SURFACES.has(n)) names.add(n);
  return [...names]
    .sort(byGridOrder)
    .map((name) => ({ name, label: equipmentLabel(name) }));
}

/** Distinct goal-type names in the catalog, A–Z. */
export function catalogGoalTypes(entries: CatalogEntry[]): string[] {
  return [...new Set(entries.flatMap((e) => e.goalTypes))].filter(Boolean).sort((a, b) => a.localeCompare(b));
}
