// One removable chip above a filtered list. Shared by the Workouts and
// Exercises tabs; each names its own axis union.
import { MUSCLE_GROUPS } from "./dailyCoverage";

export interface FilterChip<Axis extends string> {
  axis: Axis;
  label: string;
  /** The raw values the chip stands for on its axis — several when a muscle
   *  group collapsed into one chip. */
  values: string[];
}

/** Add or remove one value in a list-valued axis. */
export function toggleIn<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

/** Muscle chips for one axis: a fully selected multi-region group becomes a
 *  single "<Group> group" chip carrying every region; the rest are one chip
 *  each, in the order they were selected. A one-region group (Whole body) is
 *  just its region — no collapse. The product rule both tabs share. */
export function muscleChips<Axis extends string>(axis: Axis, muscles: string[]): FilterChip<Axis>[] {
  const chips: FilterChip<Axis>[] = [];
  const remaining = new Set(muscles);
  for (const g of MUSCLE_GROUPS) {
    if (g.muscles.length > 1 && g.muscles.every((m) => remaining.has(m))) {
      chips.push({ axis, label: `${g.title} group`, values: [...g.muscles] });
      for (const m of g.muscles) remaining.delete(m);
    }
  }
  for (const m of [...new Set(muscles)]) if (remaining.has(m)) chips.push({ axis, label: m, values: [m] });
  return chips;
}
