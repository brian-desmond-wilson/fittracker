# Rest Day & Tomorrow Preview — Design

**Date:** 2026-08-24
**Status:** Approved in brainstorming; pending spec review

## Overview

On Training > Today, when no session exists for today, the user can declare
today a rest day (full rest or active recovery). Declaring the day immediately
composes a **preview draft of tomorrow's session** using assumed inputs, so the
user goes to bed knowing tomorrow's plan. In the morning, a lightweight
"anything change?" confirm either keeps the draft untouched or recomposes it.
Rest becomes a first-class recorded state that feeds the recommender and shows
on the calendar.

## Goals

- Deliberate rest is recorded, undoable, and visibly distinct from "never
  opened the app."
- Declaring the day (rest **or** active recovery) unlocks tonight's preview of
  tomorrow's session.
- Tomorrow's draft survives to the morning and is confirmed or recomposed by
  the normal check-in, never silently discarded.
- The recommender knows the previous day was deliberate rest.

## Non-goals

- Generating more than one day ahead.
- Editing/rerolling tomorrow's draft the night before (preview is read-only;
  adjustments happen in the morning via the normal flows).
- Scheduling future rest days or a weekly rest cadence.
- Proactive "you should rest" suggestions (listed as a future enhancement).

## UX

### Entry point (empty Today state)

Below the primary "Set up my day" button — at the end of the scrollable
content, never pinned — a secondary action: **"Make today a rest day."**
Tapping opens a bottom sheet (all pickers/sheets come up from the bottom) with
two choices:

1. **Full rest** — no training today.
2. **Active recovery (~10 min)** — a short mobility + cooldown session.

### Full rest

- Writes today's rest record (see Data model).
- Today tab replaces the empty state with a **rest-day card**: a calm
  confirmation, an **Undo** action, and beneath it **tomorrow's preview draft**
  (header, blocks, budget bar — read-only, no start button, clearly labeled
  "Tomorrow · preview").
- Undo deletes the rest record and tomorrow's draft (if still untouched) and
  returns to the normal empty state.

### Active recovery

- Synthesizes a minimal auto check-in (most-recent gym, short time budget,
  today's known soreness, flagged `auto: true` in the snapshot) and composes
  today's session **forced into recovery shape** (mobility + cooldown blocks
  only) via the existing recovery-day path in `dailyBlockCompose.ts` /
  `dailyBlockShortlist.ts`.
- The session behaves like any other session (start, log, complete). The day
  counts as deliberate recovery for the recommender.
- Tomorrow's preview draft appears alongside, same as full rest — the day is
  decided either way.
- No special undo: existing flows (dismiss, build another) already cover it;
  the day only reads as "recovery" once the session exists.

### Tomorrow morning

- Today tab finds an existing `suggested` session for the new day but no
  check-in for that day. New state: **draft confirm** — the plan is shown with
  two actions:
  - **"Looks right — start"**: accepts the draft exactly as previewed
    (creates the real check-in from the assumed inputs, marked confirmed).
  - **"Anything change?"**: opens the normal SetupSheet pre-filled with the
    assumed inputs. If saved answers produce a different compose signature,
    the session recomposes; if unchanged, the draft is kept byte-for-byte.
- If the user instead starts a catalog workout, existing adoption flow applies
  unchanged.

### Calendar (Track)

Rest days render as a distinct muted mark (e.g., small "rest" glyph/dot in a
neutral tone) instead of a blank disabled cell. Accessibility label:
"{day}, rest day". Active-recovery days that were completed render as normal
training days (they have a real logged session).

## Data model

### `generated_sessions.status` gains `'rested'`

- Migration extends the status CHECK constraint:
  `('suggested','accepted','completed','skipped','rested')`.
- A rest record is a `generated_sessions` row for today with
  `status = 'rested'`, no blocks, no items, `source = 'user_pick'`,
  `day_reason = 'Rest day'` (or similar), `inputs_snapshot` noting
  `{ restKind: 'full' }`.
- `'rested'` is **terminal**, so it lives outside the
  `generated_sessions_pending_day` partial unique index (which covers only
  `suggested`/`accepted`) — no collision with a later real session if the user
  un-rests and trains. Add a matching partial unique index
  `ON (user_id, session_date) WHERE status = 'rested'` so a day can hold at
  most one rest record.
- **Readers must learn the new status.** Today, `pickDaySession`
  (`mobile/src/lib/dailyAdopt.ts`) ignores non-pending rows and
  `fetchDayStatus` only reports pending/completed/in-progress. Both (and the
  Home card) must surface `rested` as "day is decided: rest."

### Tomorrow's draft row

- A normal `generated_sessions` row with `session_date = addDays(today, 1)`
  (local calendar dates via `getLocalDateString`/`addDays` in
  `mobile/src/lib/dates.ts`), `status = 'suggested'`, blocks/items persisted
  as usual.
- `inputs_snapshot` carries `{ assumed: true }` plus the assumption set, so
  the morning flow knows to run draft-confirm instead of treating it as a
  same-day composition.
- No `daily_checkins` row is written for tomorrow at draft time — the
  check-in table keeps its hard one-per-day uniqueness and its semantics
  ("what the user actually reported"). The real check-in is created in the
  morning on confirm/adjust.
- The existing pending-per-day partial unique index already guarantees only
  one open session for tomorrow.

## Composition of the draft

Assumed inputs, assembled by a new helper (lives beside the other daily libs):

| Input | Assumption |
|---|---|
| Gym | Most recently used gym profile |
| Minutes | Median of recent completed sessions (fallback: last check-in's value, then app default) |
| Soreness | Today's latest known soreness carried forward, decayed one step |
| Energy | Neutral (mid-scale) |
| Coverage/history | Computed as of tomorrow's date — today's rest (no usage rows) is naturally reflected |

The draft runs the full existing pipeline (rules tier → one AI ask →
validate → persist) with tomorrow's date threaded through instead of the
hardcoded "today". `useDailySession`'s single-clock-sample pattern is
preserved: draft composition takes its own date sample and passes
`addDays(sample, 1)` everywhere.

The compose signature is stamped from the assumed inputs. Morning recompose
decision = recompute signature from real inputs and compare; this also
naturally catches "user trained anyway after declaring rest" (usage changes
the signature → recompose).

## Recommender integration

- New input flag: `yesterdayWasRest` (true when yesterday has a `rested` row
  **or** a completed recovery-shaped session). Passed to both the rules tier
  and the AI compose call; effect: remove yesterday-muscle avoidance pressure
  and allow full intensity — rest earns a green light, it doesn't read as
  neglect.
- No change to `captured_workout_usage` — rest days correctly write no usage.

## Edge cases

- **Rest, then train anyway (catalog workout):** rest record is cleared when a
  workout starts on a rested day (training voids the rest). Tomorrow's draft
  stays; the morning signature check recomposes it because coverage changed.
- **Consecutive rest days:** tomorrow arrives, user rests again — allowed. The
  existing draft for that day is deleted and replaced by the rest record, and
  a new draft is composed for the day after.
- **Draft exists but user never confirms:** the draft is just a `suggested`
  session; if the day passes, it goes stale like any unaccepted session does
  today (invisible once its date is no longer "today"). No cleanup needed.
- **Empty catalog:** if composition can't produce a draft (no content), the
  rest record still writes; the preview area shows the existing
  "nothing to work with yet" message for tomorrow.
- **Day rollover while app open:** unchanged from today's behavior — each
  compute takes a fresh clock sample.

## Testing

- Unit: assumed-input assembly (gym/minutes/soreness fallbacks), signature
  equality between draft inputs and unchanged morning confirm, `rested`
  visibility in `pickDaySession`/`fetchDayStatus`, forced recovery shape for
  active recovery.
- Integration (mocked Supabase layer): rest → draft → morning confirm keeps
  session; rest → draft → changed check-in recomposes; undo deletes both
  rows; rest → catalog workout clears rest record.
- Schema note: the Supabase client is untyped — a green typecheck proves
  nothing about column names; migration and query changes need a real
  round-trip check.
- On-device: full flow on simulator (rest tonight → relaunch with tomorrow's
  date or time-travel helper → confirm flow), calendar rendering of rest
  days.

## Future enhancements (explicitly out of scope)

- Proactive rest suggestion when check-in signals scream recovery
  (`isRecoveryDay` already computes this — surface it as "want to just make
  today a rest day?").
- Weekly rest-cadence awareness in the recommender.
- Scheduling rest days ahead of time.
