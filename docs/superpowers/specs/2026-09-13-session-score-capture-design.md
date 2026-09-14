# Session-End Score Capture — Design Spec

**Date:** 2026-09-13
**Status:** Approved in brainstorm; awaiting written-spec review
**Follows:** `2026-09-13-workout-detail-page-v2-design.md` §10 (the named follow-on) and `2026-09-10-workout-format-and-score-design.md` (the score vocabulary; its non-goal "no live-session … score entry" is lifted here).

## 1. Problem

A captured workout carries a score type (rounds + reps, time, load, …) but nothing ever records a score. Finishing a served-whole session ends in an alert and `router.back()`; the workout page's history block can only count days ("Score tracking is coming — for now this counts the days you did it."). A 15-minute AMRAP done three times has no "6 + 14 → 7 + 2" to show, and the mock's Best and trend bars are placeholders.

## 2. Goals / non-goals

**Goals**
- When a served-whole session finishes, ask for the score in the workout's own units, prefilled where the session already knows it.
- Store one score per session; let it be added or corrected later from the workout page.
- Light up Best, the eight-session trend bars, and PR badges on the workout page's history block, mirroring the exercise page's rules.

**Non-goals**
- Scores for a captured workout used as one block inside a composed day (history counts served-whole only; unchanged).
- Unit preferences (the app is lb-only; distance/height take a stated unit, not a picker).
- Live countdown or interval timers; the live screen's layout is unchanged apart from the closing sheet.
- Scores on the Today tab's completed card, or anywhere outside the live screen and the workout page.

## 3. Decisions (user-approved 2026-09-13)

1. **Where:** the live session's Finish — the completion alert is replaced by a score sheet when the workout has a score type; skippable.
2. **Inputs:** tailored inputs for rounds + reps, time, reps, load; a single number in a stated unit for distance, calories, duration, height; three pills for quality; nothing for "not scored" or an unclassified workout.
3. **Time:** prefilled from the session clock in live mode, blank in backfill; a "Hit the time cap" toggle when the workout has a cap; a capped result stores the cap time, is flagged, and ranks below any finished time.
4. **Later entry:** from the workout page's history block — Sessions rows show the score, "Add score" on rows without one, tap to add or edit; the Track session moves to a long-press.
5. **Storage:** a new `session_scores` table shaped like `session_debriefs`, not columns on the session row.

## 4. Experience

### 4.1 The score sheet

A `BottomSheet` (`dismissOnScrim` off — it holds typed content) with:
- Title **"How did it go?"**; subtitle the workout name.
- The score label from `SCORE_LABELS` (e.g. "Rounds + reps") as a field caption.
- The input for the score type (§4.2).
- **Save** (primary, full width) and **Skip** (quiet text link under it). In edit mode (opened from the workout page with an existing score) the link reads **Remove score** instead of Skip and asks once ("Remove this score?") before deleting.
- Inline error text under the buttons on a failed write; the sheet stays open with the typed values.

Save is disabled until the input is valid (§4.2). Numeric fields use `keyboardType="number-pad"` and the existing digit sanitiser.

### 4.2 Inputs by score type

| score type | input | valid when | display |
|---|---|---|---|
| `rounds_reps` | two fields: Rounds, Reps (partial) | rounds ≥ 0 and reps ≥ 0, not both 0 | `6 + 14`; `6` when reps is 0 |
| `time` | mm : ss pair (the `SetTimeSheet` minute/second pair, lifted into a small shared input); **Hit the time cap** switch shown when `formatMinutes` is set | total seconds > 0, or capped | `12:34`; `Capped` when capped |
| `reps` | one field | > 0 | `120 reps` |
| `load` | one field, caption "lb" | > 0 | `185 lb` |
| `distance` | one field, caption "m" | > 0 | `2,000 m` |
| `calories` | one field, caption "cal" | > 0 | `50 cal` |
| `duration` | mm : ss pair | > 0 | `2:30` |
| `height` | one field, caption "in" | > 0 | `24 in` |
| `quality` | three pills: Rough · Solid · Crisp | one selected | the word |
| `none` / null | — sheet never shows | — | — |

**Time prefill.** In live mode the pair is prefilled from `recordedSpan().durationSeconds` (the same number the finish writes to `workout_sessions`), rounded to the second. In backfill mode the pair is blank. Turning **Hit the time cap** on fills the pair with the cap (`formatMinutes` × 60), disables it, and sets `capped`; turning it off clears the pair back to the prefill (or blank).

### 4.3 Finish flow on the live screen

Unchanged order: flush unsaved instances → write `workout_sessions` end → write `workout_instances` completion → `completeSession()` for daily. Then, instead of the "Workout Complete" alert:
- If `servedWorkout` is null, or its `tags.scoreType` is null or `"none"`, or `completeSession` declined (the false-start guard), show the existing alert and back out as today.
- Otherwise open the score sheet. **Save** writes the score (§5.3) then backs out; **Skip** backs out. The score is written only after `completeSession` has returned success, so a refused completion never leaves an orphan row.

The duration line the old alert carried ("Duration: 18:32") moves into the sheet's subtitle so nothing is lost.

### 4.4 The workout page's history block

`WorkoutHistoryBlock` becomes the exercise block's twin:

**Trend view.** Three stats — *Last done*, *Best* (formatted per §4.2; "—" when no session has a score), *Times* — then the bar strip and caption row exactly as `HistoryBlock` draws them:
- One bar per session with a score, last eight, oldest left; height ∝ the session's score on a "taller is better" scale (§5.2); the best-ever session's bar highlighted.
- Caption "Score, last N sessions"; direction label "trending up / down / holding steady" from the latest bar vs the median of the earlier ones; omitted under three scored sessions.
- Under three scored sessions but at least one: bars still draw, no direction label.
- No scored sessions at all: the caption reads "Add a score to see your trend." and no bars.
- Quality-scored workouts: Best shows the word; no bars; caption "Rated, not scored."

**Sessions view.** Up to four rows, newest first: date · score (or "· Add score" in the link colour when none). A green **PR** badge when the score was a record at the time (§5.2). Tapping a row opens the score sheet in add or edit mode for that session. Long-pressing a row opens the Track session (`/(tabs)/track/gym-sessions/[id]`) when it has one; the row's a11y hint says so. "See all N sessions ›" is unchanged.

**Never done:** unchanged ("You haven't done this one yet.").

### 4.5 Where nothing changes

The Workouts tab card, the Today tab, the debrief and movement-rating sheets, Track's session list and detail, and the live screen's layout before Finish.

## 5. Data model and rules

### 5.1 Table

Migration `supabase/migrations/<timestamp>_session_scores.sql`:

```sql
create table public.session_scores (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  session_id  uuid not null unique references public.generated_sessions(id) on delete cascade,
  workout_id  uuid not null references public.captured_workouts(id) on delete cascade,
  score_type  text not null check (score_type in
    ('reps','rounds_reps','load','time','distance','calories','duration','quality','height')),
  value_a     integer,      -- rounds | seconds | reps | lb | m | cal | in
  value_b     integer,      -- partial reps (rounds_reps only)
  quality     text check (quality in ('rough','solid','crisp')),
  capped      boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint session_scores_value_shape check (
    (score_type = 'quality' and quality is not null and value_a is null and value_b is null) or
    (score_type = 'rounds_reps' and value_a is not null and value_b is not null and quality is null) or
    (score_type not in ('quality','rounds_reps') and value_a is not null and value_b is null and quality is null)
  )
);
create index session_scores_workout_idx on public.session_scores (user_id, workout_id);
alter table public.session_scores enable row level security;
create policy "own scores" on public.session_scores to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`workout_id` is denormalised from the session's `served_captured_workout_id` so the workout page's read is one query. `capped` is meaningful only for `time`. `updated_at` is set by the client on edit.

### 5.2 Pure rules (`src/lib/workoutScore.ts`)

```ts
type Score =
  | { type: "rounds_reps"; rounds: number; reps: number }
  | { type: "time"; seconds: number; capped: boolean }
  | { type: "reps" | "load" | "distance" | "calories" | "duration" | "height"; value: number }
  | { type: "quality"; quality: "rough" | "solid" | "crisp" };
```

- **`formatScore(score)`** → the display strings of §4.2 (thousands separator on distance; `Capped` for a capped time).
- **`compareScores(a, b)`** → negative when `a` is worse than `b`, positive when better, 0 when equal. Rules: `rounds_reps` lexicographic (rounds, then reps); `time` lower seconds wins, and any capped result loses to any uncapped one (two capped results tie); `duration`, `reps`, `load`, `distance`, `calories`, `height` higher wins; `quality` rough < solid < crisp. Comparing two different types is a programming error and throws.
- **`bestScore(rows)`** — walks chronologically so ties go to the earliest (the exercise page's rule).
- **`scoreHeight(score, window)`** → 0–1 "taller is better": for higher-wins types `value / max`; for `time`, uncapped `min / seconds` scaled so the fastest is 1 and capped results sit at 0.15 (visible, below every finish); `rounds_reps` on `rounds × 1000 + reps` (reps is bounded by a round, so this preserves lexicographic order for any real workout); `quality` is not charted.
- **`trendBars(rows)`** — last eight scored sessions, `{ sessionId, height, best }`; **`trendDirection(rows)`** — latest vs median of the earlier bars using `compareScores`, null under three; reuse `TREND_LABELS` from `exerciseHistory.ts`.
- **`sessionRows(rows)`** — `{ sessionId, sessionDate, durationSeconds, score, isPr }` where `isPr` is true when the score beat every earlier score (first scored session is a PR).
- **`parseClock(mins, secs)`** → seconds or null (blank or non-digit fields are null; 0:00 is null). The inverse already exists as `splitDuration(seconds)` in `src/lib/setTiming.ts` — reuse it, do not add a twin.

### 5.3 Reads and writes (`src/lib/supabase/sessionScores.ts`)

- `fetchWorkoutScores(userId, workoutId)` → `Map<sessionId, Score>`; empty on error (fails closed like the history read).
- `upsertSessionScore({ userId, sessionId, workoutId, score })` — upsert on `session_id`, sets `updated_at`; returns `{ ok: true } | { ok: false; message }`.
- `deleteSessionScore(sessionId)` — same result shape.

`WorkoutSessionRow` gains `score: Score | null`; `fetchWorkoutHistory` runs `fetchWorkoutScores` alongside its second query and joins by session id. `summarizeWorkoutHistory` is unchanged; the block calls the new pure functions on `rows`.

### 5.4 The sheet's contract (`src/components/workout-session/ScoreSheet.tsx`)

```ts
interface ScoreSheetProps {
  visible: boolean;
  workoutName: string;
  scoreType: Exclude<WorkoutScoreType, "none">;
  /** Seconds the session clock recorded; null in backfill mode or when unknown. */
  elapsedSeconds: number | null;
  /** The workout's time cap in minutes; null when none. */
  capMinutes: number | null;
  /** Present when editing; drives "Remove score" instead of "Skip". */
  existing: Score | null;
  /** Called with the score to persist; the sheet shows the error and stays open on { ok: false }. */
  onSave: (score: Score) => Promise<{ ok: true } | { ok: false; message: string }>;
  onSkip: () => void;
  onRemove?: () => Promise<{ ok: true } | { ok: false; message: string }>;
  onClose: () => void;
}
```

The live screen supplies `onSave` = upsert then `router.back()`; the workout page supplies upsert then refetch history.

## 6. Architecture

| File | Responsibility |
|---|---|
| `supabase/migrations/<ts>_session_scores.sql` | §5.1. |
| `mobile/src/lib/workoutScore.ts` (+ `__tests__/workoutScore.test.ts`) | §5.2 pure rules and parsing. |
| `mobile/src/lib/supabase/sessionScores.ts` | §5.3 reads/writes. |
| `mobile/src/components/workout-session/ScoreSheet.tsx` | §4.1–4.2 sheet; owns its input state; renders the mm:ss pair via a new `ui/ClockInput.tsx` extracted from `SetTimeSheet`'s minute/second fields. |
| `mobile/app/workout/[id].tsx` | §4.3: `finishWorkout` opens the sheet instead of the alert when scorable; state for the sheet; passes `recordedSpan().durationSeconds` (live) or null (backfill), `servedWorkout.tags.formatMinutes`. |
| `mobile/src/lib/workoutHistory.ts`, `mobile/src/lib/supabase/workoutHistory.ts` | Row gains `score`; read joins scores. |
| `mobile/src/components/training/workout-detail/WorkoutHistoryBlock.tsx` | §4.4; bars/caption/PR markup borrowed from `item-detail/HistoryBlock.tsx` (extract `bars`, `barSlot`, `bar`, `barBest`, `direction*`, `pr`, `prText` into `historyStyles.ts` so both blocks share them). |
| `mobile/src/components/training/daily/CapturedWorkoutScreen.tsx` | Mounts `ScoreSheet` for the history rows; refetches history after save/remove. |

Reused as-is: `BottomSheet`, `DebriefSheet`'s pill row style, `SCORE_LABELS`, `formatDuration`, `TREND_LABELS`, `formatShortDate`, `lastDonePhrase`, the `numeric()` sanitiser pattern.

## 7. State and persistence

- One score per session, editable; `updated_at` on edit.
- The sheet's input state is local; nothing persists on Skip.
- The workout page refetches history on focus (already) and after a save/remove from its own sheet.

## 8. Error handling

- Score write fails at Finish: the sheet shows "Couldn't save the score — you can add it from the workout page." and offers Save again and Skip; the session is already completed.
- Score write fails from the workout page: inline error, sheet stays open.
- Scores read fails: history renders as if unscored (bars absent, "Add score" on rows); the day counts still show.
- `completeSession` declines: existing alert, no sheet, no row.
- A score row whose `score_type` no longer matches the workout's current type (the workout was re-tagged after scoring) is still shown with its own type's formatting; Best and bars use only rows whose type matches the workout's current type.

## 9. Testing

`workoutScore.test.ts`: `formatScore` for every type incl. capped and zero-reps rounds; `compareScores` per type incl. capped-vs-uncapped and tie; `bestScore` tie → earliest; `scoreHeight` ordering (fastest tallest, capped lowest, rounds_reps lexicographic); `trendBars` window of eight and best flag; `trendDirection` under three → null, up/down/steady; `sessionRows` PR flags including the first session; `parseClock` round-trips with `splitDuration`, and returns null for blanks, non-digits, and 0:00. Migration applied with `npx supabase db push`. Device pass on walk3: finish a for-time (live) — prefill shown, save, page shows the time and a PR; finish an AMRAP — two fields, save; cap toggle; Skip; add a score later from a row; edit it; remove it; three scored sessions show bars and a direction; a quality workout shows the word and no bars; long-press opens Track.

## 10. Out of scope / follow-ons

- Scores on the Today tab's completed card and on the Workouts tab card ("PR" chip).
- A results view across all workouts (a "records" screen).
- Per-round splits for EMOM/intervals.
