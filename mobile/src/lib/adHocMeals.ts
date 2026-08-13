// The meals you eat that the library has never heard of.
//
// The Meal Library promises "every meal you have ever eaten", and it was
// quietly excluding the ones that never became meals: a hand-typed
// "Restaurant burrito", a scanned bar logged from the shelf. Those rows sit in
// `meal_logs` with no `meal_id` and no way into the catalog, so a thing you
// eat weekly stays invisible to availability, scoring, favourites and
// suggestions forever.
//
// This finds the ones worth promoting — the same food, logged repeatedly —
// and works out what the meal would be. It only ever proposes; nothing is
// written until the owner taps.

/** A `meal_logs` row that names no meal. */
export interface AdHocLogRow {
  name: string;
  date: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  saved_food_id: string | null;
}

export interface AdHocCandidate {
  /** As last written, so the suggestion reads back in the owner's own words. */
  name: string;
  timesLogged: number;
  lastLoggedDate: string;
  /** Typical numbers — the median, not the mean: one mis-typed 4,000-calorie
   *  entry should not define the meal you are about to create. */
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  /** The saved food these logs came from, when they all came from one — the
   *  meal can then reference it instead of inventing a duplicate. */
  savedFoodId: string | null;
}

/** Below this it is a one-off, not a habit, and the library would fill with
 *  noise. Three is the smallest number that can show a pattern. */
export const AD_HOC_MIN_TIMES = 3;

const fold = (s: string) => s.trim().toLowerCase();

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m = sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  return Math.round(m * 10) / 10;
}

/**
 * Repeat ad-hoc logs, most-eaten first.
 *
 * Grouped case-insensitively on the name, because "chipotle bowl" and
 * "Chipotle Bowl" are the same dinner typed twice. Rows with no numbers at all
 * still count toward the tally — you ate it — they just contribute nothing to
 * the medians.
 */
export function adHocCandidates(
  rows: AdHocLogRow[],
  opts: { minTimes?: number; exclude?: Set<string> } = {},
): AdHocCandidate[] {
  const minTimes = opts.minTimes ?? AD_HOC_MIN_TIMES;
  const exclude = opts.exclude ?? new Set<string>();
  const groups = new Map<string, AdHocLogRow[]>();

  for (const row of rows) {
    const key = fold(row.name);
    if (key === "" || exclude.has(key)) continue;
    const arr = groups.get(key) ?? [];
    arr.push(row);
    groups.set(key, arr);
  }

  const out: AdHocCandidate[] = [];
  for (const rowsForName of groups.values()) {
    if (rowsForName.length < minTimes) continue;
    // Sorted so "as last written" and "last eaten" agree.
    const byDate = [...rowsForName].sort((a, b) => b.date.localeCompare(a.date));
    const latest = byDate[0];
    const nums = (key: keyof AdHocLogRow) =>
      rowsForName
        .map((r) => r[key])
        .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

    // Only when every log agrees on the source: a mixture means the name has
    // been used for more than one product, and picking one would be a guess.
    const ids = new Set(rowsForName.map((r) => r.saved_food_id));
    const savedFoodId = ids.size === 1 ? (rowsForName[0].saved_food_id ?? null) : null;

    out.push({
      name: latest.name.trim(),
      timesLogged: rowsForName.length,
      lastLoggedDate: latest.date,
      calories: median(nums("calories")),
      protein: median(nums("protein")),
      carbs: median(nums("carbs")),
      fats: median(nums("fats")),
      sugars: median(nums("sugars")),
      sodium_mg: median(nums("sodium_mg")),
      fiber_g: median(nums("fiber_g")),
      savedFoodId,
    });
  }

  return out.sort(
    (a, b) => b.timesLogged - a.timesLogged || a.name.localeCompare(b.name),
  );
}

/** The line under the name: "eaten 6× · last Aug 2 · not in your library". */
export function adHocSummary(c: AdHocCandidate): string {
  const cals = c.calories != null ? ` · ~${Math.round(c.calories)} cal` : "";
  return `${c.timesLogged}× logged${cals}`;
}
