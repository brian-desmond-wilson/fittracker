# Workout Format & Score — Design Spec

**Date:** 2026-09-10
**Status:** Implemented and device-verified 2026-09-10 on branch `workouts-tab-filters` (plan: docs/superpowers/plans/2026-09-10-workout-format-and-score.md)
**Builds on:** `docs/superpowers/specs/2026-09-10-workouts-tab-filters-design.md` (branch `workouts-tab-filters`, device-verified). This spec adds two axes to that design and does not change anything else in it.
**Visual reference:** Mockup artifact frames F1–F6 — https://claude.ai/code/artifact/ffbbd571-4cbc-4414-a954-518230712ef1. Where prose and mockup disagree, this spec wins.
**Surfaces:** captured-workout data, the capture classifier, the workout screen's tag editor, the Workouts tab card and filter sheet.

## 1. Problem

A captured workout says what to do but not how it runs or how it is scored. "6 rounds of 5 movements", "AMRAP 15", "EMOM 12", "21-15-9 for time" and "5×5 for load" are all stored as a free-text `rounds` string plus the creator's protocol. Nothing structured tells the app how the workout is performed, so it cannot filter by it ("I want something for time", "I want to burn calories"), cannot describe it on a card better than "3 rounds", and, later, cannot lay out a live session correctly: a rounds workout is a checklist, an AMRAP is a clock and a counter.

The CrossFit module already has two lists for this on its own tables (`wod_formats` and `scoring_types`) but captured workouts do not use them.

## 2. Goals / non-goals

**Goals**
- Every captured workout can carry a **Format** (how it runs) and a **Score** (what you record), plus the one number some formats are defined by (an AMRAP's or EMOM's minutes).
- The classifier assigns both at capture; the user can correct either on the workout screen.
- The existing library is backfilled automatically and the user reviews by looking at cards and filtering.
- Both are filter axes on the Workouts tab; Format replaces the raw rounds text on the card.

**Non-goals**
- No live-session layouts, timers or score entry. This spec only records the attributes those will key off.
- No change to the CrossFit module or its tables. The vocabularies are mirrored as text CHECK columns, not foreign keys, so the two modules stay decoupled.
- No change to the recommender's use of `rounds` and `est_minutes`.

## 3. Decisions (user-approved 2026-09-10)

1. **Two attributes, not one.** Format is how the workout runs and drives layout; Score is what is recorded at the end. A rounds workout may be scored by load or not at all; an AMRAP is always rounds + reps. One field cannot hold both.
2. **Format vocabulary:** Sets & reps, Rounds, AMRAP, EMOM, For time, Intervals, Chipper, Ladder.
3. **Backfill:** AI-classify every existing workout; the user reviews by scanning cards and can filter Format: Untagged to find what the classifier could not decide.
4. **Card:** Format replaces the rounds text in the meta line ("7 movements · AMRAP 15 min"). Score appears only when the format does not imply it.

## 4. Vocabulary

### 4.1 Format (`captured_workouts.format`, single value)

| Value | Label | Meaning | Implied score |
|---|---|---|---|
| `sets_reps` | Sets & reps | Each movement has its own sets; straight-set strength work | — |
| `rounds` | Rounds | The whole list repeated N times (`rounds` holds N, e.g. "3-4") | — |
| `amrap` | AMRAP | As many rounds/reps as possible in `format_minutes` | Rounds + reps |
| `emom` | EMOM | Every minute on the minute for `format_minutes` | — (usually Not scored or Load) |
| `for_time` | For time | Finish the prescribed work as fast as possible; `format_minutes` is the cap when one is stated | Time |
| `intervals` | Intervals | Fixed work/rest blocks (Tabata and similar); `format_minutes` is the total when stated | — |
| `chipper` | Chipper | One pass through a long list, usually for time | Time |
| `ladder` | Ladder | Ascending or descending rep scheme across rounds (21-15-9); the scheme stays in each item's `reps` | Time |

### 4.2 Score (`captured_workouts.score_type`, single value)

Mirrors the CrossFit module's `scoring_types` names so a person moving between modes sees one vocabulary.

| Value | Label |
|---|---|
| `reps` | Reps |
| `rounds_reps` | Rounds + reps |
| `load` | Load |
| `time` | Time |
| `distance` | Distance |
| `calories` | Calories |
| `duration` | Duration / hold |
| `quality` | Quality |
| `height` | Height / range |
| `none` | Not scored |

### 4.3 Minutes (`captured_workouts.format_minutes`, integer 1–240, nullable)

The number a time-defined format is built on: the AMRAP cap, the EMOM length, a For-time cap, an interval block's total. Null for formats that have no such number, and null when the creator did not state one. It is not the same as `est_minutes`, which is the classifier's estimate of how long the whole thing takes; for an AMRAP the two usually agree, for a For-time workout they usually do not.

## 5. Data

One migration, `supabase/migrations/20260916100000_workout_format_score.sql`:

```sql
ALTER TABLE captured_workouts
  ADD COLUMN format text
    CHECK (format IN ('sets_reps','rounds','amrap','emom','for_time','intervals','chipper','ladder')),
  ADD COLUMN score_type text
    CHECK (score_type IN ('reps','rounds_reps','load','time','distance','calories','duration','quality','height','none')),
  ADD COLUMN format_minutes integer
    CHECK (format_minutes BETWEEN 1 AND 240);
COMMENT ON COLUMN captured_workouts.format IS 'How the workout runs; drives the live layout. Null = not yet classified.';
COMMENT ON COLUMN captured_workouts.score_type IS 'What is recorded when the workout is done. Null = not yet classified.';
COMMENT ON COLUMN captured_workouts.format_minutes IS 'The minutes a time-defined format is built on (AMRAP cap, EMOM length). Not the duration estimate.';
```

All three nullable; no backfill in SQL (the classifier does it, §7). `WorkoutTags` gains `format: WorkoutFormat | null`, `scoreType: WorkoutScoreType | null`, `formatMinutes: number | null`; both fetches select the columns; `saveWorkoutTags` writes them.

## 6. Classification

The `classify` action in `supabase/functions/capture-post/index.ts` gains three response fields and matching prompt rules:

- `format`: exactly one of the eight tokens. Rules of thumb for the model: per-movement sets with no whole-list repeat → `sets_reps`; a stated number of rounds through the list → `rounds`; "AMRAP"/"as many rounds as possible" → `amrap`; "EMOM"/"every minute" → `emom`; "for time"/"as fast as possible"/a time cap on a fixed list → `for_time`; work/rest blocks or "Tabata" → `intervals`; one long list done once for time → `chipper`; a rep scheme like 21-15-9 or 10-9-8… → `ladder`. Never null: when nothing is stated, `sets_reps` if items carry sets, else `rounds`.
- `score_type`: exactly one of the ten tokens. Implied by format where §4.1 says so; otherwise from the caption ("for load", "max calories", "hold for time"); `none` when nothing is scored (mobility, warm-ups, most cooldowns).
- `format_minutes`: the stated number for `amrap`, `emom`, `for_time` (cap) and `intervals` (total); null otherwise or when unstated. Never an estimate.

The validator (`workoutTagValidate.ts`) accepts the three fields with the same stance as intensity: an unknown or missing value degrades to null, never rejects the classification. The edit screen's "gaps" line lists a missing format ("a format") the same way it lists a missing duration.

## 7. Backfill and review

The lazy backfill in `composeDay.ts` today classifies only workouts with `classified_at IS NULL`. Its candidate set widens to "unclassified, or classified with `format IS NULL`". A workout picked up for format only goes through the same `classifyWorkout` call (the prompt returns everything; the save writes everything, so a re-run also refreshes intensity and duration — acceptable, and a re-run of an already-good classification is stable in practice). The per-run cap of 12 and the four-wide pool stay; the 48-workout library backfills across the first few Today loads. The Workouts tab does not trigger classification itself; it reads what is there.

Review is by inspection, on purpose: the card shows the format on every row, the filter sheet's Format axis has an **Untagged** pill that matches `format IS NULL`, and the workout screen edits both fields. There is no confirmation state and no review list; a wrong tag is fixed where it is seen.

## 8. Experience

### 8.1 Card (Workouts tab, frame A1 amended)

The meta line becomes "**N movements · <format phrase>**", where the phrase is:

| Format | Phrase |
|---|---|
| sets_reps | *(nothing; the movement count stands alone)* |
| rounds | "3 rounds" / "3-4 rounds" from `rounds` (today's text) |
| amrap | "AMRAP 15 min", or "AMRAP" without minutes |
| emom | "EMOM 12 min", or "EMOM" |
| for_time | "For time", or "For time · 20 min cap" |
| intervals | "Intervals", or "Intervals 16 min" |
| chipper | "Chipper" |
| ladder | "Ladder" (the scheme is visible in the items) |
| null | today's behaviour: rounds text if any, else nothing |

Score is appended as " · <label>" only when it is **not** implied by the format (§4.1) and is not `none`: "6 rounds · load", "EMOM 12 min · calories". `formatWorkoutHeadline` grows a `format`/`formatMinutes`/`scoreType` input and owns this table; it is unit-tested.

### 8.2 Filter sheet (frame A3 amended)

Two new sections after **Workout type**, before **Intensity**:

- **Format** — pills in vocabulary order plus a trailing **Untagged** pill. Multi-select. Untagged matches `format IS NULL`; it composes with the others by OR like any pill.
- **Score** — pills in vocabulary order. Multi-select. No Untagged pill (score follows format; if format is missing so is score).

Chips: one per selected value, labelled with the vocabulary label ("AMRAP", "For time", "Untagged", "Calories"). The "Drop …" rescue and the count logic need no change.

### 8.3 Workout screen tag editor

Below Intensity: a **Format** row of pills (single choice) and a **Score** row of pills (single choice), and a **Minutes** number field that appears only for `amrap`, `emom`, `for_time`, `intervals`, labelled by format ("AMRAP minutes", "Time cap"). Choosing a format whose score is implied sets Score automatically; the user can still change it. Saving goes through `saveWorkoutTags` like the other tags; `classified_at` handling is unchanged.

### 8.4 Sort

**Shortest / Longest** stay on `est_minutes`. No change: `format_minutes` is a cap or a block length, not a duration.

## 9. Filtering rules (additions to the filters spec §5)

| Axis | Match rule |
|---|---|
| Format | `tags.format` is in the selection, or "Untagged" is selected and `tags.format === null`. |
| Score | `tags.scoreType` is in the selection. Null never matches. |

`WorkoutFilters` gains `formats: (WorkoutFormat | "untagged")[]` and `scores: WorkoutScoreType[]`; `EMPTY_FILTERS`, `countActiveFilters`, `activeFilterChips`, `removeChip`, `clearAxis`, `mostRestrictiveAxis`'s axis order (Format and Score sit after `blockRoles`), the store's sanitizer, and the tests all extend accordingly. The stored-prefs key stays `v1`: the sanitizer tolerates the new fields being absent.

## 10. Error handling

- A classification that returns an unknown format lands as null; the card falls back to the rounds text and the workout shows under Untagged.
- `format_minutes` outside 1–240 or non-integer degrades to null.
- Backfill failures are per-workout and already logged by `classifyWorkout`; the attempt counter stops a hopeless workout from costing a call per load.

## 11. Testing

- `workoutTagValidate.test.ts`: the three fields accepted, unknowns → null, minutes bounds.
- `workoutFormat.test.ts`: every row of the §8.1 phrase table, with and without minutes, with implied vs explicit score.
- `workoutFilters.test.ts`: Format matching incl. Untagged and OR composition; Score matching; chips and removal for both; axis order in `mostRestrictiveAxis`.
- `workoutFilterStore.test.ts`: old prefs without the fields load; unknown format/score values drop.
- Device walk: card phrases for an AMRAP, a rounds workout and a sets workout; the two new pill rows; Untagged before and after a backfill pass; editing on the workout screen updates the card.

## 12. Rollout

One migration (additive, nullable), one edge-function change (deploy `capture-post`), pure TS in the app; no native change. Order: migration → types/validator/save → edge function → backfill widening → card phrase → filters → editor → walk.
