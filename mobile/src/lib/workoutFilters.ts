// Client-side filtering of captured workouts. The whole library is one
// query's result, so every axis runs here — instantly, offline, testable.
// Spec §5. AND across axes, OR within an axis; an off axis passes everything;
// an unclassified workout never matches an axis that is on.
import type { CapturedWorkoutEntry } from "../types/capture";
import type { WorkoutFilters, LengthBand } from "../types/workoutFilters";
import { EMPTY_FILTERS, LENGTH_BANDS, INTENSITY_LABELS, HISTORY_LABELS } from "../types/workoutFilters";
import type { CompletionMap } from "./workoutCompletion";
import { filterWorkouts } from "./workoutFilter";
import { BLOCK_TITLES } from "./dailyBlockCompose";
import { MUSCLE_GROUPS } from "./dailyCoverage";
import { equipmentLabel } from "./workoutEquipment";
import { FORMAT_LABELS, SCORE_LABELS } from "./workoutFormatVocab";

const BODYWEIGHT = "Bodyweight";

/** First band whose ceiling holds the value. Upper bounds only, so a
 *  fractional estimate (15.5) lands in the next band up instead of in the
 *  gap between two integer boundaries. */
function bandOf(minutes: number): LengthBand | null {
  const hit = LENGTH_BANDS.find((b) => minutes <= b.max);
  return hit ? hit.band : null;
}

function passes(w: CapturedWorkoutEntry, f: WorkoutFilters, completions: CompletionMap): boolean {
  if (f.creators.length > 0) {
    const h = w.source?.posterHandle;
    if (!h || !f.creators.includes(h)) return false;
  }
  if (f.muscles.length > 0) {
    if (!w.tags.muscles.some((m) => m.isPrimary && f.muscles.includes(m.name))) return false;
  }
  if (f.equipment.length > 0) {
    const wantsBodyweight = f.equipment.includes(BODYWEIGHT);
    const gear = f.equipment.filter((e) => e !== BODYWEIGHT);
    const hitImplement = gear.some((e) => w.derivedEquipment.includes(e));
    const hitBodyweight = wantsBodyweight && w.isBodyweight;
    if (!hitImplement && !hitBodyweight) return false;
  }
  if (f.blockRoles.length > 0) {
    if (!w.tags.blockRoles.some((r) => f.blockRoles.includes(r))) return false;
  }
  if (f.formats.length > 0) {
    const wantsUntagged = f.formats.includes("untagged");
    const hit = w.tags.format !== null && f.formats.includes(w.tags.format);
    if (!hit && !(wantsUntagged && w.tags.format === null)) return false;
  }
  if (f.scores.length > 0) {
    if (w.tags.scoreType === null || !f.scores.includes(w.tags.scoreType)) return false;
  }
  if (f.intensity !== null) {
    if (w.tags.intensity !== f.intensity) return false;
  }
  if (f.lengths.length > 0) {
    const band = w.tags.estMinutes === null ? null : bandOf(w.tags.estMinutes);
    if (band === null || !f.lengths.includes(band)) return false;
  }
  if (f.skills.length > 0) {
    if (w.tags.skillLevel === null || !f.skills.includes(w.tags.skillLevel)) return false;
  }
  if (f.history === "never" && completions[w.workoutId]) return false;
  if (f.history === "done" && !completions[w.workoutId]) return false;
  return true;
}

export function applyWorkoutFilters(
  entries: CapturedWorkoutEntry[],
  filters: WorkoutFilters,
  completions: CompletionMap,
): CapturedWorkoutEntry[] {
  return entries.filter((w) => passes(w, filters, completions));
}

/** Filters, then the header search — the order the tab uses. */
export function applyFiltersAndSearch(
  entries: CapturedWorkoutEntry[],
  filters: WorkoutFilters,
  completions: CompletionMap,
  search: string,
): CapturedWorkoutEntry[] {
  return filterWorkouts(applyWorkoutFilters(entries, filters, completions), search);
}

/** What the Filters chip's badge shows. */
export function countActiveFilters(f: WorkoutFilters): number {
  return (
    f.creators.length + f.muscles.length + f.equipment.length + f.blockRoles.length +
    f.formats.length + f.scores.length +
    f.lengths.length + f.skills.length +
    (f.intensity !== null ? 1 : 0) + (f.history !== "any" ? 1 : 0)
  );
}

export type FilterAxis = keyof WorkoutFilters;

/** One removable chip above the list. `values` are the raw values the chip
 *  stands for on its axis — several when a muscle group collapsed. */
export interface FilterChip {
  axis: FilterAxis;
  label: string;
  values: string[];
}

/** Chips in sheet order: creator, muscle, equipment, type, format, score, intensity, length,
 *  skill, history. A fully selected muscle group becomes one "<Group> group"
 *  chip (mockup A6). */
export function activeFilterChips(f: WorkoutFilters): FilterChip[] {
  const chips: FilterChip[] = [];
  for (const c of f.creators) chips.push({ axis: "creators", label: c, values: [c] });

  const remaining = new Set(f.muscles);
  for (const g of MUSCLE_GROUPS) {
    // A one-region group (Whole body) is just its region; no collapse.
    if (g.muscles.length > 1 && g.muscles.every((m) => remaining.has(m))) {
      chips.push({ axis: "muscles", label: `${g.title} group`, values: [...g.muscles] });
      for (const m of g.muscles) remaining.delete(m);
    }
  }
  for (const m of f.muscles) if (remaining.has(m)) chips.push({ axis: "muscles", label: m, values: [m] });

  for (const e of f.equipment) chips.push({ axis: "equipment", label: equipmentLabel(e), values: [e] });
  for (const r of f.blockRoles) chips.push({ axis: "blockRoles", label: BLOCK_TITLES[r], values: [r] });
  for (const v of f.formats) {
    chips.push({ axis: "formats", label: v === "untagged" ? "Untagged" : FORMAT_LABELS[v], values: [v] });
  }
  for (const s of f.scores) chips.push({ axis: "scores", label: SCORE_LABELS[s], values: [s] });
  if (f.intensity !== null) chips.push({ axis: "intensity", label: INTENSITY_LABELS[f.intensity], values: [f.intensity] });
  for (const l of f.lengths) chips.push({ axis: "lengths", label: LENGTH_BANDS.find((b) => b.band === l)!.label, values: [l] });
  for (const s of f.skills) chips.push({ axis: "skills", label: s, values: [s] });
  if (f.history !== "any") chips.push({ axis: "history", label: HISTORY_LABELS[f.history], values: [f.history] });
  return chips;
}

/** The filters with one chip's values taken away. */
export function removeChip(f: WorkoutFilters, chip: FilterChip): WorkoutFilters {
  switch (chip.axis) {
    case "intensity": return { ...f, intensity: null };
    case "history": return { ...f, history: "any" };
    case "creators": return { ...f, creators: f.creators.filter((v) => !chip.values.includes(v)) };
    case "muscles": return { ...f, muscles: f.muscles.filter((v) => !chip.values.includes(v)) };
    case "equipment": return { ...f, equipment: f.equipment.filter((v) => !chip.values.includes(v)) };
    case "blockRoles": return { ...f, blockRoles: f.blockRoles.filter((v) => !chip.values.includes(v)) };
    case "formats": return { ...f, formats: f.formats.filter((v) => !chip.values.includes(v)) };
    case "scores": return { ...f, scores: f.scores.filter((v) => !chip.values.includes(v)) };
    case "lengths": return { ...f, lengths: f.lengths.filter((v) => !chip.values.includes(v)) };
    case "skills": return { ...f, skills: f.skills.filter((v) => !chip.values.includes(v)) };
  }
}

/** The filters with one whole axis switched off. Fresh arrays, not
 *  EMPTY_FILTERS's own, because the result can land in React state. */
export function clearAxis(f: WorkoutFilters, axis: FilterAxis): WorkoutFilters {
  const empty = EMPTY_FILTERS[axis];
  return { ...f, [axis]: Array.isArray(empty) ? [...empty] : empty } as WorkoutFilters;
}

/** Sheet order, top to bottom. Ties in mostRestrictiveAxis go to the axis
 *  furthest DOWN this list. */
const AXIS_ORDER: FilterAxis[] = [
  "creators", "muscles", "equipment", "blockRoles", "formats", "scores", "intensity", "lengths", "skills", "history",
];

/** What the empty state's "Drop …" button names: every chip on the axis,
 *  because clearing the axis drops all of them. Naming only the first would
 *  promise less than the button does. */
function axisLabel(f: WorkoutFilters, axis: FilterAxis): string {
  const labels = activeFilterChips(f).filter((c) => c.axis === axis).map((c) => c.label);
  return labels.length > 0 ? labels.join(" + ") : axis;
}

export interface RestrictiveAxis {
  axis: FilterAxis;
  label: string;
  /** How many workouts the list would show with this axis cleared. */
  count: number;
}

/** When the list is empty: which single axis, if cleared, brings back the
 *  most workouts. Null when no single clearing brings back any. */
export function mostRestrictiveAxis(
  entries: CapturedWorkoutEntry[],
  f: WorkoutFilters,
  completions: CompletionMap,
  search: string,
): RestrictiveAxis | null {
  let best: RestrictiveAxis | null = null;
  for (const axis of AXIS_ORDER) {
    const isOn = axis === "intensity" ? f.intensity !== null
      : axis === "history" ? f.history !== "any"
      : (f[axis] as string[]).length > 0;
    if (!isOn) continue;
    const count = applyFiltersAndSearch(entries, clearAxis(f, axis), completions, search).length;
    if (count > 0 && (best === null || count >= best.count)) {
      best = { axis, label: axisLabel(f, axis), count };
    }
  }
  return best;
}

/** Handles present in the library, most workouts first, then A–Z. */
export function creatorCounts(entries: CapturedWorkoutEntry[]): { handle: string; count: number }[] {
  const tally = new Map<string, number>();
  for (const w of entries) {
    const h = w.source?.posterHandle;
    if (h) tally.set(h, (tally.get(h) ?? 0) + 1);
  }
  return [...tally.entries()]
    .map(([handle, count]) => ({ handle, count }))
    .sort((a, b) => b.count - a.count || a.handle.localeCompare(b.handle));
}
