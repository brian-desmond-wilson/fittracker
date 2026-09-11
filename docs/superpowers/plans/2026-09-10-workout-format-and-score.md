# Workout Format & Score Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every captured workout a Format (how it runs), a Score (what is recorded) and, for time-defined formats, the minutes it is built on; classify them at capture, backfill the library, edit them on the workout screen, filter by them on the Workouts tab, and say the format on the card.

**Architecture:** One additive migration on `captured_workouts`. The existing `classify` edge action returns three more fields; the existing validator accepts them and the existing tag save writes them, so capture, edit and the lazy backfill all pick them up through one path. A small vocabulary module owns the labels and the implied-score rule. The card phrase is a pure function with tests. The two filter axes slot into the filter module built by the previous plan.

**Tech Stack:** Supabase (SQL migration via the CLI, one Deno edge function), Expo / React Native, TypeScript, Jest + ts-jest for `src/lib`.

**Spec:** `docs/superpowers/specs/2026-09-10-workout-format-and-score-design.md`. Mockup: https://claude.ai/code/artifact/ffbbd571-4cbc-4414-a954-518230712ef1 (frames F1–F6). Build the frames as drawn; propose deviations in chat.

**Project rules that bind every task**
- Work from `mobile/` for app commands: tests `npx jest <path>`, typecheck `npx tsc --noEmit` (must print nothing), lint `npx eslint <files>`. Supabase CLI commands run from the repo root.
- Branch: continue on `workouts-tab-filters` (this builds on that unmerged work). No PRs; the user merges to `main`.
- Tokens only in new styles; the workout screen and card still import the `@/src/lib/colors` shim (accepted for existing files).
- **Commits:** this project commits only when the user asks. Each task ends with a "Commit" step; run it only if the user has asked for commits this session, otherwise stage and move on.
- Never enter passwords in the app; the user signs in on any fresh simulator.

---

## File map

| Path | Status | Responsibility |
|---|---|---|
| `supabase/migrations/20260916100000_workout_format_score.sql` | create | three nullable CHECKed columns |
| `supabase/functions/capture-post/index.ts` | modify | classify prompt + response gain format, score_type, format_minutes |
| `mobile/src/types/dailyBlocks.ts` | modify | `WorkoutFormat`, `WorkoutScoreType`, three fields on `WorkoutTags` |
| `mobile/src/lib/workoutFormatVocab.ts` | create | labels, order, implied score, which formats carry minutes |
| `mobile/src/lib/workoutTagValidate.ts` | modify | accept the three fields, degrade to null |
| `mobile/src/lib/supabase/capture.ts` | modify | select + map the three columns |
| `mobile/src/lib/supabase/workoutTags.ts` | modify | select + map in `fetchTaggedWorkouts`; write in `saveWorkoutTags` |
| `mobile/src/lib/composeDay.ts` | modify | backfill also targets classified rows with null format |
| `mobile/src/lib/workoutFormat.ts` | modify | `formatWorkoutHeadline` gains the format phrase |
| `mobile/src/types/workoutFilters.ts` | modify | `formats`, `scores` axes |
| `mobile/src/lib/workoutFilters.ts` | modify | match, count, chips, remove, axis order |
| `mobile/src/lib/workoutFilterStore.ts` | modify | sanitize the two new lists |
| `mobile/src/components/training/daily/WorkoutFiltersSheet.tsx` | modify | Format and Score pill rows |
| `mobile/src/components/training/daily/SwipeableWorkoutCard.tsx` | modify | pass tags to the headline |
| `mobile/src/components/training/daily/TodayTab.tsx` | modify | pass tags to the headline |
| `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx` | modify | summary line, editor rows, draft, save, gaps |
| tests under `mobile/src/lib/__tests__/` | modify/create | see each task |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/20260916100000_workout_format_score.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Format (how a captured workout runs) and Score (what is recorded), plus the
-- minutes a time-defined format is built on. All nullable: the classifier
-- fills them and the lazy backfill reaches the existing library over a few
-- loads. Spec: docs/superpowers/specs/2026-09-10-workout-format-and-score-design.md
ALTER TABLE public.captured_workouts
  ADD COLUMN IF NOT EXISTS format text
    CONSTRAINT captured_workouts_format_check
    CHECK (format IN ('sets_reps','rounds','amrap','emom','for_time','intervals','chipper','ladder')),
  ADD COLUMN IF NOT EXISTS score_type text
    CONSTRAINT captured_workouts_score_type_check
    CHECK (score_type IN ('reps','rounds_reps','load','time','distance','calories','duration','quality','height','none')),
  ADD COLUMN IF NOT EXISTS format_minutes integer
    CONSTRAINT captured_workouts_format_minutes_check
    CHECK (format_minutes BETWEEN 1 AND 240);

COMMENT ON COLUMN public.captured_workouts.format IS
  'How the workout runs; will drive the live layout. NULL = not yet classified.';
COMMENT ON COLUMN public.captured_workouts.score_type IS
  'What is recorded when the workout is done. NULL = not yet classified.';
COMMENT ON COLUMN public.captured_workouts.format_minutes IS
  'The minutes a time-defined format is built on (AMRAP cap, EMOM length, For-time cap, interval total). Not the duration estimate in est_minutes.';
```

- [ ] **Step 2: Push it**

Run from the repo root: `npx supabase db push --yes`
Expected: the migration applies; `npx supabase migration list` shows `20260916100000` as applied on both local and remote.

- [ ] **Step 3: Verify the columns exist**

Run from the repo root: `npx supabase db dump --schema public 2>&1 | grep -A3 '"format_minutes"'`
Expected: the three columns and their CHECK constraints appear under `captured_workouts`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260916100000_workout_format_score.sql
git commit -m "feat(db): format, score_type and format_minutes on captured_workouts"
```

---

### Task 2: Types and vocabulary

**Files:**
- Modify: `mobile/src/types/dailyBlocks.ts`
- Create: `mobile/src/lib/workoutFormatVocab.ts`
- Test: `mobile/src/lib/__tests__/workoutFormatVocab.test.ts`
- Modify (fixtures): `mobile/src/lib/__tests__/workoutFilter.test.ts`, `workoutFilters.test.ts` (2 sites), `workoutSort.test.ts`, `dailyBlockShortlist.test.ts`
- Modify: `mobile/src/lib/workoutTagValidate.ts` (only the returned object, to keep tsc green until Task 3)

- [ ] **Step 1: Add the types**

In `mobile/src/types/dailyBlocks.ts`, after `export type BodyFocus = …`, add:

```ts
/** How a captured workout runs. Decides the live layout later; filterable
 *  now. Spec 2026-09-10-workout-format-and-score-design §4.1. */
export type WorkoutFormat =
  | "sets_reps" | "rounds" | "amrap" | "emom" | "for_time" | "intervals" | "chipper" | "ladder";

/** What is recorded when the workout is done. Mirrors the CrossFit module's
 *  scoring_types names. Spec §4.2. */
export type WorkoutScoreType =
  | "reps" | "rounds_reps" | "load" | "time" | "distance" | "calories"
  | "duration" | "quality" | "height" | "none";
```

and change `WorkoutTags` to:

```ts
export interface WorkoutTags {
  blockRoles: BlockRole[];
  muscles: WorkoutMuscle[];
  estMinutes: number | null;
  intensity: WorkoutIntensity | null;
  skillLevel: "Beginner" | "Intermediate" | "Advanced" | null;
  /** Null until the classifier (or the user) sets it. */
  format: WorkoutFormat | null;
  scoreType: WorkoutScoreType | null;
  /** The minutes a time-defined format is built on; null for the others or
   *  when the creator stated none. Not the duration estimate. */
  formatMinutes: number | null;
  classifiedAt: string | null;
}
```

- [ ] **Step 2: Write the failing vocabulary tests**

```ts
// mobile/src/lib/__tests__/workoutFormatVocab.test.ts
import {
  ALL_FORMATS, FORMAT_LABELS, ALL_SCORES, SCORE_LABELS, IMPLIED_SCORE,
  formatHasMinutes, minutesLabelFor,
} from "../workoutFormatVocab";

describe("workoutFormatVocab", () => {
  it("labels every format and score exactly once", () => {
    expect(ALL_FORMATS).toHaveLength(8);
    expect(new Set(ALL_FORMATS).size).toBe(8);
    for (const f of ALL_FORMATS) expect(FORMAT_LABELS[f]).toBeTruthy();
    expect(ALL_SCORES).toHaveLength(10);
    for (const s of ALL_SCORES) expect(SCORE_LABELS[s]).toBeTruthy();
  });

  it("implies a score only where the spec says so", () => {
    expect(IMPLIED_SCORE.amrap).toBe("rounds_reps");
    expect(IMPLIED_SCORE.for_time).toBe("time");
    expect(IMPLIED_SCORE.chipper).toBe("time");
    expect(IMPLIED_SCORE.ladder).toBe("time");
    expect(IMPLIED_SCORE.sets_reps).toBeNull();
    expect(IMPLIED_SCORE.rounds).toBeNull();
    expect(IMPLIED_SCORE.emom).toBeNull();
    expect(IMPLIED_SCORE.intervals).toBeNull();
  });

  it("knows which formats carry minutes and what to call them", () => {
    expect(formatHasMinutes("amrap")).toBe(true);
    expect(formatHasMinutes("rounds")).toBe(false);
    expect(minutesLabelFor("amrap")).toBe("AMRAP minutes");
    expect(minutesLabelFor("emom")).toBe("EMOM minutes");
    expect(minutesLabelFor("for_time")).toBe("Time cap (minutes)");
    expect(minutesLabelFor("intervals")).toBe("Total minutes");
    expect(minutesLabelFor("ladder")).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutFormatVocab.test.ts`
Expected: FAIL, "Cannot find module '../workoutFormatVocab'".

- [ ] **Step 4: Implement the vocabulary**

```ts
// mobile/src/lib/workoutFormatVocab.ts
// The Format and Score vocabularies: order, labels, and the two rules the
// screens share — which formats imply a score, and which are built on a
// number of minutes. Spec §4.
import type { WorkoutFormat, WorkoutScoreType } from "../types/dailyBlocks";

export const ALL_FORMATS: WorkoutFormat[] = [
  "sets_reps", "rounds", "amrap", "emom", "for_time", "intervals", "chipper", "ladder",
];

export const FORMAT_LABELS: Record<WorkoutFormat, string> = {
  sets_reps: "Sets & reps",
  rounds: "Rounds",
  amrap: "AMRAP",
  emom: "EMOM",
  for_time: "For time",
  intervals: "Intervals",
  chipper: "Chipper",
  ladder: "Ladder",
};

export const ALL_SCORES: WorkoutScoreType[] = [
  "reps", "rounds_reps", "load", "time", "distance", "calories",
  "duration", "quality", "height", "none",
];

export const SCORE_LABELS: Record<WorkoutScoreType, string> = {
  reps: "Reps",
  rounds_reps: "Rounds + reps",
  load: "Load",
  time: "Time",
  distance: "Distance",
  calories: "Calories",
  duration: "Duration / hold",
  quality: "Quality",
  height: "Height / range",
  none: "Not scored",
};

/** The score a format settles on its own. Null means "ask the caption". The
 *  card hides an implied score, and the editor pre-selects it. */
export const IMPLIED_SCORE: Record<WorkoutFormat, WorkoutScoreType | null> = {
  sets_reps: null,
  rounds: null,
  amrap: "rounds_reps",
  emom: null,
  for_time: "time",
  intervals: null,
  chipper: "time",
  ladder: "time",
};

/** What the minutes field means for each format that has one. Null = the
 *  format has no such number and the field stays hidden. */
const MINUTES_LABEL: Partial<Record<WorkoutFormat, string>> = {
  amrap: "AMRAP minutes",
  emom: "EMOM minutes",
  for_time: "Time cap (minutes)",
  intervals: "Total minutes",
  chipper: "Time cap (minutes)",
};

export function formatHasMinutes(format: WorkoutFormat | null): boolean {
  return format !== null && MINUTES_LABEL[format] !== undefined;
}

export function minutesLabelFor(format: WorkoutFormat | null): string | null {
  return format === null ? null : MINUTES_LABEL[format] ?? null;
}
```

- [ ] **Step 5: Keep the tree compiling — validator and fixtures**

In `mobile/src/lib/workoutTagValidate.ts`, in the returned object, add before `classifiedAt: null,`:

```ts
    // Task 3 validates these; for now the shape exists.
    format: null,
    scoreType: null,
    formatMinutes: null,
```

In each test fixture below, add `format: null, scoreType: null, formatMinutes: null,` inside the `tags` object literal:
- `src/lib/__tests__/workoutFilter.test.ts` — the `tags:` block in the `workout` factory.
- `src/lib/__tests__/workoutFilters.test.ts` — the `tags:` block in the `workout` factory AND the inline `untagged` tags literal (`{ blockRoles: [], muscles: [], estMinutes: null, intensity: null, skillLevel: null, classifiedAt: null }`).
- `src/lib/__tests__/workoutSort.test.ts` — the one-line `tags:` literal.
- `src/lib/__tests__/dailyBlockShortlist.test.ts` — the `tags:` block in its `workout` factory.

- [ ] **Step 6: Run the tests and the typecheck**

Run: `npx jest src/lib/__tests__/workoutFormatVocab.test.ts && npx tsc --noEmit`
Expected: 3 tests pass; tsc reports errors ONLY in `src/lib/supabase/capture.ts` and `src/lib/supabase/workoutTags.ts` (the two mappers do not set the new fields yet; Task 4 fixes them). Anything else is a regression.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/types/dailyBlocks.ts mobile/src/lib/workoutFormatVocab.ts mobile/src/lib/__tests__/workoutFormatVocab.test.ts mobile/src/lib/workoutTagValidate.ts mobile/src/lib/__tests__/workoutFilter.test.ts mobile/src/lib/__tests__/workoutFilters.test.ts mobile/src/lib/__tests__/workoutSort.test.ts mobile/src/lib/__tests__/dailyBlockShortlist.test.ts
git commit -m "feat(workouts): Format and Score vocabulary; tags carry the three new fields"
```

---

### Task 3: Validator accepts the three fields

**Files:**
- Modify: `mobile/src/lib/workoutTagValidate.ts`
- Test: `mobile/src/lib/__tests__/workoutTagValidate.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe("validateWorkoutTags", …)` block in the test file:

```ts
  it("accepts format, score_type and format_minutes", () => {
    const tags = validateWorkoutTags({
      ...good, format: "amrap", score_type: "rounds_reps", format_minutes: 15,
    }, allowed)!;
    expect(tags.format).toBe("amrap");
    expect(tags.scoreType).toBe("rounds_reps");
    expect(tags.formatMinutes).toBe(15);
  });

  it("degrades an unknown format or score to null rather than rejecting", () => {
    const tags = validateWorkoutTags({
      ...good, format: "tabata", score_type: "vibes", format_minutes: 12,
    }, allowed)!;
    expect(tags.format).toBeNull();
    expect(tags.scoreType).toBeNull();
    expect(tags.formatMinutes).toBe(12);
  });

  it("degrades minutes outside 1–240, fractions rounded, non-numbers null", () => {
    expect(validateWorkoutTags({ ...good, format_minutes: 0 }, allowed)!.formatMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, format_minutes: 241 }, allowed)!.formatMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, format_minutes: 12.4 }, allowed)!.formatMinutes).toBe(12);
    expect(validateWorkoutTags({ ...good, format_minutes: "15" }, allowed)!.formatMinutes).toBeNull();
  });

  it("leaves all three null when the answer omits them", () => {
    const tags = validateWorkoutTags(good, allowed)!;
    expect(tags.format).toBeNull();
    expect(tags.scoreType).toBeNull();
    expect(tags.formatMinutes).toBeNull();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutTagValidate.test.ts`
Expected: the first three new tests FAIL (fields always null); the fourth passes already.

- [ ] **Step 3: Implement**

In `mobile/src/lib/workoutTagValidate.ts`:

Add the imports:

```ts
import type { BlockRole, WorkoutIntensity, WorkoutTags, WorkoutFormat, WorkoutScoreType } from "../types/dailyBlocks";
import { ALL_FORMATS, ALL_SCORES } from "./workoutFormatVocab";
```

(replace the existing `import type { BlockRole, WorkoutIntensity, WorkoutTags } …` line). Then replace the three placeholder lines from Task 2 with:

```ts
    // Same stance as intensity: unknown → null, never a rejection. A workout
    // without a format still serves its blocks; it just reads "Untagged" on
    // the Workouts tab until someone sets it.
    format: ALL_FORMATS.includes(r.format as WorkoutFormat) ? (r.format as WorkoutFormat) : null,
    scoreType: ALL_SCORES.includes(r.score_type as WorkoutScoreType)
      ? (r.score_type as WorkoutScoreType)
      : null,
    // Same bounds as est_minutes: the column CHECK is 1..240.
    formatMinutes: typeof r.format_minutes === "number" &&
      Number.isFinite(r.format_minutes) &&
      r.format_minutes >= 1 && r.format_minutes <= MAX_MINUTES
        ? Math.round(r.format_minutes)
        : null,
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/__tests__/workoutTagValidate.test.ts`
Expected: PASS (all previous tests plus 4 new).

- [ ] **Step 5: Commit**

```bash
git add mobile/src/lib/workoutTagValidate.ts mobile/src/lib/__tests__/workoutTagValidate.test.ts
git commit -m "feat(workouts): validator accepts format, score and minutes"
```

---

### Task 4: Read and write the columns

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts` (two selects, the mapper's `tags` block)
- Modify: `mobile/src/lib/supabase/workoutTags.ts` (`fetchTaggedWorkouts` select + map; `saveWorkoutTags` update)

- [ ] **Step 1: capture.ts selects**

In both `fetchCapturedWorkouts` and `fetchCapturedWorkout`, change the line

```
      block_roles, est_minutes, intensity, skill_level, classified_at,
```

to

```
      block_roles, est_minutes, intensity, skill_level, classified_at,
      format, score_type, format_minutes,
```

(two occurrences; do not touch `fetchCatalog`).

- [ ] **Step 2: capture.ts mapper**

In `toCapturedWorkoutEntry`'s `tags` object, after `skillLevel: row.skill_level ?? null,` add:

```ts
      format: row.format ?? null,
      scoreType: row.score_type ?? null,
      formatMinutes: row.format_minutes ?? null,
```

- [ ] **Step 3: workoutTags.ts read**

In `fetchTaggedWorkouts`, change

```
        id, name, rounds, block_roles, est_minutes, intensity, skill_level,
        classified_at,
```

to

```
        id, name, rounds, block_roles, est_minutes, intensity, skill_level,
        classified_at, format, score_type, format_minutes,
```

and in its map, after `skillLevel: row.skill_level ?? null,` add:

```ts
        format: row.format ?? null,
        scoreType: row.score_type ?? null,
        formatMinutes: row.format_minutes ?? null,
```

- [ ] **Step 4: workoutTags.ts write**

In `saveWorkoutTags`, change the update object to:

```ts
      .update({
        block_roles: tags.blockRoles,
        est_minutes: tags.estMinutes,
        intensity: tags.intensity,
        skill_level: tags.skillLevel,
        format: tags.format,
        score_type: tags.scoreType,
        format_minutes: tags.formatMinutes,
        classified_at: new Date().toISOString(),
      })
```

- [ ] **Step 5: Typecheck and full suite**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -4`
Expected: tsc silent; all suites green.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/lib/supabase/capture.ts mobile/src/lib/supabase/workoutTags.ts
git commit -m "feat(workouts): read and write format, score and minutes with the other tags"
```

---

### Task 5: Classifier returns the three fields

**Files:**
- Modify: `supabase/functions/capture-post/index.ts` (the `classify` action's `SYSTEM` prompt)

- [ ] **Step 1: Extend the prompt rules**

In the `classify` action's `SYSTEM` string, after the `"skill_level"` rule and before `Respond as JSON:`, add:

```
- "format": how the workout RUNS, exactly one of: "sets_reps" | "rounds" |
  "amrap" | "emom" | "for_time" | "intervals" | "chipper" | "ladder".
  Per-movement set counts and no whole-list repeat -> "sets_reps". A stated
  number of rounds through the whole list -> "rounds". "AMRAP" / "as many
  rounds as possible" -> "amrap". "EMOM" / "every minute on the minute" ->
  "emom". "For time" / "as fast as possible" / a time cap on a fixed list ->
  "for_time". Work/rest blocks or "Tabata" -> "intervals". One long list done
  once, for time -> "chipper". A rep scheme across rounds like 21-15-9 or
  10-9-8-... -> "ladder". NEVER null: when nothing is stated, "sets_reps" if
  the movements carry sets, otherwise "rounds".
- "score_type": what is recorded at the end, exactly one of: "reps" |
  "rounds_reps" | "load" | "time" | "distance" | "calories" | "duration" |
  "quality" | "height" | "none". Implied by format when it is: amrap ->
  "rounds_reps"; for_time, chipper, ladder -> "time". Otherwise read the
  caption ("for load" -> "load", "max calories" -> "calories", "hold as long
  as you can" -> "duration"). Mobility, warm-ups and most cool-downs are
  "none". NEVER null.
- "format_minutes": the number the format is built on, ONLY when the caption
  states it: the AMRAP cap, the EMOM length, a for-time or chipper time cap,
  an interval block's total. A whole number 1..240, or null. NEVER an
  estimate — est_minutes is the estimate; this is what the creator wrote.
```

and change the response shape line to:

```
Respond as JSON:
{"block_roles": string[], "primary_muscles": string[],
 "secondary_muscles": string[], "est_minutes": number,
 "intensity": string, "skill_level": string,
 "format": string, "score_type": string, "format_minutes": number | null}
```

No other change: the function already returns the parsed JSON as `tags` and the client validates every field.

- [ ] **Step 2: Deploy**

Run from the repo root: `npx supabase functions deploy capture-post`
Expected: deploy succeeds.

- [ ] **Step 3: Smoke the action**

From the repo root, call the deployed function once with the service-role key from `mobile/.env` (the classify action needs an authenticated caller):

```bash
cd mobile && node -e '
require("dotenv").config();
const url = process.env.EXPO_PUBLIC_SUPABASE_URL + "/functions/v1/capture-post";
const key = process.env.SERVICE_ROLE;
fetch(url, { method: "POST", headers: { Authorization: "Bearer " + key, apikey: key, "Content-Type": "application/json" },
  body: JSON.stringify({ action: "classify", name: "15 Minute AMRAP", rounds: "", rawProtocol: "",
    caption: "15 min AMRAP: 10 swings, 10 goblet squats, 10 push-ups",
    muscles: ["Glutes","Quads","Chest","Core"],
    items: [{name:"Kettlebell Swing",reps:"10"},{name:"Goblet Squat",reps:"10"},{name:"Push-Up",reps:"10"}] }) })
 .then(r => r.json()).then(j => console.log(JSON.stringify(j.tags, null, 1)));'
```

Expected: the printed tags include `"format": "amrap"`, `"score_type": "rounds_reps"`, `"format_minutes": 15`. Never paste the key into chat or a commit.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/capture-post/index.ts
git commit -m "feat(capture): classifier names the workout's format, score and minutes"
```

---

### Task 6: Backfill reaches classified workouts without a format

**Files:**
- Modify: `mobile/src/lib/composeDay.ts` (the `due` filter in the lazy backfill)

- [ ] **Step 1: Widen the candidate filter**

Change

```ts
    const due = captured
      .filter((w) => w.tags.classifiedAt === null)
```

to

```ts
    // Untagged, or tagged before Format existed: the classifier answers
    // everything at once, so a re-run for the format also refreshes the rest,
    // which is the accepted cost of not adding a second classify action.
    const due = captured
      .filter((w) => w.tags.classifiedAt === null || w.tags.format === null)
```

- [ ] **Step 2: Typecheck and suite**

Run: `npx tsc --noEmit && npx jest 2>&1 | tail -3`
Expected: clean and green.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/lib/composeDay.ts
git commit -m "feat(workouts): lazy backfill also classifies workouts with no format"
```

---

### Task 7: The card phrase

**Files:**
- Modify: `mobile/src/lib/workoutFormat.ts`
- Test: `mobile/src/lib/__tests__/workoutFormat.test.ts`
- Modify: `mobile/src/components/training/daily/SwipeableWorkoutCard.tsx`, `TodayTab.tsx`, `CapturedWorkoutScreen.tsx` (call sites)

- [ ] **Step 1: Write the failing tests**

Replace the `describe("formatWorkoutHeadline", …)` block in the test file with:

```ts
describe("formatWorkoutHeadline", () => {
  const shape = (o: Partial<HeadlineShape>): HeadlineShape => ({
    format: null, formatMinutes: null, scoreType: null, ...o,
  });

  it("counts movements and states rounds as written when there is no format", () => {
    expect(formatWorkoutHeadline(4, "3-4")).toBe("4 movements · 3-4 rounds");
    expect(formatWorkoutHeadline(4, "3-4", shape({}))).toBe("4 movements · 3-4 rounds");
  });

  it("uses the singular for one round and one movement", () => {
    expect(formatWorkoutHeadline(4, "1")).toBe("4 movements · 1 round");
    expect(formatWorkoutHeadline(1, null)).toBe("1 movement");
  });

  it("says nothing extra for sets & reps", () => {
    expect(formatWorkoutHeadline(7, null, shape({ format: "sets_reps" }))).toBe("7 movements");
    expect(formatWorkoutHeadline(7, "3", shape({ format: "sets_reps" }))).toBe("7 movements");
  });

  it("rounds keeps the creator's rounds text", () => {
    expect(formatWorkoutHeadline(6, "6", shape({ format: "rounds" }))).toBe("6 movements · 6 rounds");
    expect(formatWorkoutHeadline(6, null, shape({ format: "rounds" }))).toBe("6 movements · Rounds");
  });

  it("time-defined formats carry their minutes", () => {
    expect(formatWorkoutHeadline(7, null, shape({ format: "amrap", formatMinutes: 15 }))).toBe("7 movements · AMRAP 15 min");
    expect(formatWorkoutHeadline(7, null, shape({ format: "amrap" }))).toBe("7 movements · AMRAP");
    expect(formatWorkoutHeadline(2, null, shape({ format: "emom", formatMinutes: 12 }))).toBe("2 movements · EMOM 12 min");
    expect(formatWorkoutHeadline(7, null, shape({ format: "for_time", formatMinutes: 20 }))).toBe("7 movements · For time · 20 min cap");
    expect(formatWorkoutHeadline(7, null, shape({ format: "for_time" }))).toBe("7 movements · For time");
    expect(formatWorkoutHeadline(4, null, shape({ format: "intervals", formatMinutes: 16 }))).toBe("4 movements · Intervals 16 min");
    expect(formatWorkoutHeadline(9, null, shape({ format: "chipper", formatMinutes: 25 }))).toBe("9 movements · Chipper · 25 min cap");
    expect(formatWorkoutHeadline(3, null, shape({ format: "ladder", formatMinutes: 25 }))).toBe("3 movements · Ladder");
  });

  it("describeFormat is the headline without the movement count", () => {
    expect(describeFormat("6", shape({ format: "rounds", scoreType: "load" }))).toBe("6 rounds · load");
    expect(describeFormat(null, shape({ format: "sets_reps" }))).toBeNull();
    expect(describeFormat(null, shape({}))).toBeNull();
  });

  it("appends the score only when the format does not imply it and it is not none", () => {
    expect(formatWorkoutHeadline(6, "6", shape({ format: "rounds", scoreType: "load" }))).toBe("6 movements · 6 rounds · load");
    expect(formatWorkoutHeadline(7, null, shape({ format: "sets_reps", scoreType: "load" }))).toBe("7 movements · load");
    expect(formatWorkoutHeadline(2, null, shape({ format: "emom", formatMinutes: 12, scoreType: "calories" }))).toBe("2 movements · EMOM 12 min · calories");
    expect(formatWorkoutHeadline(7, null, shape({ format: "amrap", formatMinutes: 15, scoreType: "rounds_reps" }))).toBe("7 movements · AMRAP 15 min");
    expect(formatWorkoutHeadline(7, null, shape({ format: "for_time", scoreType: "time" }))).toBe("7 movements · For time");
    expect(formatWorkoutHeadline(6, "6", shape({ format: "rounds", scoreType: "none" }))).toBe("6 movements · 6 rounds");
    expect(formatWorkoutHeadline(4, null, shape({ format: "intervals", scoreType: "duration" }))).toBe("4 movements · Intervals · duration / hold");
  });
});
```

and add `HeadlineShape` to the import at the top of the test file:

```ts
import { formatWorkoutItem, formatWorkoutHeadline, describeFormat } from "../workoutFormat";
import type { HeadlineShape } from "../workoutFormat";
```

(keep whatever else the file already imports).

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/workoutFormat.test.ts`
Expected: FAIL on the new cases (and a type error on `HeadlineShape`).

- [ ] **Step 3: Implement**

In `mobile/src/lib/workoutFormat.ts`, replace `formatWorkoutHeadline` with:

```ts
import type { WorkoutFormat, WorkoutScoreType } from "../types/dailyBlocks";
import { FORMAT_LABELS, SCORE_LABELS, IMPLIED_SCORE } from "./workoutFormatVocab";

/** The three tag fields the headline reads. Optional on the call, so a
 *  capture being reviewed — which has no tags yet — still gets a headline. */
export interface HeadlineShape {
  format: WorkoutFormat | null;
  formatMinutes: number | null;
  scoreType: WorkoutScoreType | null;
}

/** The format as the card says it. Rounds keeps the creator's text because
 *  "3-4 rounds" is a range the number cannot carry. Spec §8.1 phrase table. */
function formatPhrase(rounds: string | null, s: HeadlineShape): string | null {
  const min = s.formatMinutes;
  switch (s.format) {
    case null: return rounds ? `${rounds} round${rounds === "1" ? "" : "s"}` : null;
    case "sets_reps": return null;
    case "rounds": return rounds ? `${rounds} round${rounds === "1" ? "" : "s"}` : FORMAT_LABELS.rounds;
    case "amrap": return min ? `AMRAP ${min} min` : "AMRAP";
    case "emom": return min ? `EMOM ${min} min` : "EMOM";
    case "for_time": return min ? `For time · ${min} min cap` : "For time";
    case "intervals": return min ? `Intervals ${min} min` : "Intervals";
    case "chipper": return min ? `Chipper · ${min} min cap` : "Chipper";
    case "ladder": return "Ladder";
  }
}

/** The score, lower-cased, only when it adds information: not implied by the
 *  format, and not "none". */
function scorePhrase(s: HeadlineShape): string | null {
  if (s.scoreType === null || s.scoreType === "none") return null;
  if (s.format !== null && IMPLIED_SCORE[s.format] === s.scoreType) return null;
  return SCORE_LABELS[s.scoreType].toLowerCase();
}

/** The format and score as one phrase, or null when there is nothing to
 *  say: "AMRAP 15 min", "6 rounds · load", "For time". The workout screen
 *  shows this on its own; the card puts it after the movement count. */
export function describeFormat(rounds: string | null, shape: HeadlineShape): string | null {
  const parts = [formatPhrase(rounds, shape), scorePhrase(shape)].filter((p): p is string => p !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

/** The workout's shape in one line: how many movements, how it runs, and
 *  what it is scored by when that is not obvious. */
export function formatWorkoutHeadline(
  movementCount: number,
  rounds: string | null,
  shape: HeadlineShape = { format: null, formatMinutes: null, scoreType: null },
): string {
  const movements = `${movementCount} movement${movementCount === 1 ? "" : "s"}`;
  const rest = describeFormat(rounds, shape);
  return rest === null ? movements : `${movements} · ${rest}`;
}
```

Move the two new `import` lines to the top of the file with the existing import.

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest src/lib/__tests__/workoutFormat.test.ts`
Expected: PASS.

- [ ] **Step 5: Pass tags at the call sites**

- `SwipeableWorkoutCard.tsx`: `formatWorkoutHeadline(workout.items.length, workout.rounds)` → `formatWorkoutHeadline(workout.items.length, workout.rounds, workout.tags)`.
- `TodayTab.tsx`: `formatWorkoutHeadline(served.items.length, served.rounds)` → `formatWorkoutHeadline(served.items.length, served.rounds, served.tags)`.
- `CapturedWorkoutScreen.tsx`: `formatWorkoutHeadline(shownItems.length + pendingItems.length, shownRounds)` → `formatWorkoutHeadline(shownItems.length + pendingItems.length, shownRounds, workout.tags)`.
- `CaptureReviewSheet.tsx`: unchanged (no tags yet; the default applies).

`WorkoutTags` is structurally a `HeadlineShape`, so no cast is needed.

- [ ] **Step 6: Typecheck, lint, suite**

Run: `npx tsc --noEmit && npx eslint src/lib/workoutFormat.ts src/components/training/daily/SwipeableWorkoutCard.tsx src/components/training/daily/TodayTab.tsx src/components/training/daily/CapturedWorkoutScreen.tsx && npx jest 2>&1 | tail -3`
Expected: clean and green.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/lib/workoutFormat.ts mobile/src/lib/__tests__/workoutFormat.test.ts mobile/src/components/training/daily/SwipeableWorkoutCard.tsx mobile/src/components/training/daily/TodayTab.tsx mobile/src/components/training/daily/CapturedWorkoutScreen.tsx
git commit -m "feat(workouts): the headline says how the workout runs"
```

---

### Task 8: Filter axes

**Files:**
- Modify: `mobile/src/types/workoutFilters.ts`
- Modify: `mobile/src/lib/workoutFilters.ts`
- Modify: `mobile/src/lib/workoutFilterStore.ts`
- Tests: `mobile/src/lib/__tests__/workoutFilters.test.ts`, `workoutFilterStore.test.ts`

- [ ] **Step 1: Types**

In `mobile/src/types/workoutFilters.ts`:

```ts
import type { BlockRole, WorkoutIntensity, WorkoutFormat, WorkoutScoreType } from "./dailyBlocks";
```

(replace the existing import). Add after `HistoryFilter`:

```ts
/** "untagged" matches workouts whose format the classifier has not set. */
export type FormatFilter = WorkoutFormat | "untagged";
```

In `WorkoutFilters`, after `blockRoles: BlockRole[];` add:

```ts
  formats: FormatFilter[];
  scores: WorkoutScoreType[];
```

In `EMPTY_FILTERS` add `formats: [], scores: [],` after `blockRoles: [],`.

- [ ] **Step 2: Write the failing filter tests**

Append inside `describe("applyWorkoutFilters", …)` in `workoutFilters.test.ts`:

```ts
  it("format: selected formats, or Untagged for a null format", () => {
    const amrapW = workout({ id: "a", tags: { ...workout().tags, format: "amrap" } });
    const blankW = workout({ id: "b", tags: { ...workout().tags, format: null } });
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["amrap"] }), none)).toEqual([amrapW]);
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["untagged"] }), none)).toEqual([blankW]);
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["amrap", "untagged"] }), none)).toHaveLength(2);
    expect(applyWorkoutFilters([amrapW, blankW], f({ formats: ["emom"] }), none)).toHaveLength(0);
  });

  it("score: selected scores; null never matches", () => {
    const loadW = workout({ id: "a", tags: { ...workout().tags, scoreType: "load" } });
    const blankW = workout({ id: "b", tags: { ...workout().tags, scoreType: null } });
    expect(applyWorkoutFilters([loadW, blankW], f({ scores: ["load"] }), none)).toEqual([loadW]);
    expect(applyWorkoutFilters([loadW, blankW], f({ scores: ["time"] }), none)).toHaveLength(0);
  });
```

Append to `describe("activeFilterChips / removeChip", …)`:

```ts
  it("labels format and score chips with the vocabulary, Untagged included, and removes them", () => {
    const filters = f({ formats: ["amrap", "untagged"], scores: ["calories"] });
    const chips = activeFilterChips(filters);
    expect(chips.map((c) => c.label)).toEqual(["AMRAP", "Untagged", "Calories"]);
    let out = filters;
    for (const c of chips) out = removeChip(out, c);
    expect(out).toEqual(EMPTY_FILTERS);
  });
```

Update the existing chip-order test ("labels the single-choice axes…") only if its expected order changes: it does not, because it selects no formats or scores.

Append to `describe("countActiveFilters", …)`:

```ts
  it("counts formats and scores", () => {
    expect(countActiveFilters(f({ formats: ["amrap", "untagged"], scores: ["load"] }))).toBe(3);
  });
```

Append to `describe("mostRestrictiveAxis", …)`:

```ts
  it("clears the format axis when that restores the most", () => {
    const list = [workout({ id: "a", tags: { ...workout().tags, format: "emom" } })];
    const filters = f({ formats: ["amrap"], equipment: ["Kettlebell"] });
    expect(mostRestrictiveAxis(list, filters, none, "")).toEqual({ axis: "formats", label: "AMRAP", count: 1 });
  });
```

- [ ] **Step 3: Write the failing store test**

Append inside `describe("workoutFilterStore", …)`:

```ts
  it("loads prefs saved before formats existed, and drops unknown format/score values", async () => {
    const stored = { ...EMPTY_FILTERS } as Record<string, unknown>;
    delete stored.formats; delete stored.scores;
    mockMemory.set(prefsKey("u1"), JSON.stringify({ filters: stored, sort: "name" }));
    expect((await loadWorkoutPrefs("u1")).filters).toEqual(EMPTY_FILTERS);
    mockMemory.set(prefsKey("u1"), JSON.stringify({
      filters: { ...EMPTY_FILTERS, formats: ["amrap", "untagged", "tabata"], scores: ["load", "vibes"] }, sort: "name",
    }));
    const { filters } = await loadWorkoutPrefs("u1");
    expect(filters.formats).toEqual(["amrap", "untagged"]);
    expect(filters.scores).toEqual(["load"]);
  });
```

- [ ] **Step 4: Run to verify they fail**

Run: `npx jest src/lib/__tests__/workoutFilters.test.ts src/lib/__tests__/workoutFilterStore.test.ts`
Expected: FAIL with type errors on `formats`/`scores` and failing assertions.

- [ ] **Step 5: Implement the filter module**

In `mobile/src/lib/workoutFilters.ts`:

Imports: add

```ts
import { FORMAT_LABELS, SCORE_LABELS } from "./workoutFormatVocab";
```

In `passes`, after the `blockRoles` block, add:

```ts
  if (f.formats.length > 0) {
    const wantsUntagged = f.formats.includes("untagged");
    const hit = w.tags.format !== null && f.formats.includes(w.tags.format);
    if (!hit && !(wantsUntagged && w.tags.format === null)) return false;
  }
  if (f.scores.length > 0) {
    if (w.tags.scoreType === null || !f.scores.includes(w.tags.scoreType)) return false;
  }
```

In `countActiveFilters`, add `f.formats.length + f.scores.length +` to the sum.

In `activeFilterChips`, after the `blockRoles` loop, add:

```ts
  for (const v of f.formats) {
    chips.push({ axis: "formats", label: v === "untagged" ? "Untagged" : FORMAT_LABELS[v], values: [v] });
  }
  for (const s of f.scores) chips.push({ axis: "scores", label: SCORE_LABELS[s], values: [s] });
```

In `removeChip`, add two cases:

```ts
    case "formats": return { ...f, formats: f.formats.filter((v) => !chip.values.includes(v)) };
    case "scores": return { ...f, scores: f.scores.filter((v) => !chip.values.includes(v)) };
```

In `AXIS_ORDER`, insert `"formats", "scores"` after `"blockRoles"`:

```ts
const AXIS_ORDER: FilterAxis[] = [
  "creators", "muscles", "equipment", "blockRoles", "formats", "scores", "intensity", "lengths", "skills", "history",
];
```

- [ ] **Step 6: Implement the store sanitizer**

In `mobile/src/lib/workoutFilterStore.ts`, import `ALL_FORMATS, ALL_SCORES` from `./workoutFormatVocab`, and in `sanitizePrefs` add after `blockRoles:`:

```ts
    formats: manyOf(f.formats, [...ALL_FORMATS, "untagged"] as const),
    scores: manyOf(f.scores, ALL_SCORES),
```

- [ ] **Step 7: Run to verify they pass**

Run: `npx jest src/lib/__tests__/workoutFilters.test.ts src/lib/__tests__/workoutFilterStore.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 8: Commit**

```bash
git add mobile/src/types/workoutFilters.ts mobile/src/lib/workoutFilters.ts mobile/src/lib/workoutFilterStore.ts mobile/src/lib/__tests__/workoutFilters.test.ts mobile/src/lib/__tests__/workoutFilterStore.test.ts
git commit -m "feat(workouts): Format and Score filter axes"
```

---

### Task 9: Filter sheet rows

**Files:**
- Modify: `mobile/src/components/training/daily/WorkoutFiltersSheet.tsx`

- [ ] **Step 1: Imports**

Add:

```ts
import { ALL_FORMATS, FORMAT_LABELS, ALL_SCORES, SCORE_LABELS } from "@/src/lib/workoutFormatVocab";
import type { FormatFilter } from "@/src/types/workoutFilters";
import type { WorkoutScoreType } from "@/src/types/dailyBlocks";
```

- [ ] **Step 2: Rows**

After the **Workout type** block (`<Text style={styles.section}>Workout type</Text>` and its `<View style={styles.pills}>…</View>`) and before `<Text style={styles.section}>Intensity</Text>`, add:

```tsx
            <Text style={styles.section}>Format</Text>
            <View style={styles.pills}>
              {ALL_FORMATS.map((fm) =>
                pill(FORMAT_LABELS[fm], draft.formats.includes(fm),
                  () => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, fm) }))))}
              {/* Dashed: a state, not a value. It finds what the classifier
                  skipped so the backfill can be reviewed by filtering. */}
              <TouchableOpacity key="untagged"
                style={[styles.pill, styles.pillDashed, draft.formats.includes("untagged") && styles.pillOn]}
                onPress={() => setDraft((d) => ({ ...d, formats: toggleIn<FormatFilter>(d.formats, "untagged") }))}
                accessibilityRole="button" accessibilityState={{ selected: draft.formats.includes("untagged") }}>
                <Text style={[styles.pillText, draft.formats.includes("untagged") && styles.pillTextOn]}>Untagged</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.section}>Score</Text>
            <View style={styles.pills}>
              {ALL_SCORES.map((sc: WorkoutScoreType) =>
                pill(SCORE_LABELS[sc], draft.scores.includes(sc),
                  () => setDraft((d) => ({ ...d, scores: toggleIn(d.scores, sc) }))))}
            </View>
```

Add a style:

```ts
  pillDashed: { borderStyle: "dashed", borderColor: colors.textFaint },
```

- [ ] **Step 3: Typecheck and lint**

Run: `npx tsc --noEmit && npx eslint src/components/training/daily/WorkoutFiltersSheet.tsx`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add mobile/src/components/training/daily/WorkoutFiltersSheet.tsx
git commit -m "feat(workouts): Format and Score rows in the filter sheet"
```

---

### Task 10: Workout screen — summary and editor

**Files:**
- Modify: `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx`

- [ ] **Step 1: Imports and draft**

Add:

```ts
import type { WorkoutFormat, WorkoutScoreType } from "@/src/types/dailyBlocks";
import {
  ALL_FORMATS, FORMAT_LABELS, ALL_SCORES, SCORE_LABELS, IMPLIED_SCORE,
  formatHasMinutes, minutesLabelFor,
} from "@/src/lib/workoutFormatVocab";
```

In the `Draft` interface, after `intensity: WorkoutIntensity | null;` add:

```ts
  format: WorkoutFormat | null;
  scoreType: WorkoutScoreType | null;
  /** Text, like estMinutes; parsed and range-checked in `save`. */
  formatMinutes: string;
```

In `draftFrom`, after `intensity: w.tags.intensity,` add:

```ts
  format: w.tags.format,
  scoreType: w.tags.scoreType,
  formatMinutes: w.tags.formatMinutes === null ? "" : String(w.tags.formatMinutes),
```

- [ ] **Step 2: Gaps**

In `tagGaps`, after the `estMinutes` line, add:

```ts
  // Filterable and, later, the live layout's key. Untagged reads "Untagged"
  // on the Workouts tab until someone sets it.
  if (w.tags.format === null) gaps.push("a format");
```

- [ ] **Step 3: Save**

In `save`, after the `est`/`estOk` lines, add:

```ts
    const typedFm = draft.formatMinutes.trim();
    // Minutes only mean something on a time-defined format; a stray number
    // left behind after switching to Rounds must not be saved.
    const fm = typedFm === "" || !formatHasMinutes(draft.format) ? null : Number(typedFm);
    const fmOk = fm === null || (Number.isInteger(fm) && fm >= 1 && fm <= MAX_EST_MINUTES);
```

Extend `tagsChanged`:

```ts
    const tagsChanged =
      rolesChanged ||
      est !== workout.tags.estMinutes ||
      draft.intensity !== workout.tags.intensity ||
      draft.format !== workout.tags.format ||
      draft.scoreType !== workout.tags.scoreType ||
      fm !== workout.tags.formatMinutes;
```

Inside `if (tagsChanged) {`, after the `!estOk` alert block, add:

```ts
      if (!fmOk) {
        Alert.alert(
          "Check the format minutes",
          `Give a whole number of minutes between 1 and ${MAX_EST_MINUTES}, or leave it empty.`,
        );
        return;
      }
```

In the `saveWorkoutTags(workout.workoutId, { … })` call, add after `intensity: draft.intensity,`:

```ts
        format: draft.format,
        scoreType: draft.scoreType,
        formatMinutes: fm,
```

- [ ] **Step 4: Summary line (reading)**

In the `!editing && classified` block, after the existing `<Text style={styles.tagSummary}>…</Text>`, add:

```tsx
              {workout.tags.format !== null && (
                <Text style={styles.tagSummary}>
                  {[
                    describeFormat(workout.rounds, workout.tags),
                    workout.tags.scoreType !== null && IMPLIED_SCORE[workout.tags.format] === workout.tags.scoreType
                      ? `scored by ${SCORE_LABELS[workout.tags.scoreType].toLowerCase()}`
                      : null,
                  ].filter(Boolean).join("   ·   ")}
                </Text>
              )}
```

Import `describeFormat` from `@/src/lib/workoutFormat` next to the existing `formatWorkoutHeadline` import. This reuses the card's phrase (the two must agree) and adds the implied score the card deliberately hides, because here there is room to say it.

- [ ] **Step 5: Editor rows**

In the editing block, after the **Intensity** `pillRow` `</View>`, add:

```tsx
              <Text style={styles.fieldLabel}>Format</Text>
              <View style={styles.pillRow}>
                {ALL_FORMATS.map((fm) => {
                  const on = draft!.format === fm;
                  return (
                    <TouchableOpacity
                      key={fm}
                      style={[styles.pill, on && styles.pillActive]}
                      // Picking a format pre-selects the score it implies;
                      // tapping the chosen one clears both. Minutes are left
                      // as typed: switching AMRAP → EMOM keeps the number.
                      onPress={() => patch(on
                        ? { format: null, scoreType: null }
                        : { format: fm, scoreType: IMPLIED_SCORE[fm] ?? draft!.scoreType })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Format ${FORMAT_LABELS[fm]}`}
                    >
                      <Text style={[styles.pillText, on && styles.pillTextActive]}>
                        {FORMAT_LABELS[fm]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {formatHasMinutes(draft!.format) && (
                <>
                  <Text style={styles.fieldLabel}>{minutesLabelFor(draft!.format)}</Text>
                  <TextInput
                    style={[styles.input, styles.estInput]}
                    keyboardType="number-pad"
                    maxLength={3}
                    value={draft!.formatMinutes}
                    onChangeText={(v) => patch({ formatMinutes: sanitizeInteger(v) })}
                    placeholder="e.g. 15"
                    placeholderTextColor={colors.mutedForeground}
                  />
                  <Text style={styles.fieldHint}>The number the creator stated. Leave it empty if none was given.</Text>
                </>
              )}

              <Text style={styles.fieldLabel}>Score</Text>
              <View style={styles.pillRow}>
                {ALL_SCORES.map((sc) => {
                  const on = draft!.scoreType === sc;
                  return (
                    <TouchableOpacity
                      key={sc}
                      style={[styles.pill, on && styles.pillActive]}
                      onPress={() => patch({ scoreType: on ? null : sc })}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Scored by ${SCORE_LABELS[sc]}`}
                    >
                      <Text style={[styles.pillText, on && styles.pillTextActive]}>
                        {SCORE_LABELS[sc]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {draft!.format !== null && IMPLIED_SCORE[draft!.format] !== null && (
                <Text style={styles.fieldHint}>Set from the format. Change it if the creator scores it differently.</Text>
              )}
```

Add a style next to `fieldLabel`:

```ts
  fieldHint: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },
```

- [ ] **Step 6: Typecheck, lint, suite**

Run: `npx tsc --noEmit && npx eslint src/components/training/daily/CapturedWorkoutScreen.tsx && npx jest 2>&1 | tail -3`
Expected: clean and green.

- [ ] **Step 7: Commit**

```bash
git add mobile/src/components/training/daily/CapturedWorkoutScreen.tsx
git commit -m "feat(workouts): edit and read Format, Score and minutes on the workout screen"
```

---

### Task 11: Verification

**Files:** the spec's Status line.

- [ ] **Step 1: Gates**

Run from `mobile/`: `npx tsc --noEmit && npx jest && npx eslint src/lib/workoutFormatVocab.ts src/lib/workoutFormat.ts src/lib/workoutFilters.ts src/lib/workoutFilterStore.ts src/lib/workoutTagValidate.ts src/components/training/daily`
Expected: tsc silent; jest green; no new lint warnings in the touched files.

- [ ] **Step 2: Device walk, frames F1–F6**

Set up per project memory: a dedicated new simulator (`xcrun simctl create "FitTracker-walk" "iPhone 17 Pro" com.apple.CoreSimulator.SimRuntime.iOS-26-2`), install the Local dev client from `~/Library/Developer/Xcode/DerivedData/FitTrackerLocal-*/Build/Products/Debug-iphonesimulator/FitTrackerLocal.app`, Metro on a non-default port (`LANG=en_US.UTF-8 npx expo start --port 8099 --clear`), open `fittracker-local://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8099`, tap Open. If the Claude simulator tool reports it has stopped retrying, drive with idb (`idb ui tap --udid <udid> x y`, screenshots via `xcrun simctl io <udid> screenshot`). The user signs in.

1. Open Training › flame › **Today** once so the lazy backfill runs (it needs the compose path); repeat a pull-to-refresh two or three times until the Workouts tab shows no more Untagged cards than a handful. Watch the Metro log for classify calls.
2. **F1**: the Workouts list; find an AMRAP, a rounds workout, and a sets workout; confirm the meta phrases match the phrase table.
3. **F2/F3**: open Filters; the Format and Score rows sit after Workout type; pick AMRAP + For time and Calories; the count and chips read as F3.
4. **F6**: Format: Untagged alone; confirm the cards fall back to rounds text.
5. **F4/F5**: open an AMRAP workout; the headline and summary lines read as F4; Edit; the Format row, the minutes field appearing only for time-defined formats (switch to Rounds and back), the Score row pre-selected to Rounds + reps; change the score, save, confirm the card and summary update; confirm an out-of-range minutes value is refused.
6. Kill and relaunch; formats persist (they are rows, not prefs) and the Format filter is remembered.

Record deviations from the mockup in chat before changing anything.

- [ ] **Step 3: Tear down**

Stop Metro, `xcrun simctl shutdown` and `delete` the walk simulator.

- [ ] **Step 4: Spec status**

In `docs/superpowers/specs/2026-09-10-workout-format-and-score-design.md`, change `**Status:** Approved design, pending implementation plan` to `**Status:** Implemented and device-verified <date> on branch \`workouts-tab-filters\` (plan: docs/superpowers/plans/2026-09-10-workout-format-and-score.md)`.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-10-workout-format-and-score-design.md docs/superpowers/plans/2026-09-10-workout-format-and-score.md
git commit -m "docs: workout format and score spec marked device-verified"
```

Then tell the user the branch is ready to merge to `main` (no PR).
