# Workout Detail Page v2 — Design Spec

**Date:** 2026-09-13
**Status:** Approved in brainstorm; awaiting written-spec review
**Screen:** Training › Flame (daily) › Workouts › tap a workout
**Decision record:** the full-page mockup at `.superpowers/brainstorm/76391-1789345000/content/full-page.html` (two phones: an AMRAP and a 3-rounds-for-time). Build the mock; propose deviations in chat, never ship them.

## 1. Problem

The captured-workout page holds the right facts but reads like a form: a title, a boxed thumbnail, a grey metadata line, a text list of muscles, and a numbered list of movement names with a chevron. The format — the single most important fact about a workout — is a footnote under the list ("Repeat the whole list 3 times"). The movements carry no thumbnail, muscles, or equipment even though the Exercises tab card and the exercise page already draw all three. The creator is a small row at the bottom. The page looks nothing like the exercise page it sits beside.

## 2. Goals / non-goals

**Goals**
- The page reads as the exercise page's sibling: hero with the title on it, a stat row, a history block, chips, then the parts.
- The format is the first thing you understand: on the hero as a badge, and as a band that frames the movement list.
- Every movement row shows its thumbnail, its muscles, and its equipment.
- The creator sits under the title with two clear routes: the byline opens their profile, the hero opens the post.
- Starting stays the primary action at the end of the scroll; placing the workout on a day joins it.

**Non-goals**
- Recording a workout score (rounds + reps, time, load) at the end of a live session. That is the follow-on that lights up "Best" and the trend bars; see §10.
- Editing mode. The existing inline editor (name, description, tags, items) is kept as it is and rendered instead of the read view while `editing`. This spec redesigns only the read view.
- Rendering intervals, EMOM minutes, or blocks as structure. The data model is one flat list plus a round count; the format band is the whole of the structure shown.
- Changing the Workouts tab card.

## 3. Decisions (user-approved 2026-09-13)

1. **Purpose:** both — start from here, and place it on a day.
2. **Format framing:** a bold band above the movement list carries the format; the "repeat N times" footnote goes; the hero badge repeats the same words.
3. **Raw protocol:** collapsed to a single tappable row that expands in place.
4. **History:** a full "Your history" block under the stat row, like the exercise page — reduced to last done / times done / sessions until scores exist (decision 8).
5. **Creator and links:** avatar + handle as a byline under the title, tapping it opens the creator's profile; the hero (post thumbnail with a play glyph) opens the post.
6. **Movement rows:** two-tier — 64pt thumbnail; name and prescription on top; an icon-only facts line underneath (muscles, divider, equipment).
7. **Header:** the exercise-page hero — title and byline overlaid on the hero's bottom edge over a gradient, format badge top-left, play glyph centred; Edit moves into a ⋮ menu. Stat row is Time / Intensity / Skill / Scored by; format is not repeated there.
8. **History scope:** ship last done / times done / sessions list now; no best score or trend bars until a session-end score exists.

## 4. Experience

Order, top to bottom. Everything scrolls; nothing is pinned.

### 4.1 Nav bar

Back chevron left; ⋮ right. The ⋮ menu (the same action-sheet pattern the exercise page uses) holds **Edit** and **Open post on Instagram** (or "on TikTok" by platform). Nothing else. Tapping Edit enters the existing editing mode; in editing mode the nav shows Cancel / Save exactly as today.

### 4.2 Hero

Full-width, 230pt, the post thumbnail (`source.thumbnailUrl`) with a bottom gradient to the page background.
- **Format badge** top-left, green fill, dark text, uppercase, letter-spaced: the format phrase (§5.2). Hidden when the workout is untagged (`format` null).
- **Play glyph** centred. The whole hero is one tap target: it opens `source.sourceUrl` externally. Accessibility label "Open the original post".
- **Title** at the bottom over the gradient, two lines max, tail-ellipsised.
- **Byline** under the title: `CreatorAvatar` at 24pt, the handle in green, then "· Instagram ↗" (or the platform) in muted text. One tap target: opens the creator's profile URL (§5.4). Hidden when there is no handle; the hero still opens the post.
- **No thumbnail:** the hero is a flat surface in the card colour with the title, byline, and badge in the same places; the play glyph is omitted and the hero is not tappable.

### 4.3 Stat row

Four equal columns, small uppercase labels, bold values, hairlines above and below.

| Label | Value | Empty |
|---|---|---|
| TIME | `~{estMinutes} min` | "—" |
| INTENSITY | Low / Moderate / High | "—" |
| SKILL | Beginner / Intermediate / Advanced | "—" |
| SCORED BY | score-type display name (§5.3) | "—" |

Each column with a value is a button that opens the Workouts tab with that one axis set (§6, `workoutFilter`): TIME → the `lengths` bucket that contains `estMinutes` (using the tab's own bucketing function, so the two never disagree), INTENSITY → `intensity`, SKILL → `skills`, SCORED BY → `scores`. Untagged workouts show four dashes and the row is not tappable; the existing "Tag this workout" affordance is kept where it is today, directly under the row.

### 4.4 Your history

A section titled "Your history" with a segmented **Trend | Sessions** toggle, matching the exercise page's `HistoryBlock` in frame and typography.

- **Never done:** one card with the line "You haven't done this one yet." No toggle, no link.
- **Trend view:** three stats — *Last done* (relative phrase, same rules as the exercise page), *Times* (count of completed sessions that served this workout whole), and *First done* (the earliest session's date, short form). No bars, no direction label. Caption under the stats: "Score tracking is coming — for now this counts the days you did it."
- **Sessions view:** the same card as a list, newest first, at most four rows: date, "· " and the session's display name. Each row opens that session in Track (`/(tabs)/track/gym-sessions/[id]`).
- Under the card in both views: "See all N sessions ›", opening the Track session list filtered to sessions whose served workout is this one.

"Completed sessions that served this workout whole" is exactly the rule `fetchWorkoutCompletions` already uses (status completed, `served_captured_workout_id` set). A day where this workout was one block inside a composed session does not count.

### 4.5 Role pills and description

A row of quiet outlined pills, uppercase, one per block role (MAIN, CONDITIONING, WARMUP, …). Each opens the Workouts tab with `blockRoles` set to that role. Below it the description in body text. Both are omitted when empty.

### 4.6 Hits

Section titled "Hits".
- Primaries: named chips — `MuscleIcon` at 26pt plus the muscle name — wrapping.
- Secondaries, on a second line: `MuscleIcon` at 20pt dimmed, no names, followed by "also X, Y, Z" in muted text.
- Each chip opens the Workouts tab with `muscles` set to that muscle.
- Omitted when the workout has no muscles.

### 4.7 You'll need

Section titled "You'll need". One outlined tile per name in `derivedEquipment`: `EquipmentGlyph` at 20pt plus the name. A bodyweight-only workout (`isBodyweight`) shows one tile, "Bodyweight". Each real-equipment tile opens the Workouts tab with `equipment` set to that name; the Bodyweight tile is not tappable.

### 4.8 Format band and movement list

**Band.** A card-coloured strip: the format phrase in green uppercase letter-spaced text, a plain-English gloss under it, and "N movements" right-aligned. Untagged: the band shows "N movements" alone and no gloss. When `rounds` is set and the format is not one that already implies rounds, the gloss says so (§5.2 table).

**Rows.** Numbered, two-tier, 64pt thumbnail (`imageUrl`; fallback a dimmed primary `MuscleIcon` on the card colour, or a generic dumbbell glyph when there is no muscle either):
- Line 1: name, one line, tail-ellipsised.
- Line 2: the prescription exactly as `describePrescription` (or the existing inline builder) renders it today ("10 reps @ 50/35 lb", "6 each side", "200m"). Notes stay on a third muted line when present.
- Facts line: primary `MuscleIcon` at 20pt, then up to two secondaries dimmed at 20pt; a 1pt hairline divider; then one `EquipmentGlyph` badge per equipment name, in the bordered green circle the Exercises card uses. No muscles and no equipment → the facts line is omitted and the row is shorter.
- Chevron right; the row opens the exercise page as today.

**Pending (unmatched) rows** keep their current treatment (no thumbnail, "not in your catalog" affordance) and sit after the matched rows, as now.

### 4.9 As the creator wrote it

Under the list: a single row, "As the creator wrote it" with a chevron, collapsed by default. Tapping expands the raw protocol text in place (monospace, card background, as today) and turns the chevron. The expanded state is not persisted. Omitted when `rawProtocol` is empty.

### 4.10 Actions

The last things in the scroll, in this order:
1. **Start Workout** — primary, unchanged behaviour: opens `StartModeSheet`, then adopts the workout for today and pushes the live session. Same confirmations as today for a pending, completed, or rested day.
2. **Add to a day** — secondary (outlined). Opens a `BottomSheet` with three choices: **Today**, **Tomorrow**, **Pick a date…** (which raises the platform date picker as a sheet, never inline, per `WhenSheet`'s rule; past dates are disabled). Confirming adopts the workout for that date without starting it and shows a toast "Added to {Today | Tomorrow | 14 Sep}"; when the date is today the app navigates to the Today tab as "Add to today" does on the exercise page, otherwise it stays on the page.
   - If the chosen day already has a pending (suggested/accepted) session, the sheet says so before confirming: "Tuesday already has a session planned. Replace it?" — Replace / Cancel. Replacing marks the old one skipped, which is what `adoptCapturedWorkout` already does.
   - If the chosen day is a declared rest day, the confirm reads as Start's does today: "Tuesday is a rest day. Adding this makes it a training day."
   - If the chosen day already has a *completed* session, adding creates a second session for that day; no confirm needed beyond the toast.
   - Disabled (with the caption "Today is already this workout") when today's pending or live session is this workout served whole.

Both buttons are hidden while editing and when the workout has no matched movements, as Start is today.

## 5. Data model and rules

### 5.1 Per-movement facts (query change)

`fetchCapturedWorkout`'s nested `exercise` select gains `image_url` and `exercise_muscle_regions(is_primary, muscle_region(name))`. `CapturedWorkoutItemEntry` gains:

```ts
imageUrl: string | null;
muscles: { name: string; isPrimary: boolean }[];   // primaries first, then secondaries, each in name order
```

`equipment` is already present per item. The mapping into these fields is pure and lives beside the existing `equipmentNamesOf`.

### 5.2 Format phrase and gloss

Pure, in `src/lib/workoutFormatPhrase.ts`, from `format`, `formatMinutes`, and `rounds`:

| format | phrase | gloss |
|---|---|---|
| amrap | `AMRAP · {m} MIN` (or `AMRAP` when minutes null) | "As many rounds as possible" (+ " in {m} minutes") |
| emom | `EMOM · {m} MIN` | "Every minute on the minute" (+ " for {m} minutes") |
| for_time | `FOR TIME` / `{rounds} ROUNDS · FOR TIME` | "As fast as you can" / "Repeat the whole list {rounds} times, as fast as you can" |
| rounds | `{rounds} ROUNDS` / `ROUNDS` | "Repeat the whole list {rounds} times" / "Repeat the whole list" |
| intervals | `INTERVALS` (+ ` · {m} MIN`) | "Work and rest on the clock" |
| chipper | `CHIPPER` | "Work through the list once, top to bottom" |
| ladder | `LADDER` | "Reps climb (or fall) each round" |
| sets_reps | `SETS & REPS` (+ ` · {rounds} ROUNDS` when rounds set) | "Sets and reps, rest as needed" (+ "; repeat the list {rounds} times") |
| null | — (badge hidden) | — (band shows the count alone) |

The hero badge shows the phrase; the band shows the phrase and the gloss. One function, two callers, so they can never disagree.

### 5.3 Score-type display names

`reps` → "Reps", `rounds_reps` → "Rounds + reps", `load` → "Load", `time` → "Time", `distance` → "Distance", `calories` → "Calories", `duration` → "Duration", `quality` → "Quality", `height` → "Height", `none` → "Not scored". Pure, same module as §5.2.

### 5.4 Creator profile URL

Pure, in `src/lib/creatorHandle.ts` (which already normalises handles): `profileUrl(platform, handle)` → `https://www.instagram.com/{handle}/` or `https://www.tiktok.com/@{handle}`; null for any other platform or an empty handle. The byline is hidden when this is null.

### 5.5 Workout history

`src/lib/supabase/workoutHistory.ts`: one query for the reader's completed sessions with `served_captured_workout_id = this workout`, returning `{ sessionId, sessionDate, displayName }[]` newest first. `src/lib/workoutHistory.ts` (pure) turns that into last-done phrase, count, most-recent date, and the four session rows. The last-done phrase reuses the exercise page's rule (same helper).

### 5.6 Add to a day

`src/lib/addWorkoutToDayPlan.ts` (pure): from a day's status (`fetchDayStatus` shape: pending / completed / in progress / rested, plus whether the pending or live session is this workout served whole) and whether the date is today, decide the branch — `adopt`, `confirmReplace`, `confirmUnrest`, `addSecond`, `disabled` — and the confirm copy. `src/lib/supabase/addWorkoutToDay.ts` re-reads the day, re-plans, refuses on mismatch (the exercise page's "Today changed since this page opened" rule), then calls `adoptCapturedWorkout({ date })`. No new tables; the morning draft already leaves `user_pick` sessions alone, so a future-dated adoption survives.

## 6. Architecture

Pure logic in `src/lib`, pixels in components. `CapturedWorkoutScreen.tsx` is 1,200 lines and renders every section inline; the read view is split into section components so the file becomes a composer, and the editor stays where it is.

**New**

| File | Responsibility |
|---|---|
| `src/lib/workoutFormatPhrase.ts` | §5.2 phrase + gloss, §5.3 score-type names. |
| `src/lib/workoutHistory.ts` | §5.5 pure history shaping. |
| `src/lib/supabase/workoutHistory.ts` | §5.5 query. |
| `src/lib/addWorkoutToDayPlan.ts` | §5.6 pure planner. |
| `src/lib/supabase/addWorkoutToDay.ts` | §5.6 executor. |
| `src/components/training/workout-detail/WorkoutHero.tsx` | §4.2. |
| `src/components/training/workout-detail/WorkoutStatRow.tsx` | §4.3. |
| `src/components/training/workout-detail/WorkoutHistoryBlock.tsx` | §4.4; borrows `HistoryBlock`'s frame styles (extract the shared card/segment styles into `item-detail/historyStyles.ts` rather than copying). |
| `src/components/training/workout-detail/WorkoutChips.tsx` | §4.5–4.7 role pills, Hits, You'll need. |
| `src/components/training/workout-detail/FormatBand.tsx` | §4.8 band. |
| `src/components/training/workout-detail/MovementRow.tsx` | §4.8 row. |
| `src/components/training/workout-detail/CreatorProtocolRow.tsx` | §4.9 collapsible. |
| `src/components/training/workout-detail/AddToDayButton.tsx` | §4.10 button + sheet + date picker. |

**Changed**

| Was | Becomes |
|---|---|
| `CapturedWorkoutScreen.tsx` renders the read view inline | Composes the components above when not editing; the editing branch is untouched. Start handler unchanged. |
| `fetchCapturedWorkout` / `toCapturedWorkoutEntry` in `lib/supabase/capture.ts` | Select and map `image_url` + muscle regions per item (§5.1). |
| `CapturedWorkoutItemEntry` in `types/capture.ts` | Gains `imageUrl`, `muscles`. |
| `creatorHandle.ts` | Gains `profileUrl`. |
| `app/(tabs)/training/index.tsx` accepts `exerciseFilter` | Also accepts `workoutFilter` (JSON of a partial `WorkoutFilters`), consumed and cleared the same way; sets Daily mode and the Workouts tab. |
| `WorkoutsTab.tsx` loads saved prefs on mount | Merges an `initialFilters` prop over loaded prefs and saves the result, mirroring `CatalogTab`. |
| `HistoryBlock.tsx` owns its card styles | Card, segment, stat, and link styles move to `historyStyles.ts` and are imported back; no visual change to the exercise page. |

**Reused as-is:** `CreatorAvatar`, `MuscleIcon`, `EquipmentGlyph`, `BottomSheet`, `StartModeSheet`, `adoptCapturedWorkout`, `fetchDayStatus`, `fetchCreator`, the last-done phrase helper in `exerciseHistory.ts`, the Exercises card's equipment-badge style.

## 7. State and persistence

- Trend | Sessions is saved with the same store and key scheme as the exercise page, under `training.workout.historyView.v1:${userId}`. Default Trend.
- The raw-protocol expansion is component state only.
- Chip and stat-row navigation writes through the Workouts tab's normal "applied change saves" path.
- Everything else is derived on open; Add to a day re-reads the day immediately before writing.

## 8. Error handling

- History query fails → the section renders the never-done card; nothing else on the page is affected (the page today already tolerates a missing completion line).
- Creator lookup fails → byline shows the initial-letter avatar; still tappable.
- Thumbnail fails to load → the muscle-icon fallback of §4.8.
- Profile or post URL fails to open → the existing "Couldn't open link" alert.
- Add to a day: on failure the sheet closes and an inline error appears under the button ("Couldn't add it. Try again."); the day is left untouched — `adoptCapturedWorkout` already undoes a half-written session.
- Untagged workout: badge hidden, stat row dashes, band shows the count alone, Tag affordance unchanged.

## 9. Testing

Pure modules get unit tests in `src/lib/__tests__`:
- `workoutFormatPhrase`: every format × minutes-present/absent × rounds-present/absent, plus null; score-type names.
- `workoutHistory`: empty, one session, five sessions (four rows, newest first), last-done phrase boundaries.
- `addWorkoutToDayPlan`: every day status × today/not-today × this-workout-already-served; the mismatch refusal.
- `creatorHandle.profileUrl`: instagram, tiktok with and without "@", other, empty.
- `capture` mapper: an item with primaries and secondaries orders primaries first; an item with no muscles yields `[]`; `image_url` null passes through.

Device pass on the walk3 simulator: both mock workouts (an AMRAP and a 3-rounds-for-time), an untagged workout, a bodyweight-only workout, a workout with no thumbnail, a never-done workout, a done workout; Add to a day → Today / Tomorrow / date on a planned day and on a rest day; hero → post; byline → profile; every chip and stat cell lands on the Workouts tab with the right filter; Edit → the editor still works and Save returns to the new read view.

## 10. Out of scope / follow-ons

- **Session-end score capture.** When a served-whole session finishes, ask for the score in the workout's `scoreType` units and store it on the session. That spec then adds *Best* and the trend bars back to §4.4, in the positions the mock shows.
- A creator page inside the app (deferred previously on the exercise page too).
- Any change to the Workouts tab card or the Today tab's rendering of an adopted workout.
