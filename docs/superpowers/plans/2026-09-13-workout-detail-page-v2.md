# Workout Detail Page v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the captured-workout page's read view as the exercise page's sibling — hero with title and creator byline, format badge, stat row, history block, muscle/equipment chips, a format band over movement rows that carry thumbnail + muscles + equipment, a collapsed raw-protocol row, and Start + Add-to-a-day at the end of the scroll.

**Architecture:** Pure logic lands in `mobile/src/lib` with Jest tests; each visible section becomes a component under `mobile/src/components/training/workout-detail/`; `CapturedWorkoutScreen.tsx` becomes a composer for the read view and keeps its editing branch byte-for-byte. Per-movement thumbnails and muscles are added to the one workout query; "Add to a day" reuses `adoptCapturedWorkout` with a chosen date; chips open the Workouts tab through a new `workoutFilter` route param mirroring the exercise page's `exerciseFilter`.

**Tech Stack:** Expo / React Native, expo-router, Supabase (untyped client — `tsc` proves nothing about column names), lucide-react-native, expo-linear-gradient, `@react-native-community/datetimepicker`, Jest + ts-jest (pure `src/lib` only).

**Spec:** `docs/superpowers/specs/2026-09-13-workout-detail-page-v2-design.md`. Decision record: the full-page mockup at `.superpowers/brainstorm/76391-1789345000/content/full-page.html`.

**Deviations from the spec, decided while planning (all small, all in the spec's spirit):**
1. The format phrase + gloss live in the existing `mobile/src/lib/workoutFormat.ts` (which already owns the card's format phrasing) rather than a new `workoutFormatPhrase.ts`; score-type names reuse the existing `SCORE_LABELS`.
2. An untagged workout that has a round count gets a `3 ROUNDS` badge and gloss rather than nothing — same rule the card already applies.
3. Adding to a day other than today shows an inline "Added to Tomorrow" line under the button instead of a toast; the app's toast hand-off only lands on the Today tab, which we do not navigate to for other days. Today still hands off a toast and navigates.
4. History "Sessions" rows show `date · duration` (e.g. "12 Sep · 18 min") rather than `date · session name` — a served-whole session's name is always the workout's own name, which the hero already says.
5. The history read is two queries (completed `generated_sessions` for this workout, then their `workout_sessions` for the Track ids and durations) rather than one nested filter.

**Working directory for every command:** `mobile/` (`cd /Users/brianwilson/code/fittracker/mobile`).

**Commit trailer for every commit:**
```
Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
```

---

## File map

**New**

| File | Responsibility |
|---|---|
| `mobile/src/lib/exerciseMuscles.ts` | Pure: muscle-region join rows → `{name, isPrimary}[]`, primaries first, name order. |
| `mobile/src/lib/workoutHistory.ts` | Pure: completed-session rows → last/first/count/four newest rows; duration text. |
| `mobile/src/lib/supabase/workoutHistory.ts` | The two reads behind the history block. |
| `mobile/src/lib/addWorkoutToDayPlan.ts` | Pure: a day's state → which Add-to-a-day branch, and its confirm copy. |
| `mobile/src/lib/supabase/addWorkoutToDay.ts` | Reads a day's state; re-reads, re-plans, refuses on mismatch, then adopts. |
| `mobile/src/lib/workoutFilterLink.ts` | `workoutFilter` route param: build, parse, merge. |
| `mobile/src/components/training/item-detail/historyStyles.ts` | The history card/segment/stat/link styles both history blocks share. |
| `mobile/src/components/training/workout-detail/WorkoutHero.tsx` | §4.2 hero. |
| `mobile/src/components/training/workout-detail/WorkoutStatRow.tsx` | §4.3 stat row. |
| `mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx` | §4.4 history. |
| `mobile/src/components/training/workout-detail/WorkoutChips.tsx` | §4.5–4.7 role pills, Hits, You'll need. |
| `mobile/src/components/training/workout-detail/FormatBand.tsx` | §4.8 band. |
| `mobile/src/components/training/workout-detail/MovementRow.tsx` | §4.8 row. |
| `mobile/src/components/training/workout-detail/CreatorProtocolRow.tsx` | §4.9 collapsible. |
| `mobile/src/components/training/workout-detail/AddToDayButton.tsx` | §4.10 second action, sheet, date picker. |
| Tests | `mobile/src/lib/__tests__/exerciseMuscles.test.ts`, `workoutFormatBanner.test.ts`, `creatorProfileUrl.test.ts`, `workoutHistory.test.ts`, `addWorkoutToDayPlan.test.ts`, `workoutFilterLink.test.ts` |

**Modified**

| File | Change |
|---|---|
| `mobile/src/types/capture.ts` | `CapturedWorkoutItemEntry` gains optional `imageUrl`, `muscles`. |
| `mobile/src/lib/supabase/capture.ts` | One shared select for both workout reads; it selects `image_url` + muscle regions per item; mapper fills the two fields. |
| `mobile/src/lib/workoutFormat.ts` | `formatBanner()` — badge + gloss. |
| `mobile/src/lib/creatorHandle.ts` | `profileUrl()`. |
| `mobile/src/lib/workoutFilters.ts` | `bandOf` becomes exported `lengthBandOf`. |
| `mobile/src/lib/historyViewStore.ts` | Second store keyed `training.workout.historyView.v1`. |
| `mobile/src/components/training/item-detail/HistoryBlock.tsx` | Imports the shared styles; no visual change. |
| `mobile/app/(tabs)/training/index.tsx` | Accepts `workoutFilter` like `exerciseFilter`. |
| `mobile/src/components/training/daily/WorkoutsTab.tsx` | `initialFilters` / `onInitialFiltersConsumed` props, merged after prefs load. |
| `mobile/app/(tabs)/track/gym-sessions/index.tsx`, `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx` | `workoutId` / `workoutName` scope for "See all N sessions". |
| `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx` | Read view composed from the new components; ⋮ menu; editing branch untouched. |

---

### Task 1: Per-movement thumbnail and muscles on the workout query

**Files:**
- Create: `mobile/src/lib/exerciseMuscles.ts`
- Create: `mobile/src/lib/__tests__/exerciseMuscles.test.ts`
- Modify: `mobile/src/types/capture.ts` (the `CapturedWorkoutItemEntry` interface)
- Modify: `mobile/src/lib/supabase/capture.ts` (`toCapturedWorkoutEntry`, `fetchCapturedWorkouts`, `fetchCapturedWorkout`)

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/exerciseMuscles.test.ts
import { musclesOf } from "../exerciseMuscles";

describe("musclesOf (spec §5.1: primaries first, then secondaries, each in name order)", () => {
  it("orders primaries before secondaries and each group by name", () => {
    expect(musclesOf([
      { is_primary: false, muscle_region: { name: "Triceps" } },
      { is_primary: true, muscle_region: { name: "Shoulders" } },
      { is_primary: false, muscle_region: { name: "Core" } },
      { is_primary: true, muscle_region: { name: "Chest" } },
    ])).toEqual([
      { name: "Chest", isPrimary: true },
      { name: "Shoulders", isPrimary: true },
      { name: "Core", isPrimary: false },
      { name: "Triceps", isPrimary: false },
    ]);
  });

  it("drops rows whose region did not join and treats a null flag as secondary", () => {
    expect(musclesOf([
      { is_primary: null, muscle_region: { name: "Lats" } },
      { is_primary: true, muscle_region: null },
    ])).toEqual([{ name: "Lats", isPrimary: false }]);
  });

  it("is empty for null, undefined, or no rows", () => {
    expect(musclesOf(null)).toEqual([]);
    expect(musclesOf(undefined)).toEqual([]);
    expect(musclesOf([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/exerciseMuscles.test.ts`
Expected: FAIL — `Cannot find module '../exerciseMuscles'`.

- [ ] **Step 3: Write the pure helper**

```ts
// mobile/src/lib/exerciseMuscles.ts
// The exercise_muscle_regions join, shaped for a card or a row: primaries
// first, then secondaries, each group in name order, so the first entry is
// always THE primary and the picture order never depends on insert order.
// Sibling of exerciseEquipment.ts.

export interface MuscleRegionRow {
  is_primary: boolean | null;
  muscle_region: { name: string } | null;
}

export interface ExerciseMuscle {
  name: string;
  isPrimary: boolean;
}

export function musclesOf(rows: MuscleRegionRow[] | null | undefined): ExerciseMuscle[] {
  const out: ExerciseMuscle[] = [];
  for (const r of rows ?? []) {
    const name = r.muscle_region?.name;
    if (!name) continue;
    out.push({ name, isPrimary: r.is_primary === true });
  }
  return out.sort((a, b) =>
    a.isPrimary === b.isPrimary ? a.name.localeCompare(b.name) : a.isPrimary ? -1 : 1,
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/exerciseMuscles.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Add the two fields to the item type**

In `mobile/src/types/capture.ts`, inside `CapturedWorkoutItemEntry`, after the `equipment?: string[];` member add:

```ts
  /** The exercise's own picture, for the movement row thumbnail. Null when it
   *  has none; absent — like `equipment` — when the item was built without
   *  the join (an edit-screen draft). */
  imageUrl?: string | null;
  /** Primaries first, then secondaries, each in name order. Absent when built
   *  without the join. */
  muscles?: { name: string; isPrimary: boolean }[];
```

- [ ] **Step 6: Share one select between the two workout reads and extend it**

In `mobile/src/lib/supabase/capture.ts`, add the import at the top with the other lib imports:

```ts
import { musclesOf } from "../exerciseMuscles";
```

Directly above `export async function fetchCapturedWorkouts(` add:

```ts
/** The one select both workout reads use, so the list and the screen can
 *  never disagree about what an item carries. Per-item `image_url` and
 *  muscle regions feed the movement rows on the workout page. */
const CAPTURED_WORKOUT_SELECT = `
  id, name, rounds, raw_protocol, description, notes, created_at,
  block_roles, est_minutes, intensity, skill_level, classified_at,
  format, score_type, format_minutes,
  wmuscles:captured_workout_muscles(is_primary, muscle_region:muscle_regions(name)),
  source:captured_sources!inner(
    id, platform, source_url, poster_handle, thumbnail_url, caption_text,
    extraction_status
  ),
  items:captured_workout_exercises(
    exercise_order, target_sets, target_reps, target_weight,
    target_duration, rest_seconds, notes,
    exercise:exercises(
      id, name, image_url, core_default_equipment,
      equipment_rows:exercise_equipment(equipment(name)),
      muscle_rows:exercise_muscle_regions(is_primary, muscle_region:muscle_regions(name))
    )
  )
`;
```

In `fetchCapturedWorkouts`, replace the whole template string passed to `.select(\`…\`)` with `.select(CAPTURED_WORKOUT_SELECT)`. Do the same in `fetchCapturedWorkout`. Both bodies otherwise stay as they are.

- [ ] **Step 7: Fill the two fields in the mapper**

In `toCapturedWorkoutEntry`, the `.map((it: any) => ({ … }))` builds each item. After the existing `equipment: it.exercise ? equipmentNamesOf(it.exercise) : undefined,` line add:

```ts
      imageUrl: it.exercise ? (it.exercise.image_url ?? null) : undefined,
      muscles: it.exercise ? musclesOf(it.exercise.muscle_rows) : undefined,
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Reminder: the client is untyped, so a wrong column name in the select would only surface on device — Task 17 covers it.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/exerciseMuscles.ts src/lib/__tests__/exerciseMuscles.test.ts src/types/capture.ts src/lib/supabase/capture.ts
git commit -m "feat(workouts): movement rows carry the exercise picture and muscles

One shared select for both captured-workout reads; each item now joins
image_url and muscle regions so the workout page can draw the row.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Format badge and gloss

**Files:**
- Modify: `mobile/src/lib/workoutFormat.ts`
- Create: `mobile/src/lib/__tests__/workoutFormatBanner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/workoutFormatBanner.test.ts
import { formatBanner } from "../workoutFormat";
import type { HeadlineShape } from "../workoutFormat";

const shape = (o: Partial<HeadlineShape>): HeadlineShape => ({ format: null, formatMinutes: null, scoreType: null, ...o });

describe("formatBanner (spec §5.2: the hero badge and the list band say the same thing)", () => {
  it("AMRAP with and without minutes", () => {
    expect(formatBanner(null, shape({ format: "amrap", formatMinutes: 15 })))
      .toEqual({ badge: "AMRAP · 15 MIN", gloss: "As many rounds as possible in 15 minutes" });
    expect(formatBanner(null, shape({ format: "amrap" })))
      .toEqual({ badge: "AMRAP", gloss: "As many rounds as possible" });
  });

  it("EMOM with and without minutes", () => {
    expect(formatBanner(null, shape({ format: "emom", formatMinutes: 10 })))
      .toEqual({ badge: "EMOM · 10 MIN", gloss: "Every minute on the minute for 10 minutes" });
    expect(formatBanner(null, shape({ format: "emom" })))
      .toEqual({ badge: "EMOM", gloss: "Every minute on the minute" });
  });

  it("for time, with rounds and with a cap", () => {
    expect(formatBanner("3", shape({ format: "for_time" })))
      .toEqual({ badge: "3 ROUNDS · FOR TIME", gloss: "Repeat the whole list 3 times, as fast as you can" });
    expect(formatBanner(null, shape({ format: "for_time", formatMinutes: 20 })))
      .toEqual({ badge: "FOR TIME", gloss: "As fast as you can, 20 minute cap" });
    expect(formatBanner(null, shape({ format: "for_time" })))
      .toEqual({ badge: "FOR TIME", gloss: "As fast as you can" });
  });

  it("rounds keeps the creator's text and pluralises 1", () => {
    expect(formatBanner("3-4", shape({ format: "rounds" })))
      .toEqual({ badge: "3-4 ROUNDS", gloss: "Repeat the whole list 3-4 times" });
    expect(formatBanner("1", shape({ format: "rounds" })))
      .toEqual({ badge: "1 ROUND", gloss: "Repeat the whole list 1 time" });
    expect(formatBanner(null, shape({ format: "rounds" })))
      .toEqual({ badge: "ROUNDS", gloss: "Repeat the whole list" });
  });

  it("intervals, chipper, ladder", () => {
    expect(formatBanner(null, shape({ format: "intervals", formatMinutes: 30 })))
      .toEqual({ badge: "INTERVALS · 30 MIN", gloss: "Work and rest on the clock" });
    expect(formatBanner(null, shape({ format: "intervals" })))
      .toEqual({ badge: "INTERVALS", gloss: "Work and rest on the clock" });
    expect(formatBanner(null, shape({ format: "chipper" })))
      .toEqual({ badge: "CHIPPER", gloss: "Work through the list once, top to bottom" });
    expect(formatBanner(null, shape({ format: "ladder" })))
      .toEqual({ badge: "LADDER", gloss: "Reps climb (or fall) each round" });
  });

  it("sets & reps, with and without a repeat", () => {
    expect(formatBanner("3", shape({ format: "sets_reps" })))
      .toEqual({ badge: "SETS & REPS · 3 ROUNDS", gloss: "Sets and reps, rest as needed; repeat the list 3 times" });
    expect(formatBanner(null, shape({ format: "sets_reps" })))
      .toEqual({ badge: "SETS & REPS", gloss: "Sets and reps, rest as needed" });
  });

  it("untagged: rounds alone still frame the list; nothing at all is null", () => {
    expect(formatBanner("4", shape({})))
      .toEqual({ badge: "4 ROUNDS", gloss: "Repeat the whole list 4 times" });
    expect(formatBanner(null, shape({}))).toBeNull();
  });

  it("zero minutes reads as unstated", () => {
    expect(formatBanner(null, shape({ format: "amrap", formatMinutes: 0 })))
      .toEqual({ badge: "AMRAP", gloss: "As many rounds as possible" });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/workoutFormatBanner.test.ts`
Expected: FAIL — `formatBanner is not a function` (or not exported).

- [ ] **Step 3: Implement**

Append to the end of `mobile/src/lib/workoutFormat.ts`:

```ts
/** The workout page's format, in two registers: the badge on the hero and
 *  the band over the list (uppercase, the component letter-spaces it), and a
 *  plain-English gloss under the band so AMRAP / EMOM / chipper explain
 *  themselves. One function, two callers, so they can never disagree.
 *  Spec 2026-09-13 §5.2. */
export interface FormatBanner {
  badge: string;
  gloss: string;
}

const ROUNDS_UPPER = (rounds: string): string => `${rounds} ROUND${rounds === "1" ? "" : "S"}`;
const TIMES = (rounds: string): string => `${rounds} time${rounds === "1" ? "" : "s"}`;

export function formatBanner(rounds: string | null, s: HeadlineShape): FormatBanner | null {
  // Zero reads as unstated: no format is built on zero minutes.
  const min = s.formatMinutes || null;
  switch (s.format) {
    case null:
      return rounds
        ? { badge: ROUNDS_UPPER(rounds), gloss: `Repeat the whole list ${TIMES(rounds)}` }
        : null;
    case "amrap":
      return {
        badge: min ? `AMRAP · ${min} MIN` : "AMRAP",
        gloss: `As many rounds as possible${min ? ` in ${min} minutes` : ""}`,
      };
    case "emom":
      return {
        badge: min ? `EMOM · ${min} MIN` : "EMOM",
        gloss: `Every minute on the minute${min ? ` for ${min} minutes` : ""}`,
      };
    case "for_time":
      return rounds
        ? { badge: `${ROUNDS_UPPER(rounds)} · FOR TIME`, gloss: `Repeat the whole list ${TIMES(rounds)}, as fast as you can` }
        : { badge: "FOR TIME", gloss: `As fast as you can${min ? `, ${min} minute cap` : ""}` };
    case "rounds":
      return rounds
        ? { badge: ROUNDS_UPPER(rounds), gloss: `Repeat the whole list ${TIMES(rounds)}` }
        : { badge: "ROUNDS", gloss: "Repeat the whole list" };
    case "intervals":
      return { badge: min ? `INTERVALS · ${min} MIN` : "INTERVALS", gloss: "Work and rest on the clock" };
    case "chipper":
      return { badge: "CHIPPER", gloss: "Work through the list once, top to bottom" };
    case "ladder":
      return { badge: "LADDER", gloss: "Reps climb (or fall) each round" };
    case "sets_reps":
      return rounds
        ? { badge: `SETS & REPS · ${ROUNDS_UPPER(rounds)}`, gloss: `Sets and reps, rest as needed; repeat the list ${TIMES(rounds)}` }
        : { badge: "SETS & REPS", gloss: "Sets and reps, rest as needed" };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/workoutFormatBanner.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/workoutFormat.ts src/lib/__tests__/workoutFormatBanner.test.ts
git commit -m "feat(workouts): format badge and gloss for the workout page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Creator profile URL

**Files:**
- Modify: `mobile/src/lib/creatorHandle.ts`
- Create: `mobile/src/lib/__tests__/creatorProfileUrl.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/creatorProfileUrl.test.ts
import { profileUrl } from "../creatorHandle";

describe("profileUrl (spec §5.4)", () => {
  it("instagram, with and without the @", () => {
    expect(profileUrl("instagram", "@kingdomkettlebells")).toBe("https://www.instagram.com/kingdomkettlebells/");
    expect(profileUrl("instagram", "KingdomKettlebells")).toBe("https://www.instagram.com/kingdomkettlebells/");
  });
  it("tiktok", () => {
    expect(profileUrl("tiktok", "@melt.programming")).toBe("https://www.tiktok.com/@melt.programming");
  });
  it("null for another platform, an empty handle, or junk", () => {
    expect(profileUrl("other", "someone")).toBeNull();
    expect(profileUrl("instagram", null)).toBeNull();
    expect(profileUrl("instagram", "")).toBeNull();
    expect(profileUrl("instagram", "not a handle!")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/creatorProfileUrl.test.ts`
Expected: FAIL — `profileUrl is not a function`.

- [ ] **Step 3: Implement**

Append to `mobile/src/lib/creatorHandle.ts`, directly after `avatarUri`:

```ts
/** Where the creator lives on their platform. Built from the handle — the
 *  creators table stores an avatar, not a profile link. Null for a platform
 *  we cannot address or a handle that is not one (spec 2026-09-13 §5.4). */
export function profileUrl(platform: string, handle: string | null): string | null {
  const h = normaliseHandle(handle ?? "");
  if (!h) return null;
  if (platform === "instagram") return `https://www.instagram.com/${h}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${h}`;
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/creatorProfileUrl.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/creatorHandle.ts src/lib/__tests__/creatorProfileUrl.test.ts
git commit -m "feat(creators): profile URL from a handle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Workout history — pure shaping and the read

**Files:**
- Create: `mobile/src/lib/workoutHistory.ts`
- Create: `mobile/src/lib/__tests__/workoutHistory.test.ts`
- Create: `mobile/src/lib/supabase/workoutHistory.ts`
- Modify: `mobile/src/lib/historyViewStore.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/workoutHistory.test.ts
import { summarizeWorkoutHistory, formatDuration, SESSION_ROWS } from "../workoutHistory";
import type { WorkoutSessionRow } from "../workoutHistory";

const row = (date: string, o: Partial<WorkoutSessionRow> = {}): WorkoutSessionRow =>
  ({ sessionId: `s-${date}`, sessionDate: date, durationSeconds: null, ...o });

describe("summarizeWorkoutHistory (spec §4.4, §5.5)", () => {
  it("null when never done", () => {
    expect(summarizeWorkoutHistory([])).toBeNull();
  });

  it("one session: count 1, first and last the same day, one row", () => {
    expect(summarizeWorkoutHistory([row("2026-09-01")])).toEqual({
      count: 1, lastDate: "2026-09-01", firstDate: "2026-09-01",
      rows: [row("2026-09-01")],
    });
  });

  it("five sessions in any order: newest first, four rows, count 5", () => {
    const s = summarizeWorkoutHistory([
      row("2026-09-03"), row("2026-08-01"), row("2026-09-10"), row("2026-08-20"), row("2026-09-05"),
    ]);
    expect(s?.count).toBe(5);
    expect(s?.lastDate).toBe("2026-09-10");
    expect(s?.firstDate).toBe("2026-08-01");
    expect(s?.rows.map((r) => r.sessionDate)).toEqual(["2026-09-10", "2026-09-05", "2026-09-03", "2026-08-20"]);
    expect(s?.rows.length).toBe(SESSION_ROWS);
  });

  it("does not mutate its input", () => {
    const input = [row("2026-09-01"), row("2026-09-02")];
    summarizeWorkoutHistory(input);
    expect(input.map((r) => r.sessionDate)).toEqual(["2026-09-01", "2026-09-02"]);
  });
});

describe("formatDuration", () => {
  it("whole minutes, rounded; null when unknown or zero", () => {
    expect(formatDuration(1080)).toBe("18 min");
    expect(formatDuration(1100)).toBe("18 min");
    expect(formatDuration(59)).toBe("1 min");
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/workoutHistory.test.ts`
Expected: FAIL — `Cannot find module '../workoutHistory'`.

- [ ] **Step 3: Write the pure module**

```ts
// mobile/src/lib/workoutHistory.ts
// "Your history" on the workout page, shaped from the reader's completed
// sessions of this one workout. Pure: supabase/workoutHistory.ts owns the
// read, WorkoutHistoryBlock owns the pixels. No score yet — that lands with
// session-end score capture (spec 2026-09-13 §10) and lights up Best + trend.

export interface WorkoutSessionRow {
  /** The Track session (workout_sessions.id) to open; null when the completed
   *  day has no Track row to show, so the row draws but does not open. */
  sessionId: string | null;
  /** YYYY-MM-DD, local. */
  sessionDate: string;
  durationSeconds: number | null;
}

export interface WorkoutHistorySummary {
  count: number;
  lastDate: string;
  firstDate: string;
  /** Newest first, at most SESSION_ROWS. */
  rows: WorkoutSessionRow[];
}

/** At most this many rows in the Sessions view — the exercise page's rule. */
export const SESSION_ROWS = 4;

/** Null when never done: the block draws its "not yet" card, never zeros. */
export function summarizeWorkoutHistory(rows: WorkoutSessionRow[]): WorkoutHistorySummary | null {
  if (rows.length === 0) return null;
  // YYYY-MM-DD compares correctly as a string.
  const sorted = [...rows].sort((a, b) => (a.sessionDate < b.sessionDate ? 1 : a.sessionDate > b.sessionDate ? -1 : 0));
  return {
    count: sorted.length,
    lastDate: sorted[0].sessionDate,
    firstDate: sorted[sorted.length - 1].sessionDate,
    rows: sorted.slice(0, SESSION_ROWS),
  };
}

/** "18 min"; null when there is nothing honest to say. */
export function formatDuration(seconds: number | null): string | null {
  if (seconds === null || seconds <= 0) return null;
  return `${Math.max(1, Math.round(seconds / 60))} min`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/workoutHistory.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the read**

```ts
// mobile/src/lib/supabase/workoutHistory.ts
// The reader's completed sessions of ONE captured workout, for the workout
// page's history block. Counted the way fetchWorkoutCompletions counts: a
// completed generated_session whose served_captured_workout_id is this
// workout — a day that WAS this workout, served whole. A day where it was
// one block inside a composed session is deliberately not this workout.
//
// Two reads rather than one nested filter: the Track session (the row the
// history opens, and the duration it shows) hangs off the same
// workout_instance the generated session does, and joining through it
// with a filter on the far side is the kind of PostgREST shape that works
// until it doesn't. Empty on error — the block fails closed to "not yet".
import { supabase } from "../supabase";
import type { WorkoutSessionRow } from "../workoutHistory";

export async function fetchWorkoutHistory(userId: string, workoutId: string): Promise<WorkoutSessionRow[]> {
  const { data: gens, error } = await supabase
    .from("generated_sessions")
    .select("id, session_date, workout_instance_id")
    .eq("user_id", userId)
    .eq("status", "completed")
    .eq("served_captured_workout_id", workoutId);
  if (error) {
    console.error("fetchWorkoutHistory failed:", error.message, error.details ?? "");
    return [];
  }
  const rows = (gens ?? []) as { id: string; session_date: string; workout_instance_id: string | null }[];
  const instanceIds = rows.map((g) => g.workout_instance_id).filter((v): v is string => !!v);

  const byInstance = new Map<string, { id: string; durationSeconds: number | null }>();
  if (instanceIds.length > 0) {
    const { data: sessions, error: sError } = await supabase
      .from("workout_sessions")
      .select("id, workout_instance_id, duration_seconds")
      .eq("user_id", userId)
      .in("workout_instance_id", instanceIds);
    if (sError) {
      // The days still count; only the tap-through and the minutes are lost.
      console.error("fetchWorkoutHistory sessions failed:", sError.message, sError.details ?? "");
    }
    for (const s of (sessions ?? []) as { id: string; workout_instance_id: string; duration_seconds: number | null }[]) {
      // Keep the first row per instance; a second session on one instance is
      // a re-run and the earliest is the one the day was completed on.
      if (!byInstance.has(s.workout_instance_id)) {
        byInstance.set(s.workout_instance_id, { id: s.id, durationSeconds: s.duration_seconds ?? null });
      }
    }
  }

  return rows
    .filter((g) => !!g.session_date)
    .map((g) => {
      const track = g.workout_instance_id ? byInstance.get(g.workout_instance_id) : undefined;
      return {
        sessionId: track?.id ?? null,
        sessionDate: g.session_date,
        durationSeconds: track?.durationSeconds ?? null,
      };
    });
}
```

- [ ] **Step 6: Add the workout history-view store**

In `mobile/src/lib/historyViewStore.ts`, append after the existing three exports:

```ts
/** The workout page's own copy of the choice (spec 2026-09-13 §7): a reader
 *  who likes Sessions on exercises need not like it on workouts. */
const workoutStore = createPrefsStore<HistoryViewPrefs>({
  keyPrefix: "training.workout.historyView.v1",
  defaults: { view: "trend" },
  sanitize: sanitizeHistoryView,
});

export const workoutHistoryViewKey = workoutStore.key;
export const loadWorkoutHistoryView = workoutStore.load;
export const saveWorkoutHistoryView = workoutStore.save;
```

- [ ] **Step 7: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/workoutHistory.ts src/lib/__tests__/workoutHistory.test.ts src/lib/supabase/workoutHistory.ts src/lib/historyViewStore.ts
git commit -m "feat(workouts): history summary and read for the workout page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Add to a day — planner and executor

**Files:**
- Create: `mobile/src/lib/addWorkoutToDayPlan.ts`
- Create: `mobile/src/lib/__tests__/addWorkoutToDayPlan.test.ts`
- Create: `mobile/src/lib/supabase/addWorkoutToDay.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/addWorkoutToDayPlan.test.ts
import { planAddToDay, ADD_TO_DAY_LABEL } from "../addWorkoutToDayPlan";
import type { DayState } from "../addWorkoutToDayPlan";

const state = (o: Partial<DayState>): DayState => ({ kind: "none", servesThisWorkout: false, ...o });

describe("planAddToDay (spec §4.10, one case per branch)", () => {
  it("no session: adopt, no confirm", () => {
    expect(planAddToDay(state({}), "Tomorrow")).toEqual({ action: "adopt", label: ADD_TO_DAY_LABEL, confirm: null });
  });

  it("pending session: confirm replace, naming the day", () => {
    const p = planAddToDay(state({ kind: "pending" }), "Tuesday");
    expect(p.action).toBe("confirmReplace");
    expect(p.confirm).toEqual({
      title: "Tuesday already has a session planned.",
      body: "It'll be set aside and this workout takes its place.",
      go: "Replace",
    });
  });

  it("in progress today: confirm replace with the partway wording", () => {
    const p = planAddToDay(state({ kind: "inProgress" }), "Today");
    expect(p.action).toBe("confirmReplace");
    expect(p.confirm?.body).toBe("You're partway through it — what you've logged is kept, and this workout takes the rest of the day.");
  });

  it("completed: a second session, no confirm", () => {
    expect(planAddToDay(state({ kind: "completed" }), "Today")).toEqual({ action: "addSecond", label: ADD_TO_DAY_LABEL, confirm: null });
  });

  it("rested: confirm un-rest", () => {
    const p = planAddToDay(state({ kind: "rested" }), "Sunday");
    expect(p.action).toBe("confirmUnrest");
    expect(p.confirm).toEqual({
      title: "Sunday is a rest day.",
      body: "Adding this makes it a training day.",
      go: "Add anyway",
    });
  });

  it("the day's pending or live session is already this workout: disabled, with the day named", () => {
    expect(planAddToDay(state({ kind: "pending", servesThisWorkout: true }), "Today"))
      .toEqual({ action: "disabled", label: "Today is already this workout", confirm: null });
    expect(planAddToDay(state({ kind: "inProgress", servesThisWorkout: true }), "Today").action).toBe("disabled");
  });

  it("a completed session of this workout does not disable — you can do it again", () => {
    expect(planAddToDay(state({ kind: "completed", servesThisWorkout: true }), "Today").action).toBe("addSecond");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/addWorkoutToDayPlan.test.ts`
Expected: FAIL — `Cannot find module '../addWorkoutToDayPlan'`.

- [ ] **Step 3: Write the planner**

```ts
// mobile/src/lib/addWorkoutToDayPlan.ts
// Which branch "Add to a day" takes, from the chosen day's state. Pure: the
// writer (supabase/addWorkoutToDay.ts) re-reads the day right before it
// writes and asks this again, so a stale sheet can never write the wrong
// shape. Sibling of addToTodayPlan.ts, for a whole workout on any day.
// Spec 2026-09-13 §4.10, §5.6.
export type DayKind = "none" | "pending" | "inProgress" | "completed" | "rested";

export interface DayState {
  kind: DayKind;
  /** The day's pending or live session is this very workout served whole. */
  servesThisWorkout: boolean;
}

export type AddToDayAction =
  | "adopt"          // nothing on the day: adopt it
  | "confirmReplace" // a planned or live session: ask, then adopt (the old one is marked skipped)
  | "confirmUnrest"  // a declared rest day: ask, then adopt (the rest row is removed)
  | "addSecond"      // the day is done: adopt as a second session, no ask
  | "disabled";      // already this workout, pending or live

export interface Confirm {
  title: string;
  body: string;
  go: string;
}

export interface AddToDayPlan {
  action: AddToDayAction;
  label: string;
  confirm: Confirm | null;
}

export const ADD_TO_DAY_LABEL = "Add to a day";

/** `dayLabel` is how the sheet names the day: "Today", "Tomorrow", "Tuesday", "14 Sep". */
export function planAddToDay(state: DayState, dayLabel: string): AddToDayPlan {
  if (state.servesThisWorkout && (state.kind === "pending" || state.kind === "inProgress")) {
    return { action: "disabled", label: `${dayLabel} is already this workout`, confirm: null };
  }
  switch (state.kind) {
    case "none":
      return { action: "adopt", label: ADD_TO_DAY_LABEL, confirm: null };
    case "pending":
      return {
        action: "confirmReplace", label: ADD_TO_DAY_LABEL,
        confirm: {
          title: `${dayLabel} already has a session planned.`,
          body: "It'll be set aside and this workout takes its place.",
          go: "Replace",
        },
      };
    case "inProgress":
      return {
        action: "confirmReplace", label: ADD_TO_DAY_LABEL,
        confirm: {
          title: `${dayLabel} already has a session planned.`,
          body: "You're partway through it — what you've logged is kept, and this workout takes the rest of the day.",
          go: "Replace",
        },
      };
    case "completed":
      return { action: "addSecond", label: ADD_TO_DAY_LABEL, confirm: null };
    case "rested":
      return {
        action: "confirmUnrest", label: ADD_TO_DAY_LABEL,
        confirm: {
          title: `${dayLabel} is a rest day.`,
          body: "Adding this makes it a training day.",
          go: "Add anyway",
        },
      };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/addWorkoutToDayPlan.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the executor**

```ts
// mobile/src/lib/supabase/addWorkoutToDay.ts
// Reads a day the way addToToday.ts reads today, and executes an
// AddToDayPlan by adopting the workout for that date — the same write Start
// does, without the hand-off to the live screen. The morning draft leaves a
// user_pick session alone (composeDay), so a future date survives.
// Spec 2026-09-13 §4.10, §5.6.
import { adoptCapturedWorkout, fetchTodaySessionStrict } from "./daily";
import { planAddToDay } from "../addWorkoutToDayPlan";
import type { AddToDayPlan, DayState } from "../addWorkoutToDayPlan";

/** The chosen day's state. Throws on a query failure rather than reporting
 *  "none", so a day that could not be read is never written to. */
export async function readDayState(userId: string, workoutId: string, date: string): Promise<DayState> {
  const session = await fetchTodaySessionStrict(userId, date);
  if (!session) return { kind: "none", servesThisWorkout: false };
  const servesThisWorkout = session.servedCapturedWorkoutId === workoutId;
  if (session.status === "rested") return { kind: "rested", servesThisWorkout: false };
  if (session.status === "completed") return { kind: "completed", servesThisWorkout };
  if (session.status === "accepted" && session.workoutInstanceId) return { kind: "inProgress", servesThisWorkout };
  return { kind: "pending", servesThisWorkout };
}

export type AddToDayResult =
  | { ok: true; sessionId: string }
  | { ok: false; message: string };

export interface AddToDayInput {
  userId: string;
  workoutId: string;
  /** YYYY-MM-DD, the day being written. */
  date: string;
  dayLabel: string;
  /** The plan the user confirmed. A confirm* action here means they said go. */
  plan: AddToDayPlan;
}

/** Re-reads the day and re-plans; the fresh state must plan the same action
 *  the user confirmed, or the write is refused. */
export async function executeAddToDay(input: AddToDayInput): Promise<AddToDayResult> {
  try {
    const fresh = await readDayState(input.userId, input.workoutId, input.date);
    const plan = planAddToDay(fresh, input.dayLabel);
    if (plan.action !== input.plan.action) {
      return { ok: false, message: "That day changed since this page opened. Try again." };
    }
    if (plan.action === "disabled") {
      return { ok: false, message: plan.label };
    }
    const sessionId = await adoptCapturedWorkout({
      userId: input.userId,
      capturedWorkoutId: input.workoutId,
      date: input.date,
    });
    if (!sessionId) return { ok: false, message: "Couldn't add it. Try again." };
    return { ok: true, sessionId };
  } catch (e) {
    console.error("executeAddToDay failed:", e);
    return { ok: false, message: "Couldn't add it. Try again." };
  }
}
```

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/addWorkoutToDayPlan.ts src/lib/__tests__/addWorkoutToDayPlan.test.ts src/lib/supabase/addWorkoutToDay.ts
git commit -m "feat(workouts): plan and execute adding a workout to a day

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: `workoutFilter` route param — link module, tab, and route

**Files:**
- Modify: `mobile/src/lib/workoutFilters.ts` (export the band function)
- Create: `mobile/src/lib/workoutFilterLink.ts`
- Create: `mobile/src/lib/__tests__/workoutFilterLink.test.ts`
- Modify: `mobile/app/(tabs)/training/index.tsx`
- Modify: `mobile/src/components/training/daily/WorkoutsTab.tsx`

- [ ] **Step 1: Export the length band function**

In `mobile/src/lib/workoutFilters.ts`, change the private function

```ts
function bandOf(minutes: number): LengthBand | null {
```

to

```ts
export function lengthBandOf(minutes: number): LengthBand | null {
```

and rename its uses inside the file (`bandOf(` → `lengthBandOf(`). Run `grep -n "bandOf" src/lib/workoutFilters.ts` and confirm only `lengthBandOf` remains.

- [ ] **Step 2: Write the failing test**

```ts
// mobile/src/lib/__tests__/workoutFilterLink.test.ts
import { workoutFilterParam, parseWorkoutFilterParam, mergeWorkoutFilters } from "../workoutFilterLink";
import { EMPTY_FILTERS } from "../../types/workoutFilters";

describe("workoutFilter param (spec §4.3, §6)", () => {
  it("round-trips every axis a chip can name", () => {
    const link = {
      muscles: ["Core"], equipment: ["Kettlebell"], blockRoles: ["main" as const],
      formats: ["amrap" as const], scores: ["rounds_reps" as const],
      intensity: "high" as const, lengths: ["short" as const], skills: ["Intermediate" as const],
    };
    expect(parseWorkoutFilterParam(workoutFilterParam(link))).toEqual(link);
  });

  it("drops values the model cannot represent and returns null when nothing survives", () => {
    expect(parseWorkoutFilterParam(JSON.stringify({ muscles: ["Wings"], intensity: "extreme", formats: ["yoga"] }))).toBeNull();
    expect(parseWorkoutFilterParam(JSON.stringify({ muscles: ["Wings", "Quads"] }))).toEqual({ muscles: ["Quads"] });
  });

  it("null for junk", () => {
    expect(parseWorkoutFilterParam("")).toBeNull();
    expect(parseWorkoutFilterParam("{not json")).toBeNull();
    expect(parseWorkoutFilterParam(42)).toBeNull();
    expect(parseWorkoutFilterParam(JSON.stringify([1, 2]))).toBeNull();
  });

  it("merges onto saved filters without duplicates; intensity replaces", () => {
    const base = { ...EMPTY_FILTERS, muscles: ["Core"], intensity: "low" as const };
    const next = mergeWorkoutFilters(base, { muscles: ["Core", "Quads"], intensity: "high" });
    expect(next.muscles).toEqual(["Core", "Quads"]);
    expect(next.intensity).toBe("high");
    expect(next.history).toBe("any");
    expect(next).not.toBe(base);
    expect(base.muscles).toEqual(["Core"]);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx jest src/lib/__tests__/workoutFilterLink.test.ts`
Expected: FAIL — `Cannot find module '../workoutFilterLink'`.

- [ ] **Step 4: Write the link module**

```ts
// mobile/src/lib/workoutFilterLink.ts
// A stat cell, a role pill, a muscle chip or an equipment tile on the
// workout page opens the Workouts tab with that ONE value applied on top of
// the reader's saved filters (spec 2026-09-13 §4.3–4.7). The value rides
// the route as JSON in the `workoutFilter` param; the tab consumes and
// clears it like `shareUrl`. Mirror of exerciseFilterLink.ts.
import type { WorkoutFilters } from "../types/workoutFilters";
import { FILTERABLE_ROLES, ALL_INTENSITIES, ALL_SKILLS, LENGTH_BANDS } from "../types/workoutFilters";
import { ALL_FORMATS, ALL_SCORES } from "./workoutFormatVocab";
import { MUSCLE_GROUPS } from "./dailyCoverage";
import { strings, oneOf, manyOf } from "./filterPrefsStore";

export const WORKOUT_FILTER_PARAM = "workoutFilter";

/** The axes a chip can name. Creators and history are not linked from the page. */
export type WorkoutFilterLink = Partial<Pick<WorkoutFilters,
  "muscles" | "equipment" | "blockRoles" | "formats" | "scores" | "intensity" | "lengths" | "skills">>;

const KNOWN_MUSCLES = new Set(MUSCLE_GROUPS.flatMap((g) => g.muscles));

export function workoutFilterParam(link: WorkoutFilterLink): string {
  return JSON.stringify(link);
}

/** Null means "open the tab with no extra filter" — junk, or values the
 *  filter model cannot represent. */
export function parseWorkoutFilterParam(raw: unknown): WorkoutFilterLink | null {
  if (typeof raw !== "string" || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const r = parsed as Record<string, unknown>;
  const link: WorkoutFilterLink = {};
  const muscles = strings(r.muscles).filter((m) => KNOWN_MUSCLES.has(m));
  const equipment = strings(r.equipment);
  const blockRoles = manyOf(r.blockRoles, FILTERABLE_ROLES);
  const formats = manyOf(r.formats, [...ALL_FORMATS, "untagged"] as const);
  const scores = manyOf(r.scores, ALL_SCORES);
  const intensity = oneOf(r.intensity, ALL_INTENSITIES);
  const lengths = manyOf(r.lengths, LENGTH_BANDS.map((b) => b.band));
  const skills = manyOf(r.skills, ALL_SKILLS);
  if (muscles.length > 0) link.muscles = muscles;
  if (equipment.length > 0) link.equipment = equipment;
  if (blockRoles.length > 0) link.blockRoles = blockRoles;
  if (formats.length > 0) link.formats = formats;
  if (scores.length > 0) link.scores = scores;
  if (intensity !== null) link.intensity = intensity;
  if (lengths.length > 0) link.lengths = lengths;
  if (skills.length > 0) link.skills = skills;
  return Object.keys(link).length > 0 ? link : null;
}

const union = <T>(a: T[], b: T[] | undefined): T[] =>
  b ? [...a, ...b.filter((v) => !a.includes(v))] : [...a];

/** Saved filters with the link's values added. Fresh arrays: the result lands in React state. */
export function mergeWorkoutFilters(base: WorkoutFilters, link: WorkoutFilterLink): WorkoutFilters {
  return {
    ...base,
    muscles: union(base.muscles, link.muscles),
    equipment: union(base.equipment, link.equipment),
    blockRoles: union(base.blockRoles, link.blockRoles),
    formats: union(base.formats, link.formats),
    scores: union(base.scores, link.scores),
    intensity: link.intensity ?? base.intensity,
    lengths: union(base.lengths, link.lengths),
    skills: union(base.skills, link.skills),
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest src/lib/__tests__/workoutFilterLink.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Accept the param on the training route**

In `mobile/app/(tabs)/training/index.tsx`:

Add the import next to the `exerciseFilterLink` import:

```ts
import { parseWorkoutFilterParam } from "@/src/lib/workoutFilterLink";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";
```

Extend the params read (the existing `useLocalSearchParams<{ shareUrl?: string; exerciseFilter?: string; openTab?: string; }>()` call) to:

```ts
  const { shareUrl, exerciseFilter, workoutFilter, openTab } = useLocalSearchParams<{
    shareUrl?: string; exerciseFilter?: string; workoutFilter?: string; openTab?: string;
  }>();
```

Directly after the `pendingExerciseFilter` effect (the one that calls `setDailyTab("exercises")`), add:

```ts
  // A chip or stat cell on the workout page: open the Workouts tab with that
  // value on top of the saved filters (spec 2026-09-13 §4.3). Same
  // consume-and-clear discipline as exerciseFilter.
  const [pendingWorkoutFilter, setPendingWorkoutFilter] = useState<WorkoutFilterLink | null>(null);
  useEffect(() => {
    if (typeof workoutFilter !== "string" || workoutFilter === "") return;
    setPendingWorkoutFilter(parseWorkoutFilterParam(workoutFilter));
    setWorkoutMode("daily");
    setDailyTab("workouts");
    router.setParams({ workoutFilter: undefined });
  }, [workoutFilter, router]);
```

In the render `case "workouts":`, pass the two new props:

```tsx
            <DailyWorkoutsTab
              searchQuery={searchQuery}
              onCountUpdate={setCapturedWorkoutsCount}
              shareUrl={pendingShareUrl}
              initialFilters={pendingWorkoutFilter}
              onInitialFiltersConsumed={() => setPendingWorkoutFilter(null)}
            />
```

- [ ] **Step 7: Merge the link in the Workouts tab**

In `mobile/src/components/training/daily/WorkoutsTab.tsx`:

Add the imports beside the other lib imports:

```ts
import { mergeWorkoutFilters } from "@/src/lib/workoutFilterLink";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";
```

Make sure `useRef` is imported from React (add it to the existing `import React, { … } from "react"` if missing).

Extend the props interface:

```ts
interface WorkoutsTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
  /** A URL from the iOS share sheet, passed through to the capture flow. */
  shareUrl?: string | null;
  /** A chip's value from the workout page, merged over the saved filters once prefs resolve. */
  initialFilters?: WorkoutFilterLink | null;
  onInitialFiltersConsumed?: () => void;
}

export default function WorkoutsTab({
  searchQuery, onCountUpdate, shareUrl, initialFilters = null, onInitialFiltersConsumed,
}: WorkoutsTabProps) {
```

Directly after the `applySort` callback, add (this is the exact shape `CatalogTab.tsx` uses):

```ts
  // The chip's value lands through the same "applied change saves" path the
  // sheet uses, after prefs resolve. `latest` sidesteps a stale closure: the
  // effect keys on the link, not on the filters it merges into.
  const latest = useRef({ filters, sort });
  latest.current = { filters, sort };
  useEffect(() => {
    if (!prefsReady || !userId || !initialFilters) return;
    const next = mergeWorkoutFilters(latest.current.filters, initialFilters);
    setFilters(next);
    saveWorkoutPrefs(userId, { filters: next, sort: latest.current.sort });
    onInitialFiltersConsumed?.();
  }, [prefsReady, userId, initialFilters, onInitialFiltersConsumed]);
```

Confirm `prefsReady` and `userId` state already exist in this file (they do — `setPrefsReady(true)` and `setUserId(user.id)` are in `load`). If `useEffect` is not yet imported, add it.

- [ ] **Step 8: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/workoutFilters.ts src/lib/workoutFilterLink.ts src/lib/__tests__/workoutFilterLink.test.ts "app/(tabs)/training/index.tsx" src/components/training/daily/WorkoutsTab.tsx
git commit -m "feat(workouts): workoutFilter route param opens the tab with one value applied

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Share the history card styles

**Files:**
- Create: `mobile/src/components/training/item-detail/historyStyles.ts`
- Modify: `mobile/src/components/training/item-detail/HistoryBlock.tsx`

- [ ] **Step 1: Write the shared styles**

```ts
// mobile/src/components/training/item-detail/historyStyles.ts
// The frame both "Your history" blocks draw — the exercise page's and the
// workout page's — so the two can never drift: section, header + segmented
// toggle, card, stat trio, caption, session rows, and the See-all link.
// What is specific to one block (bars, direction, PR badge, skill footer)
// stays in that block.
import { StyleSheet } from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export const historyStyles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: radii.control, padding: 2 },
  segItem: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.onBrand },
  card: { backgroundColor: colors.surface, borderRadius: radii.row, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  stats: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  stat: { flex: 1 },
  statLabel: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  captionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  caption: { ...typography.caption },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowDate: { fontSize: 14, fontWeight: "600", color: colors.text },
  rowName: { flex: 1, fontSize: 14, color: colors.textMuted },
  rowSet: { fontSize: 14, fontWeight: "600", color: colors.text },
  link: { fontSize: 14, fontWeight: "600", color: colors.brand },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: spacing.md, alignSelf: "flex-start" },
});
```

- [ ] **Step 2: Point HistoryBlock at them**

In `mobile/src/components/training/item-detail/HistoryBlock.tsx`:

Add the import:

```ts
import { historyStyles as h } from "./historyStyles";
```

Delete these keys from the local `styles` StyleSheet (they now live in `historyStyles`): `section`, `headerRow`, `sectionTitle`, `seg`, `segItem`, `segItemOn`, `segText`, `segTextOn`, `card`, `stats`, `stat`, `statLabel`, `statValue`, `captionRow`, `caption`, `row`, `rowBorder`, `rowDate`, `rowName`, `rowSet`, `link`, `seeAll`. Keep `bars`, `barSlot`, `bar`, `barBest`, `direction`, `directionText`, `directionDown`, `pr`, `prText`, `footer`, `footerText`, `footerStrong`.

In the JSX, replace every `styles.<deleted key>` with `h.<key>` — e.g. `style={styles.section}` → `style={h.section}`, `[styles.segItem, on && styles.segItemOn]` → `[h.segItem, on && h.segItemOn]`, `styles.link` → `h.link` (both uses), `styles.seeAll` → `h.seeAll`. The `typography` import becomes unused in this file once `statLabel`/`caption` move — remove it from the import line if `tsc`/eslint flags it.

- [ ] **Step 3: Verify nothing changed visually and commit**

Run: `npx tsc --noEmit && npx eslint src/components/training/item-detail/HistoryBlock.tsx`
Expected: no errors, no new warnings. (Visual check comes with the device pass in Task 17 — open any exercise with history.)

```bash
git add src/components/training/item-detail/historyStyles.ts src/components/training/item-detail/HistoryBlock.tsx
git commit -m "refactor(exercises): share the history card styles

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: WorkoutHero

**Files:**
- Create: `mobile/src/components/training/workout-detail/WorkoutHero.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/workout-detail/WorkoutHero.tsx
// The top of the workout page (spec 2026-09-13 §4.2): the post's thumbnail,
// the format badge top-left, a play glyph, and the title + creator byline
// over a gradient at the bottom. The whole hero opens the post; the byline
// inside it opens the creator's profile. No thumbnail: a flat surface with
// the same text in the same places, and no tap.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Play, ExternalLink } from "lucide-react-native";
import { colors, spacing, tint } from "@/src/theme/tokens";
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import type { CapturePlatform } from "@/src/types/capture";

const HERO_HEIGHT = 230;

const PLATFORM_NAME: Record<CapturePlatform, string | null> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  other: null,
};

interface WorkoutHeroProps {
  name: string;
  thumbnailUrl: string | null;
  /** From formatBanner(); null hides the badge. */
  badge: string | null;
  platform: CapturePlatform | null;
  handle: string | null;
  avatarUrl: string | null;
  avatarFetchedAt: string | null;
  /** Null when there is no post to open (no thumbnail, or no source). */
  onOpenPost: (() => void) | null;
  /** Null hides the byline's link affordance; the byline still shows the handle. */
  onOpenProfile: (() => void) | null;
}

export function WorkoutHero({
  name, thumbnailUrl, badge, platform, handle, avatarUrl, avatarFetchedAt, onOpenPost, onOpenProfile,
}: WorkoutHeroProps) {
  const platformName = platform ? PLATFORM_NAME[platform] : null;

  const byline = handle ? (
    <TouchableOpacity
      style={styles.byline}
      onPress={onOpenProfile ?? undefined}
      disabled={!onOpenProfile}
      activeOpacity={0.7}
      accessibilityRole={onOpenProfile ? "link" : "text"}
      accessibilityLabel={onOpenProfile ? `Open ${handle} on ${platformName ?? "their platform"}` : handle}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <CreatorAvatar handle={handle} url={avatarUrl} fetchedAt={avatarFetchedAt} size={24} />
      <Text style={styles.handle} numberOfLines={1}>{handle.startsWith("@") ? handle : `@${handle}`}</Text>
      {platformName && <Text style={styles.platform}>· {platformName}</Text>}
      {onOpenProfile && <ExternalLink size={12} color={colors.textMuted} />}
    </TouchableOpacity>
  ) : null;

  const text = (
    <View style={styles.overlay}>
      {/* Two lines: a long title ellipsises rather than climbing over the play glyph. */}
      <Text style={[styles.title, !thumbnailUrl && styles.titleFlat]} numberOfLines={2}>{name}</Text>
      {byline}
    </View>
  );

  if (!thumbnailUrl) {
    return (
      <View style={[styles.hero, styles.flat]}>
        {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
        {text}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.hero}
      onPress={onOpenPost ?? undefined}
      disabled={!onOpenPost}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel="Open the original post"
    >
      <Image source={{ uri: thumbnailUrl }} style={styles.image} resizeMode="cover" />
      <LinearGradient
        colors={[tint(colors.shadow, 0.25), tint(colors.shadow, 0), colors.bg]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
      {onOpenPost && (
        <View style={styles.play} pointerEvents="none">
          <Play size={20} color={colors.bg} fill={colors.bg} />
        </View>
      )}
      {text}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: { position: "relative", width: "100%", height: HERO_HEIGHT, backgroundColor: colors.surface, overflow: "hidden" },
  flat: { borderBottomWidth: 1, borderBottomColor: colors.border },
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: HERO_HEIGHT },
  badge: {
    position: "absolute", top: spacing.md, left: spacing.md,
    backgroundColor: colors.brand, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5,
  },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.bg },
  play: {
    position: "absolute", left: "50%", top: "42%", marginLeft: -22, marginTop: -22,
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.text, 0.85),
  },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.md },
  title: {
    fontSize: 24, fontWeight: "800", lineHeight: 28, color: colors.text,
    textShadowColor: tint(colors.shadow, 0.75), textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  titleFlat: { textShadowColor: "transparent" },
  byline: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, alignSelf: "flex-start" },
  handle: { fontSize: 13, fontWeight: "600", color: colors.brand, flexShrink: 1 },
  platform: { fontSize: 11, color: colors.textMuted },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/training/workout-detail/WorkoutHero.tsx
git commit -m "feat(workouts): hero with title, byline and format badge

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: WorkoutStatRow

**Files:**
- Create: `mobile/src/components/training/workout-detail/WorkoutStatRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/workout-detail/WorkoutStatRow.tsx
// Time / Intensity / Skill / Scored by (spec 2026-09-13 §4.3). Format is
// not here — it is on the hero badge and the list band. A cell with a value
// is a button into the Workouts tab with that one axis applied; an empty
// cell shows a dash and does nothing. Same frame as the exercise page's
// meta row.
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors } from "@/src/theme/tokens";
import { SCORE_LABELS } from "@/src/lib/workoutFormatVocab";
import { INTENSITY_LABELS } from "@/src/types/workoutFilters";
import { lengthBandOf } from "@/src/lib/workoutFilters";
import type { WorkoutTags } from "@/src/types/dailyBlocks";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";

interface WorkoutStatRowProps {
  tags: WorkoutTags;
  onFilter: (link: WorkoutFilterLink) => void;
}

const EMPTY = "—";

export function WorkoutStatRow({ tags, onFilter }: WorkoutStatRowProps) {
  const band = tags.estMinutes === null ? null : lengthBandOf(tags.estMinutes);
  const cells: { label: string; value: string | null; link: WorkoutFilterLink | null; a11y: string }[] = [
    {
      label: "Time",
      value: tags.estMinutes === null ? null : `~${tags.estMinutes} min`,
      link: band ? { lengths: [band] } : null,
      a11y: "Workouts of this length",
    },
    {
      label: "Intensity",
      value: tags.intensity === null ? null : INTENSITY_LABELS[tags.intensity],
      link: tags.intensity === null ? null : { intensity: tags.intensity },
      a11y: "Workouts at this intensity",
    },
    {
      label: "Skill",
      value: tags.skillLevel,
      link: tags.skillLevel === null ? null : { skills: [tags.skillLevel] },
      a11y: "Workouts at this skill level",
    },
    {
      label: "Scored by",
      value: tags.scoreType === null ? null : SCORE_LABELS[tags.scoreType],
      link: tags.scoreType === null ? null : { scores: [tags.scoreType] },
      a11y: "Workouts scored this way",
    },
  ];

  return (
    <View style={styles.row}>
      {cells.map((c) => (
        <Pressable
          key={c.label}
          style={styles.cell}
          hitSlop={4}
          disabled={!c.link}
          onPress={() => c.link && onFilter(c.link)}
          accessibilityRole={c.link ? "button" : "text"}
          accessibilityLabel={c.link ? `${c.label} ${c.value}. ${c.a11y}` : `${c.label} not set`}
        >
          <Text style={styles.label}>{c.label}</Text>
          <Text style={[styles.value, !c.value && styles.valueEmpty]} numberOfLines={1}>{c.value ?? EMPTY}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", padding: 16, gap: 12, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cell: { flex: 1 },
  label: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: "600", color: colors.text },
  valueEmpty: { color: colors.textFaint },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/training/workout-detail/WorkoutStatRow.tsx
git commit -m "feat(workouts): stat row with filter links

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: WorkoutHistoryBlock

**Files:**
- Create: `mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx
// "Your history" for a workout (spec 2026-09-13 §4.4, decision 8): the
// exercise page's frame, with last done / times / first done until a
// session-end score exists to draw Best and a trend from. Never done: one
// card saying so, no toggle. Every number comes from lib/workoutHistory;
// this file only draws.
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { historyStyles as h } from "@/src/components/training/item-detail/historyStyles";
import { formatShortDate, lastDonePhrase } from "@/src/lib/exerciseHistory";
import { summarizeWorkoutHistory, formatDuration } from "@/src/lib/workoutHistory";
import type { WorkoutSessionRow } from "@/src/lib/workoutHistory";
import { loadWorkoutHistoryView, saveWorkoutHistoryView } from "@/src/lib/historyViewStore";
import type { HistoryView } from "@/src/lib/historyViewStore";

interface WorkoutHistoryBlockProps {
  userId: string;
  rows: WorkoutSessionRow[];
  /** YYYY-MM-DD, sampled once by the page. */
  today: string;
  onOpenSession: (sessionId: string) => void;
  onSeeAll: () => void;
}

export function WorkoutHistoryBlock({ userId, rows, today, onOpenSession, onSeeAll }: WorkoutHistoryBlockProps) {
  const [view, setView] = useState<HistoryView>("trend");
  useEffect(() => {
    let alive = true;
    loadWorkoutHistoryView(userId).then((p) => { if (alive) setView(p.view); });
    return () => { alive = false; };
  }, [userId]);
  const pick = (v: HistoryView) => {
    setView(v);
    saveWorkoutHistoryView(userId, { view: v });
  };

  const summary = useMemo(() => summarizeWorkoutHistory(rows), [rows]);

  if (!summary) {
    return (
      <View style={h.section}>
        <View style={h.headerRow}>
          <Text style={h.sectionTitle}>Your history</Text>
        </View>
        <View style={[h.card, styles.emptyCard]}>
          <Text style={styles.emptyText}>You haven't done this one yet.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={h.section}>
      <View style={h.headerRow}>
        <Text style={h.sectionTitle}>Your history</Text>
        <View style={h.seg} accessibilityRole="tablist">
          {(["trend", "sessions"] as HistoryView[]).map((v) => {
            const on = v === view;
            return (
              <TouchableOpacity key={v} style={[h.segItem, on && h.segItemOn]} onPress={() => pick(v)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[h.segText, on && h.segTextOn]}>{v === "trend" ? "Trend" : "Sessions"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={h.card}>
        {view === "trend" ? (
          <>
            <View style={[h.stats, styles.statsTight]}>
              <View style={h.stat}>
                <Text style={h.statLabel}>Last done</Text>
                <Text style={h.statValue} numberOfLines={1}>{lastDonePhrase(today, summary.lastDate)}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>Times</Text>
                <Text style={h.statValue} numberOfLines={1}>{summary.count}</Text>
              </View>
              <View style={h.stat}>
                <Text style={h.statLabel}>First done</Text>
                <Text style={h.statValue} numberOfLines={1}>{formatShortDate(summary.firstDate, today)}</Text>
              </View>
            </View>
            <Text style={h.caption}>Score tracking is coming — for now this counts the days you did it.</Text>
          </>
        ) : (
          <View>
            {summary.rows.map((r, i) => {
              const duration = formatDuration(r.durationSeconds);
              const date = formatShortDate(r.sessionDate, today);
              return (
                <TouchableOpacity
                  key={`${r.sessionDate}-${r.sessionId ?? i}`}
                  style={[h.row, i > 0 && h.rowBorder]}
                  onPress={() => r.sessionId && onOpenSession(r.sessionId)}
                  disabled={!r.sessionId}
                  accessibilityRole={r.sessionId ? "button" : "text"}
                  accessibilityLabel={`${date}${duration ? `, ${duration}` : ""}`}
                >
                  <Text style={h.rowDate}>{date}</Text>
                  <Text style={h.rowName} numberOfLines={1}>{duration ? `· ${duration}` : ""}</Text>
                  {r.sessionId && <ChevronRight size={16} color={colors.textMuted} />}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      <TouchableOpacity style={h.seeAll} onPress={onSeeAll} accessibilityRole="button">
        <Text style={h.link}>See all {summary.count} {summary.count === 1 ? "session" : "sessions"}</Text>
        <ChevronRight size={16} color={colors.brand} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  statsTight: { marginBottom: spacing.sm },
  emptyCard: { alignItems: "center", paddingVertical: spacing.xl },
  emptyText: { fontSize: 14, color: colors.textMuted },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/training/workout-detail/WorkoutHistoryBlock.tsx
git commit -m "feat(workouts): history block for the workout page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: WorkoutChips — role pills, Hits, You'll need

**Files:**
- Create: `mobile/src/components/training/workout-detail/WorkoutChips.tsx`

- [ ] **Step 1: Write the three sections**

```tsx
// mobile/src/components/training/workout-detail/WorkoutChips.tsx
// The three chip sections of the workout page (spec 2026-09-13 §4.5–4.7).
// Every chip with a filterable value is a button into the Workouts tab.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import type { BlockRole, WorkoutMuscle } from "@/src/types/dailyBlocks";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";

const PRIMARY_ICON = 26;
const SECONDARY_ICON = 20;

// ---------- §4.5 role pills ----------

interface RolePillsProps {
  roles: BlockRole[];
  onFilter: (link: WorkoutFilterLink) => void;
}

/** MAIN · CONDITIONING … — quiet outlined pills; recommender tags, not headlines. */
export function RolePills({ roles, onFilter }: RolePillsProps) {
  if (roles.length === 0) return null;
  return (
    <View style={styles.pillRow}>
      {roles.map((role) => (
        <TouchableOpacity
          key={role}
          style={styles.pill}
          onPress={() => onFilter({ blockRoles: [role] })}
          accessibilityRole="button"
          accessibilityLabel={`Workouts that serve as ${role}`}
        >
          <Text style={styles.pillText}>{role}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------- §4.6 Hits ----------

interface HitsSectionProps {
  muscles: WorkoutMuscle[];
  onFilter: (link: WorkoutFilterLink) => void;
}

/** Primaries as named chips; secondaries as a dimmed icon row with the names in grey. */
export function HitsSection({ muscles, onFilter }: HitsSectionProps) {
  const primaries = muscles.filter((m) => m.isPrimary);
  const secondaries = muscles.filter((m) => !m.isPrimary);
  if (primaries.length === 0 && secondaries.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Hits</Text>
      {primaries.length > 0 && (
        <View style={styles.chipRow}>
          {primaries.map((m) => (
            <TouchableOpacity
              key={m.name}
              style={styles.muscleChip}
              onPress={() => onFilter({ muscles: [m.name] })}
              accessibilityRole="button"
              accessibilityLabel={`Workouts for ${m.name}`}
            >
              <MuscleIcon muscle={m.name} size={PRIMARY_ICON} />
              <Text style={styles.muscleName}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {secondaries.length > 0 && (
        <View style={[styles.chipRow, styles.secondaryRow]}>
          {secondaries.map((m) => (
            <TouchableOpacity
              key={m.name}
              onPress={() => onFilter({ muscles: [m.name] })}
              accessibilityRole="button"
              accessibilityLabel={`Workouts for ${m.name}`}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <MuscleIcon muscle={m.name} size={SECONDARY_ICON} dim />
            </TouchableOpacity>
          ))}
          <Text style={styles.secondaryNames} numberOfLines={2}>
            also {secondaries.map((m) => m.name).join(", ")}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------- §4.7 You'll need ----------

interface NeedsSectionProps {
  equipment: string[];
  isBodyweight: boolean;
  onFilter: (link: WorkoutFilterLink) => void;
}

/** One outlined tile per derived equipment name; bodyweight-only shows one
 *  untappable "Bodyweight" tile. Nothing derived and not bodyweight: the
 *  section is omitted rather than guessed. */
export function NeedsSection({ equipment, isBodyweight, onFilter }: NeedsSectionProps) {
  const tiles = equipment.length > 0 ? equipment : isBodyweight ? ["Bodyweight"] : [];
  if (tiles.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>You'll need</Text>
      <View style={styles.chipRow}>
        {tiles.map((name) => {
          const tappable = name !== "Bodyweight";
          return (
            <TouchableOpacity
              key={name}
              style={styles.equipTile}
              onPress={() => onFilter({ equipment: [name] })}
              disabled={!tappable}
              accessibilityRole={tappable ? "button" : "text"}
              accessibilityLabel={tappable ? `Workouts using ${name}` : name}
            >
              <View style={styles.equipBadge}>
                <EquipmentGlyph name={name} size={14} color={colors.brand} />
              </View>
              <Text style={styles.equipName}>{name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  pill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  pillText: { fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  muscleChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.control,
    backgroundColor: tint(colors.brand, 0.08), borderWidth: 1, borderColor: tint(colors.brand, 0.35),
  },
  muscleName: { fontSize: 13, fontWeight: "600", color: colors.text },
  secondaryRow: { marginTop: spacing.sm, gap: 6 },
  secondaryNames: { flexShrink: 1, fontSize: 11, color: colors.textMuted, marginLeft: 2 },
  equipTile: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.control,
    borderWidth: 1, borderColor: colors.border,
  },
  // The Exercises card's badge: brand glyph on a brand tint, brand border.
  equipBadge: {
    width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: colors.brand,
  },
  equipName: { fontSize: 13, color: colors.text },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/training/workout-detail/WorkoutChips.tsx
git commit -m "feat(workouts): role pills, Hits and You'll need sections

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: FormatBand and MovementRow

**Files:**
- Create: `mobile/src/components/training/workout-detail/FormatBand.tsx`
- Create: `mobile/src/components/training/workout-detail/MovementRow.tsx`

- [ ] **Step 1: Write the band**

```tsx
// mobile/src/components/training/workout-detail/FormatBand.tsx
// The strip above the movement list (spec 2026-09-13 §4.8): the format in
// green caps, a plain-English gloss under it, the movement count on the
// right. Untagged with no rounds: the count alone.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radii } from "@/src/theme/tokens";
import type { FormatBanner } from "@/src/lib/workoutFormat";

interface FormatBandProps {
  banner: FormatBanner | null;
  movementCount: number;
}

export function FormatBand({ banner, movementCount }: FormatBandProps) {
  const count = `${movementCount} movement${movementCount === 1 ? "" : "s"}`;
  return (
    <View
      style={styles.band}
      accessible
      accessibilityLabel={banner ? `${banner.badge}. ${banner.gloss}. ${count}` : count}
    >
      {banner ? (
        <View style={styles.words}>
          <Text style={styles.badge}>{banner.badge}</Text>
          <Text style={styles.gloss} numberOfLines={2}>{banner.gloss}</Text>
        </View>
      ) : (
        <Text style={styles.badge}>{count.toUpperCase()}</Text>
      )}
      {banner && <Text style={styles.count}>{count}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.row, paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  words: { flex: 1, minWidth: 0 },
  badge: { fontSize: 13, fontWeight: "800", letterSpacing: 1, color: colors.brand },
  gloss: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  count: { fontSize: 11, color: colors.textMuted, flexShrink: 0 },
});
```

- [ ] **Step 2: Write the row**

```tsx
// mobile/src/components/training/workout-detail/MovementRow.tsx
// One movement (spec 2026-09-13 §4.8, decision 6): number, 64pt thumbnail,
// name + prescription (+ note), then an icon-only facts line — primary
// muscle, up to two dimmed secondaries, a hairline, one badge per
// equipment name. The row opens the exercise. Items built without the join
// (no `muscles`/`equipment`) draw without a facts line.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { ChevronRight, Dumbbell } from "lucide-react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import { formatWorkoutItem } from "@/src/lib/workoutFormat";
import type { CapturedWorkoutItemEntry } from "@/src/types/capture";

const THUMB = 64;
const ICON = 20;
const MAX_SECONDARY_ICONS = 2;

interface MovementRowProps {
  index: number;
  item: CapturedWorkoutItemEntry;
  onPress: () => void;
  /** Last row drops its hairline so the band below it does not double up. */
  last?: boolean;
}

export function MovementRow({ index, item, onPress, last = false }: MovementRowProps) {
  const prescription = formatWorkoutItem(item);
  const primary = item.muscles?.find((m) => m.isPrimary)?.name ?? null;
  const secondaries = (item.muscles ?? []).filter((m) => !m.isPrimary).slice(0, MAX_SECONDARY_ICONS).map((m) => m.name);
  const equipment = item.equipment ?? [];
  const hasFacts = primary !== null || secondaries.length > 0 || equipment.length > 0;

  const a11y = [
    `${index}. ${item.name}`,
    prescription || null,
    primary ? `Primary ${primary}` : null,
    secondaries.length ? `also ${secondaries.join(", ")}` : null,
    equipment.length ? equipment.join(", ") : null,
  ].filter(Boolean).join(". ") + ". Open the exercise.";

  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      disabled={!item.exerciseId}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={styles.index}>{index}</Text>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          {primary
            ? <MuscleIcon muscle={primary} size={40} dim />
            : <Dumbbell size={24} color={colors.textFaint} strokeWidth={1.5} />}
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {/* Silence beats invention: when the creator prescribed nothing, the
            movement stands on its own. */}
        {prescription !== "" && <Text style={styles.prescription}>{prescription}</Text>}
        {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
        {hasFacts && (
          <View style={styles.facts}>
            {primary && <MuscleIcon muscle={primary} size={ICON} />}
            {secondaries.map((m) => <MuscleIcon key={m} muscle={m} size={ICON} dim />)}
            {(primary || secondaries.length > 0) && equipment.length > 0 && <View style={styles.divider} />}
            {equipment.map((e) => (
              <View key={e} style={styles.equipBadge}>
                <EquipmentGlyph name={e} size={13} color={colors.brand} />
              </View>
            ))}
          </View>
        )}
      </View>
      {!!item.exerciseId && <ChevronRight size={18} color={colors.textMuted} style={styles.chevron} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  index: { width: 16, textAlign: "right", fontSize: 12, fontWeight: "700", color: colors.textFaint, paddingTop: 4 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.control + 2, backgroundColor: colors.surface2 },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "600", color: colors.text, lineHeight: 18 },
  prescription: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  notes: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
  facts: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  divider: { width: 1, height: 14, backgroundColor: colors.border, marginHorizontal: 2 },
  equipBadge: {
    width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: colors.brand,
  },
  chevron: { marginTop: 4 },
});
```

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/training/workout-detail/FormatBand.tsx src/components/training/workout-detail/MovementRow.tsx
git commit -m "feat(workouts): format band and two-tier movement rows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: CreatorProtocolRow

**Files:**
- Create: `mobile/src/components/training/workout-detail/CreatorProtocolRow.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/workout-detail/CreatorProtocolRow.tsx
// "As the creator wrote it", collapsed (spec 2026-09-13 §4.9): kept for
// trust — seeing the verbatim lines is how you tell a bad parse from a bad
// post — and out of the way by default. Component state only; a reopened
// page starts closed.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight, ChevronDown } from "lucide-react-native";
import { colors, spacing, radii } from "@/src/theme/tokens";

interface CreatorProtocolRowProps {
  text: string;
}

export function CreatorProtocolRow({ text }: CreatorProtocolRowProps) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="As the creator wrote it"
      >
        <Text style={styles.label}>As the creator wrote it</Text>
        <Chevron size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {open && <Text style={styles.protocol}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  protocol: {
    fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: spacing.md,
    backgroundColor: colors.surface2, borderRadius: radii.control, padding: spacing.md,
  },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/components/training/workout-detail/CreatorProtocolRow.tsx
git commit -m "feat(workouts): collapsed 'as the creator wrote it' row

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: AddToDayButton

**Files:**
- Create: `mobile/src/components/training/workout-detail/AddToDayButton.tsx`

- [ ] **Step 1: Write the component**

```tsx
// mobile/src/components/training/workout-detail/AddToDayButton.tsx
// "Add to a day" (spec 2026-09-13 §4.10): the outlined second action under
// Start. Opens a sheet — Today, Tomorrow, Pick a date… — then reads that
// day, plans, asks when the plan says to, and adopts the workout for the
// date without starting it. The date picker comes up as a sheet, never
// inline (WhenSheet's rule). Today hands a toast to the Today tab and
// navigates there; any other day confirms in place under the button.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarPlus } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { handOffToast } from "@/src/components/ui/pendingToast";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { getLocalDateString, parseLocalDate, addDays } from "@/src/lib/dates";
import { formatShortDate } from "@/src/lib/exerciseHistory";
import { planAddToDay, ADD_TO_DAY_LABEL } from "@/src/lib/addWorkoutToDayPlan";
import type { AddToDayPlan } from "@/src/lib/addWorkoutToDayPlan";
import { readDayState, executeAddToDay } from "@/src/lib/supabase/addWorkoutToDay";

interface AddToDayButtonProps {
  userId: string;
  workoutId: string;
  workoutName: string;
  /** Fired after a successful write for TODAY; the page navigates to Today. */
  onAddedToday: () => void;
}

type Sheet =
  | { kind: "closed" }
  | { kind: "choose" }
  | { kind: "date" }
  | { kind: "confirm"; date: string; label: string; plan: AddToDayPlan };

/** "Today", "Tomorrow", else the short date ("14 Sep"). */
function labelFor(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === getLocalDateString(addDays(parseLocalDate(today), 1))) return "Tomorrow";
  return formatShortDate(date, today);
}

export function AddToDayButton({ userId, workoutId, workoutName, onAddedToday }: AddToDayButtonProps) {
  const [sheet, setSheet] = useState<Sheet>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // iOS spins in place and reports every turn; Android returns once, on Set.
  const [pickerDraft, setPickerDraft] = useState<Date>(() => new Date());

  const close = () => setSheet({ kind: "closed" });

  /** One clock sample per tap — the app's no-two-clocks rule. */
  const choose = async (date: string, today: string) => {
    const label = labelFor(date, today);
    setBusy(true);
    setError(null);
    setDone(null);
    let plan: AddToDayPlan;
    try {
      plan = planAddToDay(await readDayState(userId, workoutId, date), label);
    } catch (e) {
      console.error("AddToDayButton read failed:", e);
      setBusy(false);
      close();
      setError("Couldn't read that day. Check your connection and try again.");
      return;
    }
    setBusy(false);
    if (plan.action === "disabled") {
      close();
      setError(plan.label);
      return;
    }
    if (plan.confirm) {
      setSheet({ kind: "confirm", date, label, plan });
      return;
    }
    close();
    await run(date, label, plan);
  };

  const run = async (date: string, label: string, plan: AddToDayPlan) => {
    setBusy(true);
    const result = await executeAddToDay({ userId, workoutId, date, dayLabel: label, plan });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (label === "Today") {
      handOffToast({ title: "Added to today", detail: `${workoutName} is today's session.` });
      onAddedToday();
      return;
    }
    setDone(`Added to ${label}`);
  };

  const onPress = () => {
    if (busy) return;
    setError(null);
    setDone(null);
    setSheet({ kind: "choose" });
  };

  const today = getLocalDateString();
  const tomorrow = getLocalDateString(addDays(parseLocalDate(today), 1));

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonBusy]}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={ADD_TO_DAY_LABEL}
        accessibilityState={{ busy }}
      >
        {busy
          ? <ActivityIndicator size="small" color={colors.brand} />
          : (
            <>
              <CalendarPlus size={18} color={colors.brand} />
              <Text style={styles.buttonText}>{ADD_TO_DAY_LABEL}</Text>
            </>
          )}
      </TouchableOpacity>
      {done && <Text style={styles.done}>{done}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Which day */}
      <BottomSheet visible={sheet.kind === "choose"} onClose={close} closeLabel="Cancel adding to a day">
        <Text style={styles.sheetTitle}>Add {workoutName} to…</Text>
        {[
          { label: "Today", date: today },
          { label: "Tomorrow", date: tomorrow },
        ].map((o) => (
          <TouchableOpacity key={o.label} style={styles.option} onPress={() => choose(o.date, today)}
            accessibilityRole="button" accessibilityLabel={o.label}>
            <Text style={styles.optionText}>{o.label}</Text>
            <Text style={styles.optionSub}>{formatShortDate(o.date, today)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.option, styles.optionLast]}
          onPress={() => {
            setPickerDraft(addDays(parseLocalDate(today), 2));
            setSheet({ kind: "date" });
          }}
          accessibilityRole="button"
          accessibilityLabel="Pick a date"
        >
          <Text style={styles.optionText}>Pick a date…</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* Which date — a sheet on iOS, the platform dialog on Android */}
      {sheet.kind === "date" && Platform.OS !== "ios" && (
        <DateTimePicker
          value={pickerDraft}
          mode="date"
          display="default"
          minimumDate={parseLocalDate(today)}
          onChange={(_e, picked) => {
            close();
            if (picked) choose(getLocalDateString(picked), today);
          }}
        />
      )}
      {Platform.OS === "ios" && (
        <BottomSheet visible={sheet.kind === "date"} onClose={close} closeLabel="Cancel picking a date" style={styles.pickerSheet}>
          <View style={styles.pickerHead}>
            <Text style={styles.sheetTitle}>Which day?</Text>
            <TouchableOpacity
              onPress={() => { close(); choose(getLocalDateString(pickerDraft), today); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneLink}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={pickerDraft}
            mode="date"
            display="spinner"
            minimumDate={parseLocalDate(today)}
            onChange={(_e, picked) => { if (picked) setPickerDraft(picked); }}
            textColor={colors.text}
          />
        </BottomSheet>
      )}

      {/* The plan wants a word first */}
      <BottomSheet visible={sheet.kind === "confirm"} onClose={close} closeLabel="Cancel">
        {sheet.kind === "confirm" && (
          <>
            <Text style={styles.sheetTitle}>{sheet.plan.confirm!.title}</Text>
            <Text style={styles.sheetBody}>{sheet.plan.confirm!.body}</Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetCancel} onPress={close} accessibilityRole="button">
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetGo}
                accessibilityRole="button"
                onPress={() => {
                  const { date, label, plan } = sheet;
                  close();
                  run(date, label, plan);
                }}
              >
                <Text style={styles.sheetGoText}>{sheet.plan.confirm!.go}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  button: {
    height: 52, borderRadius: radii.control, borderWidth: 1, borderColor: colors.brand,
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center",
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: colors.brand, ...typography.button },
  done: { fontSize: 13, color: colors.brand, textAlign: "center", marginTop: spacing.sm, fontWeight: "600" },
  error: { fontSize: 13, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  sheetBody: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  option: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  optionLast: { borderBottomWidth: 0, marginBottom: spacing.md },
  optionText: { fontSize: 16, fontWeight: "600", color: colors.text },
  optionSub: { fontSize: 13, color: colors.textMuted },
  pickerSheet: { paddingHorizontal: spacing.screenGutter, paddingTop: spacing.screenGutter, gap: spacing.md },
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  doneLink: { ...typography.buttonSm, color: colors.brand, fontWeight: "700" },
  sheetActions: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sheetCancel: {
    flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  sheetCancelText: { color: colors.text, ...typography.button },
  sheetGo: { flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  sheetGoText: { color: colors.onBrand, ...typography.button },
});
```

- [ ] **Step 2: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors. If `addDays` or `parseLocalDate` signatures differ from `(Date, number) => Date` / `(string) => Date`, check `mobile/src/lib/dates.ts` lines 32 and 57 and adjust the two call sites — do not add new date helpers.

```bash
git add src/components/training/workout-detail/AddToDayButton.tsx
git commit -m "feat(workouts): add a workout to a day from its page

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: "See all sessions" scoped to a workout

**Files:**
- Modify: `mobile/app/(tabs)/track/gym-sessions/index.tsx`
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`

- [ ] **Step 1: Accept the params on the route**

Replace the body of `mobile/app/(tabs)/track/gym-sessions/index.tsx` with:

```tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import { GymSessionsScreen } from "@/src/components/track/gym-sessions/GymSessionsScreen";

const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

export default function GymSessionsPage() {
  const router = useRouter();
  // From an exercise page's "See all N sessions": scope the History list to
  // sessions holding a working set of this exercise (spec 2026-09-11 §4.2).
  // From a workout page's: scope it to completed sessions of that workout
  // served whole (spec 2026-09-13 §4.4).
  const { exerciseId, exerciseName, workoutId, workoutName } = useLocalSearchParams<{
    exerciseId?: string; exerciseName?: string; workoutId?: string; workoutName?: string;
  }>();

  // Back returns to wherever this was opened from (the Tabs navigator uses
  // history back-behaviour), so a page's See-all lands back on the page;
  // with no history at all, fall back to the Track index.
  return (
    <GymSessionsScreen
      exerciseId={str(exerciseId)}
      exerciseName={str(exerciseName)}
      workoutId={str(workoutId)}
      workoutName={str(workoutName)}
      onClose={() =>
        router.canGoBack() ? router.back() : router.replace("/(tabs)/track")
      }
    />
  );
}
```

- [ ] **Step 2: Scope the list in the screen**

In `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`:

Extend the props:

```ts
interface GymSessionsScreenProps {
  onClose: () => void;
  /** Scope the History list to sessions with a working set of this exercise. */
  exerciseId?: string | null;
  exerciseName?: string | null;
  /** Scope the History list to sessions that were this captured workout served whole. */
  workoutId?: string | null;
  workoutName?: string | null;
}

export function GymSessionsScreen({
  onClose, exerciseId = null, exerciseName = null, workoutId = null, workoutName = null,
}: GymSessionsScreenProps) {
```

Replace the `listSessions` memo with:

```ts
  // The scope is a chip the reader can drop; the hero, stats and calendar
  // keep describing every session — only the list narrows.
  const [scoped, setScoped] = useState(true);
  const scopeActive = scoped && (!!exerciseId || !!workoutId);
  const listSessions = useMemo(() => {
    if (!scoped) return sessions;
    if (exerciseId) {
      return sessions.filter((s) => s.exercises.some(
        (e) => e.exerciseId === exerciseId && e.sets.some((set) => !set.isWarmup),
      ));
    }
    if (workoutId) return sessions.filter((s) => s.capturedWorkoutId === workoutId);
    return sessions;
  }, [sessions, exerciseId, workoutId, scoped]);
```

In the JSX, the scope row and empty state currently read `view === "history" && exerciseId && scoped`. Change both conditions to `view === "history" && scopeActive`, and make the copy pick the noun:

```tsx
              {view === "history" && scopeActive && (
                <View style={styles.scopeRow}>
                  <Text style={styles.scopeText} numberOfLines={1}>
                    {workoutId
                      ? `Sessions of ${workoutName ?? "this workout"} · ${listSessions.length}`
                      : `Sessions with ${exerciseName ?? "this exercise"} · ${listSessions.length}`}
                  </Text>
                  <TouchableOpacity onPress={() => setScoped(false)} accessibilityRole="button"
                    accessibilityLabel="Show all sessions" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.scopeClear}>Show all</Text>
                  </TouchableOpacity>
                </View>
              )}
```

and

```tsx
              {view === "history" && scopeActive && listSessions.length === 0 && (
                <Text style={styles.emptyText}>
                  {workoutId ? "No completed session of this workout yet." : "No session with a working set of this exercise yet."}
                </Text>
              )}
```

Confirm `HistorySession` (the list's item type) exposes `capturedWorkoutId` — it does (`mobile/src/types/gymSessions.ts:58`).

- [ ] **Step 3: Typecheck and commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add "app/(tabs)/track/gym-sessions/index.tsx" src/components/track/gym-sessions/GymSessionsScreen.tsx
git commit -m "feat(track): scope the sessions list to one captured workout

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Compose the read view in CapturedWorkoutScreen

**Files:**
- Modify: `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx`

This is the one large edit. The editing branch is not touched: every `editing ? … : …` keeps its editing side; only the read side changes. Work top to bottom.

- [ ] **Step 1: Imports**

Replace the lucide import line

```ts
import {
  Check, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ExternalLink, Play,
  Plus, Trash2,
} from "lucide-react-native";
```

with

```ts
import { ChevronLeft, ChevronUp, ChevronDown, MoreVertical, Play, Plus, Trash2 } from "lucide-react-native";
```

Remove these imports entirely (their only uses go with the old read view):

```ts
import { fetchWorkoutCompletions } from "@/src/lib/supabase/workoutCompletions";
import { formatLastCompleted, isStale } from "@/src/lib/workoutCompletion";
import type { WorkoutCompletion } from "@/src/lib/workoutCompletion";
```

Change the `workoutFormat` import to only what remains used:

```ts
import { formatWorkoutItem, formatBanner } from "@/src/lib/workoutFormat";
```

Remove `Image` from the `react-native` import list (the hero component owns the image now). Keep `Linking` and `Alert`.

Add these imports after the `CreatorAvatar`/`fetchCreator` lines:

```ts
import { profileUrl } from "@/src/lib/creatorHandle";
import { fetchWorkoutHistory } from "@/src/lib/supabase/workoutHistory";
import type { WorkoutSessionRow } from "@/src/lib/workoutHistory";
import { workoutFilterParam } from "@/src/lib/workoutFilterLink";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";
import { spacing } from "@/src/theme/tokens";
import { WorkoutHero } from "@/src/components/training/workout-detail/WorkoutHero";
import { WorkoutStatRow } from "@/src/components/training/workout-detail/WorkoutStatRow";
import { WorkoutHistoryBlock } from "@/src/components/training/workout-detail/WorkoutHistoryBlock";
import { RolePills, HitsSection, NeedsSection } from "@/src/components/training/workout-detail/WorkoutChips";
import { FormatBand } from "@/src/components/training/workout-detail/FormatBand";
import { MovementRow } from "@/src/components/training/workout-detail/MovementRow";
import { CreatorProtocolRow } from "@/src/components/training/workout-detail/CreatorProtocolRow";
import { AddToDayButton } from "@/src/components/training/workout-detail/AddToDayButton";
```

`CreatorAvatar` itself is no longer rendered here (the hero renders it); remove `import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";` but keep the `CreatorAvatarRow` type import.

- [ ] **Step 2: State — history rows and the user id replace the completion line**

Replace

```ts
  const [completion, setCompletion] = useState<WorkoutCompletion | null>(null);
  const today = useMemo(() => getLocalDateString(), []);

  const editing = draft !== null;

  const completionStale = completion ? isStale(completion, today) : false;
  const lastCompletedLabel = completion ? formatLastCompleted(completion, today) : null;
```

with

```ts
  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<WorkoutSessionRow[]>([]);
  const today = useMemo(() => getLocalDateString(), []);

  const editing = draft !== null;
```

Replace the completions focus effect (the `useFocusEffect` whose body calls `fetchWorkoutCompletions`) with:

```ts
  // Its own effect rather than a limb of the one below: that read is held back
  // while you are editing or a classification is in flight, and neither has
  // anything to do with how often this workout has been trained. Refreshing on
  // every focus is what makes the count right the moment you come back from
  // finishing it.
  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      let alive = true;
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (!user || !alive) return;
        setUserId(user.id);
        fetchWorkoutHistory(user.id, id).then((rows) => {
          if (alive) setHistory(rows);
        });
      });
      return () => {
        alive = false;
      };
    }, [id]),
  );
```

- [ ] **Step 3: Navigation helpers and the ⋮ menu**

Directly after the `confirm` helper (`const confirm = (title, message, go) => …`), add:

```ts
  /** A chip, pill or stat cell: the Workouts tab with that value on top of the saved filters. */
  const openFiltered = (link: WorkoutFilterLink) => {
    router.navigate({
      pathname: "/(tabs)/training",
      params: { workoutFilter: workoutFilterParam(link) },
    } as never);
  };
  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert("Couldn't open it", "Try again, or open it from the app itself.");
    });
  };
  const openSession = (sessionId: string) =>
    router.push(`/(tabs)/track/gym-sessions/${sessionId}` as never);
  const openAllSessions = () => {
    if (!workout) return;
    router.push({
      pathname: "/(tabs)/track/gym-sessions",
      params: { workoutId: workout.workoutId, workoutName: workout.name },
    } as never);
  };
  const openToday = () =>
    router.navigate({ pathname: "/(tabs)/training", params: { openTab: "today" } } as never);

  /** Edit lives here now, with a second route to the post (spec §4.1). */
  const openMenu = () => {
    if (!workout) return;
    const post = workout.source?.sourceUrl ?? null;
    const platform = workout.source?.platform === "tiktok" ? "TikTok" : "Instagram";
    Alert.alert("Workout options", undefined, [
      { text: "Edit", onPress: startEditing },
      ...(post ? [{ text: `Open post on ${platform}`, onPress: () => openUrl(post) }] : []),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };
```

Replace the `header` const's right-hand `TouchableOpacity` (the one whose text is `Edit`/`Save`) with:

```tsx
      {workout && (editing ? (
        <TouchableOpacity
          onPress={save}
          disabled={saving}
          activeOpacity={0.7}
          style={styles.headerRight}
        >
          <Text style={[styles.headerAction, saving && styles.headerActionMuted]}>
            {saving ? "Saving…" : "Save"}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={openMenu}
          // Shut while a classification is in flight: a draft seeded from the
          // pre-classify row would be saved back over the tags it just wrote.
          disabled={tagging}
          activeOpacity={0.7}
          style={styles.headerRight}
          accessibilityRole="button"
          accessibilityLabel="Workout options"
        >
          <MoreVertical size={24} color={tagging ? colors.mutedForeground : colors.foreground} />
        </TouchableOpacity>
      ))}
```

- [ ] **Step 4: Derived values for the read view**

After the block that computes `formatMissing` (`const formatMissing = classified && workout.tags.format === null;`), add:

```ts
  const banner = formatBanner(workout.rounds, workout.tags);
  const source = workout.source;
  const creatorUrl = source ? profileUrl(source.platform, source.posterHandle) : null;
```

Delete the now-unused `formatLine` const. Keep `primaryMuscles` and `secondaryMuscles`: the editing branch's "Hits … — re-tag to change these." text still reads them.

- [ ] **Step 5: The scroll container**

Change

```tsx
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
```

to

```tsx
        <ScrollView
          contentContainerStyle={editing ? styles.scroll : styles.scrollRead}
          keyboardShouldPersistTaps="handled"
        >
```

and add to the StyleSheet next to `scroll`:

```ts
  // The read view is full-bleed (hero, stat row); sections carry their own gutters.
  scrollRead: { paddingBottom: 40 },
```

- [ ] **Step 6: Replace the read view, top to bottom**

Inside the ScrollView, the JSX interleaves editing and read markup. Make these replacements in order:

**(a) Title + headline + history line + hero + description.** Replace everything from `{editing ? (` `<TextInput style={[styles.title, styles.titleInput]}` … down to and including the description block that ends with

```tsx
          ) : (
            shownDescription !== "" && (
              <Text style={styles.description}>{shownDescription}</Text>
            )
          )}
```

with:

```tsx
          {editing ? (
            <>
              <TextInput
                style={[styles.title, styles.titleInput]}
                value={draft!.name}
                onChangeText={(name) => patch({ name })}
                placeholder="Workout name"
                placeholderTextColor={colors.mutedForeground}
              />
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Description</Text>
                {!!workout.source?.captionText && (
                  <TouchableOpacity onPress={suggestDescription} disabled={suggesting}>
                    <Text style={[styles.suggest, suggesting && styles.headerActionMuted]}>
                      {suggesting ? "Writing…" : "Suggest from the post"}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={draft!.description}
                onChangeText={(description) => patch({ description })}
                multiline
                placeholder="What this workout is, in a sentence"
                placeholderTextColor={colors.mutedForeground}
              />
            </>
          ) : (
            <>
              <WorkoutHero
                name={workout.name}
                thumbnailUrl={source?.thumbnailUrl ?? null}
                badge={banner?.badge ?? null}
                platform={source?.platform ?? null}
                handle={source?.posterHandle ?? null}
                avatarUrl={creator?.avatarUrl ?? null}
                avatarFetchedAt={creator?.fetchedAt ?? null}
                onOpenPost={source?.thumbnailUrl && source.sourceUrl ? () => openUrl(source.sourceUrl) : null}
                onOpenProfile={creatorUrl ? () => openUrl(creatorUrl) : null}
              />
              <WorkoutStatRow tags={workout.tags} onFilter={openFiltered} />
            </>
          )}
```

**(b) The tag summary block.** Replace the whole `{!editing && classified && ( <View style={styles.tagBlock}> … </View> )}` block with:

```tsx
          {!editing && classified && (formatMissing || gaps.length > 0) && (
            <View style={styles.tagNotes}>
              {formatMissing && (
                <Text style={styles.tagMuscles}>No format yet — edit to set how it runs.</Text>
              )}
              {gaps.length > 0 && (
                <Text style={styles.tagGap}>
                  Not offered in a session yet — it still needs {listPhrase(gaps)}.
                </Text>
              )}
            </View>
          )}
```

Leave the `{!editing && !classified && ( <TouchableOpacity style={styles.tagButton} …` block exactly as it is, but wrap it so it sits inside a gutter: change its outer style from `styles.tagButton` to `[styles.tagButton, styles.tagButtonRead]` and add to the StyleSheet:

```ts
  tagNotes: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  tagButtonRead: { marginLeft: spacing.lg, marginTop: spacing.md },
```

Leave the `{editing && !classified && (` hint and the whole `{editing && classified && (` editor block untouched.

**(c) History, description, chips — new, read-only, inserted directly after the `{editing && classified && ( … )}` editor block closes:**

```tsx
          {!editing && userId && (
            <WorkoutHistoryBlock
              userId={userId}
              rows={history}
              today={today}
              onOpenSession={openSession}
              onSeeAll={openAllSessions}
            />
          )}

          {!editing && (workout.tags.blockRoles.length > 0 || shownDescription !== "" || shownNotes !== "") && (
            <View style={styles.readSection}>
              <RolePills roles={workout.tags.blockRoles} onFilter={openFiltered} />
              {shownDescription !== "" && <Text style={styles.description}>{shownDescription}</Text>}
              {shownNotes !== "" && (
                <>
                  <Text style={styles.sectionLabel}>Your notes</Text>
                  <Text style={styles.protocol}>{shownNotes}</Text>
                </>
              )}
            </View>
          )}

          {!editing && <HitsSection muscles={workout.tags.muscles} onFilter={openFiltered} />}
          {!editing && (
            <NeedsSection
              equipment={workout.derivedEquipment}
              isBodyweight={workout.isBodyweight}
              onFilter={openFiltered}
            />
          )}

          {!editing && (
            <View style={[styles.listSection, styles.listTop]}>
              <FormatBand banner={banner} movementCount={shownItems.length + pendingItems.length} />
            </View>
          )}
```

Add to the StyleSheet:

```ts
  readSection: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  // The list and everything under it share one gutter; only the band carries the top gap.
  listSection: { paddingHorizontal: spacing.lg },
  listTop: { paddingTop: spacing.lg },
```

and change `description`'s `marginBottom: 16` to `marginBottom: 0` (the section carries the spacing now).

**(d) Movement rows.** In the `{shownItems.map((item, i) => { … })}` block, keep the `if (editing) { return ( <View … style={styles.editRow}> … ) }` branch exactly. Replace the read-mode `return ( <TouchableOpacity key=… style={styles.row} … </TouchableOpacity> );` (the one with `styles.index`, `styles.rowBody`, `styles.movement`) with:

```tsx
            return (
              <View key={`${item.exerciseId}-${i}`} style={styles.listSection}>
                <MovementRow
                  index={i + 1}
                  item={item}
                  last={i === shownItems.length - 1 && pendingItems.length === 0}
                  onPress={() =>
                    router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                  }
                />
              </View>
            );
```

Leave the `{pendingItems.map(…)}` block as it is, but wrap each returned `<View key=… style={styles.row}>` in the same gutter: change its style to `[styles.row, styles.rowGutter]` and add `rowGutter: { paddingHorizontal: spacing.lg }` to the StyleSheet.

**(e) Rounds footnote, notes, protocol, source row, Start.** Replace the read halves as follows.

The rounds block: keep the editing half; change the read half from `shownRounds && ( <Text style={styles.repeat}>Repeat the whole list {shownRounds} times.</Text> )` to `null` — the band says it now:

```tsx
          {editing ? (
            <>
              <Text style={styles.fieldLabel}>Rounds</Text>
              <TextInput
                style={styles.input}
                value={draft!.rounds}
                onChangeText={(rounds) => patch({ rounds })}
                placeholder="e.g. 4, or 3-4"
                placeholderTextColor={colors.mutedForeground}
              />
            </>
          ) : null}
```

The notes block: keep the editing half; its read half moved into (c), so the block becomes:

```tsx
          {editing && (
            <>
              <Text style={styles.fieldLabel}>Your notes</Text>
              <TextInput
                style={[styles.input, styles.multiline]}
                value={draft!.notes}
                onChangeText={(notes) => patch({ notes })}
                multiline
                placeholder="Anything you want to remember about this one"
                placeholderTextColor={colors.mutedForeground}
              />
            </>
          )}
```

Replace the raw-protocol block, the source row, and the Start button — everything from `{!editing && workout.rawProtocol && (` to the end of the Start `TouchableOpacity` — with:

```tsx
          {!editing && workout.rawProtocol && (
            <View style={styles.listSection}>
              <CreatorProtocolRow text={workout.rawProtocol} />
            </View>
          )}

          {/* The last things on the page, scrolling with it: you read the
              workout, and starting it — or placing it on a day — is what you
              do at the end. Not while editing — you're changing the workout,
              not starting it. A workout with no movements has nothing to log. */}
          {!editing && shownItems.length > 0 && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.startButton}
                onPress={() => setModeSheetOpen(true)}
                disabled={starting}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Start ${workout.name} as today's session`}
              >
                {starting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Play size={18} color="#FFFFFF" />
                )}
                <Text style={styles.startText}>
                  {starting ? "Starting…" : "Start Workout"}
                </Text>
              </TouchableOpacity>
              {userId && (
                <AddToDayButton
                  userId={userId}
                  workoutId={workout.workoutId}
                  workoutName={workout.name}
                  onAddedToday={openToday}
                />
              )}
            </View>
          )}
```

Add `actions: { paddingHorizontal: spacing.lg }` to the StyleSheet.

- [ ] **Step 7: Prune dead styles**

Delete these StyleSheet keys, now unused: `headline`, `headlineTight`, `histLine`, `histCount`, `histCountStale`, `histWhen`, `hero`, `rowBody`, `repeat`, `sourceRow`, `sourceText`, `tagBlock`, `tagSummary`. Keep `row`, `index`, `movement`, `prescription`, `pendingNote` (pending rows still use them), `title`, `titleInput`, `description`, `sectionLabel`, `protocol`, `tagMuscles`, `tagGap`, `tagButton`, `tagButtonText`, `startButton`, `startText`, and every editing style.

- [ ] **Step 8: Typecheck, lint, tests**

Run: `npx tsc --noEmit`
Expected: no errors. Fix any "declared but never used" by deleting the symbol, not by suppressing.

Run: `npx eslint src/components/training/daily/CapturedWorkoutScreen.tsx src/components/training/workout-detail`
Expected: no errors; the pre-existing raw-colour warnings on `"#FFFFFF"` in the Start button are known (audit tail) and acceptable.

Run: `npx jest`
Expected: all suites pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/training/daily/CapturedWorkoutScreen.tsx
git commit -m "feat(workouts): compose the workout page read view from its sections

Hero with title, byline and format badge; stat row; history; role pills,
Hits and You'll need; format band over two-tier movement rows; collapsed
creator protocol; Start and Add-to-a-day at the end of the scroll. Edit
moves into the header menu. The editing branch is unchanged.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Device pass

**Files:** none (verification).

- [ ] **Step 1: Boot the app on the walk3 simulator**

The `FitTracker-walk3` simulator has the dev client installed and Brian signed in. Use a Metro port no other session is using (8097 worked before):

```bash
cd /Users/brianwilson/code/fittracker/mobile && npx expo start --dev-client --port 8097
```

Then open the dev client on `FitTracker-walk3` and point it at `http://localhost:8097`. Drive it with the simulator tool (or `idb` if that tool is dead — never CGEvent-click; the sim is on another Space).

- [ ] **Step 2: Walk the checklist, screenshot each**

Training › Flame › Workouts, then open each of:

1. **An AMRAP** (e.g. "15 Minute Core & Shoulder AMRAP"): hero shows the post thumbnail, `AMRAP · 15 MIN` badge top-left, play glyph, title + `@handle · Instagram` byline. Stat row Time / Intensity / Skill / Scored by filled. History block present (never-done card or trend stats). Role pills + description. Hits with named primary chips and dimmed secondary row. You'll need with a Kettlebell tile. Band `AMRAP · 15 MIN` / "As many rounds as possible in 15 minutes" / "7 movements". Every row: thumbnail (or muscle fallback), name, prescription, muscle icons, equipment badge. "As the creator wrote it ›" collapsed; tap expands. Start Workout, then Add to a day.
2. **A 3-rounds-for-time** ("Melt Programming Benchmark WOD Day 2"): badge and band read `3 ROUNDS · FOR TIME`; no "Repeat the whole list" footnote; You'll need shows Dumbbell (+ Bodyweight only if derived says so).
3. **An untagged workout**: no badge; stat row shows four dashes; "Tag for the recommender" button under the row; band shows the count alone (or `N ROUNDS` if it has rounds).
4. **A bodyweight-only workout**: You'll need shows one untappable "Bodyweight" tile.
5. **A workout with no thumbnail**: flat hero, title and byline still there, no play glyph; hero not tappable.
6. **A never-done workout**: "You haven't done this one yet." card, no toggle.
7. **A done workout**: Trend shows Last done / Times / First done; Sessions lists rows with `date · N min`; tapping a row opens the Track session; "See all N sessions" opens Track scoped to the workout with a "Sessions of … · N" chip and Show all.

Interactions:
- Tap the hero → the Instagram post opens externally. Tap the byline → the creator's profile opens.
- ⋮ → Edit enters editing (Cancel/Save header, editor unchanged); Save returns to the new read view. ⋮ → Open post opens the post.
- Tap each stat cell, a role pill, a Hits chip, a You'll need tile → the Workouts tab opens with that one filter added over the saved filters (check the filter chip row).
- Add to a day → Today on an empty day: toast on Today tab, navigated there, session pending. Add to a day → Tomorrow on a day with a draft: "Tomorrow already has a session planned." Replace → "Added to Tomorrow" line under the button; Schedule/Today for tomorrow shows the workout. Add to a day → Pick a date on a rest day → un-rest confirm copy. Add to a day → Today when today's pending session IS this workout → "Today is already this workout" under the button.
- Start Workout still opens the mode sheet and starts the live session.
- Open one exercise with history (Training › Flame › Exercises) and confirm the exercise page's history block is pixel-identical to before Task 7.

- [ ] **Step 3: Record**

Note any screen that deviates from the mockup (`.superpowers/brainstorm/76391-1789345000/content/full-page.html`) in chat before changing it — the mock is the decision record; deviations are proposed, never shipped silently.

---

## Self-review against the spec

- §4.1 nav + ⋮ menu → Task 16 step 3. §4.2 hero → Task 8, wired in 16. §4.3 stat row + links → Tasks 6, 9, 16. §4.4 history (reduced per decision 8) → Tasks 4, 7, 10, 15, 16. §4.5–4.7 chips → Task 11, 16. §4.8 band + rows → Tasks 1, 2, 12, 16; pending rows kept (16 d). §4.9 collapsible → Task 13, 16. §4.10 Start unchanged + Add to a day → Tasks 5, 14, 16. §5.1 → Task 1. §5.2/5.3 → Task 2 (in `workoutFormat.ts`, deviation 1). §5.4 → Task 3. §5.5 → Task 4. §5.6 → Task 5. §6 `workoutFilter` param + `initialFilters` → Task 6. §7 history-view key → Task 4 step 6. §8 error cases: history fails closed (Task 4), link-open alert (16), thumbnail fallback (12), add-to-day inline error (14), untagged states (9, 12, 16). §9 tests → Tasks 1–6; device pass → Task 17. §10 out of scope untouched.
- Types: `WorkoutSessionRow` (Task 4) is what `WorkoutHistoryBlock` (10) and the screen (16) use; `AddToDayPlan`/`DayState` (5) match `AddToDayButton` (14); `WorkoutFilterLink` (6) is the `onFilter` argument in 9, 11, 16; `FormatBanner` (2) feeds `WorkoutHero.badge` and `FormatBand.banner` (8, 12, 16); `CapturedWorkoutItemEntry.imageUrl/muscles` (1) are read by `MovementRow` (12).
