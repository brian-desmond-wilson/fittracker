// The three orders of the Exercises tab. Pure; sorts a copy. Spec §5.
import type { CatalogEntry } from "../types/capture";
import type { ExerciseSort } from "../types/exerciseFilters";

type Cmp = (a: CatalogEntry, b: CatalogEntry) => number;

/** The exercise's newest capture, as an instant: Postgres may write "+00:00"
 *  or "Z" for the same moment, so stamps are parsed, not compared as text.
 *  No parseable stamp → null → last in either direction. */
const capturedMs = (e: CatalogEntry): number | null => {
  let best: number | null = null;
  for (const s of e.sources) {
    const ms = Date.parse(s.capturedAt);
    if (!Number.isNaN(ms) && (best === null || ms > best)) best = ms;
  }
  return best;
};

const byCaptured = (dir: 1 | -1): Cmp => (a, b) => {
  const ma = capturedMs(a);
  const mb = capturedMs(b);
  if (ma === null && mb === null) return 0;
  if (ma === null) return 1;
  if (mb === null) return -1;
  return (ma - mb) * dir;
};
const capturedDesc: Cmp = byCaptured(-1);
const capturedAsc: Cmp = byCaptured(1);
const byName: Cmp = (a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || capturedDesc(a, b);

const CMP: Record<ExerciseSort, Cmp> = { captured_desc: capturedDesc, captured_asc: capturedAsc, name: byName };

export function sortExercises(entries: CatalogEntry[], sort: ExerciseSort): CatalogEntry[] {
  return [...entries].sort(CMP[sort]);
}
