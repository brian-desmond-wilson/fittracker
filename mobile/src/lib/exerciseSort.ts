// The three orders of the Exercises tab. Pure; sorts a copy. Spec §5.
import type { CatalogEntry } from "../types/capture";
import type { ExerciseSort } from "../types/exerciseFilters";

type Cmp = (a: CatalogEntry, b: CatalogEntry) => number;

/** fetchCatalog puts the newest source first, so sources[0] is the capture
 *  the tab orders by. Compared as instants: Postgres may write "+00:00" or
 *  "Z" for the same moment. Unparseable → null → last either way. */
const capturedMs = (e: CatalogEntry): number | null => {
  const stamp = e.sources[0]?.capturedAt;
  if (!stamp) return null;
  const ms = Date.parse(stamp);
  return Number.isNaN(ms) ? null : ms;
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
const name: Cmp = (a, b) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" }) || capturedDesc(a, b);

const CMP: Record<ExerciseSort, Cmp> = { captured_desc: capturedDesc, captured_asc: capturedAsc, name };

export function sortExercises(entries: CatalogEntry[], sort: ExerciseSort): CatalogEntry[] {
  return [...entries].sort(CMP[sort]);
}
