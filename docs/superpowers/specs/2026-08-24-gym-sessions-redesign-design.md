# Gym Sessions Redesign — Design

**Date:** 2026-08-24
**Status:** Approved direction (B hero + A cards); spec pending user review
**Mockups:** `.superpowers/brainstorm/68061-1787615752/content/` (layout-directions, stats-calendar-tabs, combined-direction)

## Purpose

Track > Gym Sessions currently shows a stat strip, a flat session list, and a month
calendar. This redesign turns it into the app's training-history hub: named sessions
with rich per-card detail, goals and streaks in the header, a Stats tab with trends
and records, and a calendar that understands rest days.

Decisions below were settled interactively (2026-08-24). Where a feature needs data
that does not exist yet, the gap and its phase are called out.

## Page structure

Three sub-tabs under a shared header: **History**, **Stats**, **Calendar**.
The existing List/Calendar segmented control is replaced by this three-way control.

### Shared header (hero, collapsing)

At the top of the page, above the tabs:

- **Weekly goal ring** — sessions completed vs weekly target (e.g. 5/6). Only real
  sessions advance the ring; rest days never count as sessions.
- **Streak line** — daily on-plan streak (🔥 n-day) and weeks-in-a-row.
- **Week rail** — seven day-pills for the current week: trained (green), confirmed
  rest day (💤), missed/upcoming (dim).
- **Stat tiles** — Sessions / Volume / Time for the trailing 7 days (unchanged
  semantics from today).

On scroll the hero collapses to one compact row: small ring, streak text, and
this week's volume. Tapping the compact row scrolls back to the full hero.

## History tab

Chronological session cards, newest first.

### Card anatomy (dense, heatmap-left)

- **Mini muscle heatmap** — small body-silhouette component, trained regions lit,
  derived from the session's exercises' primary muscle regions. One compact
  component sized for cards; front/back handling decided at implementation.
- **Title** — never "Workout". Naming rule below.
- **Date** — format rule below.
- **Meta line** — exercise count (main work only, warm-ups excluded from the
  count), `est <planned> → <actual>` duration (est omitted when no estimate
  exists), total volume, pace where meaningful.
- **Chips** — muscle region chips (Chest, Triceps, ...), modality/category chip
  (slot reserved; renders only once the movement model supplies it), PR badge
  (`PR ×n`) when the session set records.

### Session naming rule

Use the title of the session's main workout:

1. Program session → program workout name (exists today).
2. Catalog/captured session → captured workout name (exists today).
3. Block-composed daily session → name of the captured workout serving the
   **main** block; if the main block is a built-in or absent, fall back to an
   emphasis-derived name ("Push Day", "Full Body Session").
4. Legacy/unknown → emphasis-derived name, never the literal "Workout".

### Date format rule

- Within the trailing 7 days: weekday + day ("Mon 24").
- Older, current calendar year: month + day ("Aug 16").
- Prior calendar years: **MM/DD/YY** ("08/16/25").

## Stats tab

One global **Week / Month / Year** segmented control scopes everything on the tab.

1. **Summary tiles** — Workouts, Time, Volume, Exercises for the period, each with
   a delta vs the previous period ("+4 vs July").
2. **Weekly goals block** — see Goals section.
3. **Volume chart** — bars by day/week/month depending on scope.
4. **Strength chart** — estimated 1RM (Epley) line per lift, with a lift picker
   (defaults to the user's most-logged lifts; user-selectable).
5. **Frequency & duration chart** — session-count/time bars with a **body-weight
   overlay** line pulled from Track > Weight.
6. **Records section** — recent PRs with a "See all records" drill-in screen.

Calories are **deliberately excluded** — training calories stay out of this page;
nutrition lives in Fuel.

## Calendar tab

- **Month / Week toggle.**
- **Month view** — the existing dot grid (fixed seven-cell weeks) plus 💤 markers
  on confirmed rest days.
- **Week view** — seven day-cards showing date and volume (💤 for rest days).
- Both views drive the same tappable **day detail** below: that day's sessions
  with time, exercises, duration, volume, muscles, PRs.

## New concepts

### Weekly goals (new entity — phased)

No goal entity exists today. New per-user weekly goal settings, edited inline from
the Stats tab goals block:

- **Phase 1:** sessions-per-week target → header ring + goals bar.
- **Phase 2:** volume target and muscle-coverage target (regions hit this week
  out of the user's target set), each with its own progress bar.

### Streaks (rest-day aware)

- **Daily streak** = consecutive days **on plan**: each day either has a session
  or is a confirmed rest day. Unplanned empty days break it. Today being empty
  doesn't break it until the day ends (existing behavior preserved).
- **Weeks in a row** = consecutive calendar weeks meeting the weekly session
  goal; when no goal is set, any week with ≥1 session counts.

### Records / PRs (computed — phased)

No PR data exists today; records are **computed from set history**, no new
user-facing logging. Per exercise: heaviest weight, best estimated 1RM (Epley),
best single-session volume. A session card's `PR ×n` badge counts records set in
that session. Whether records are computed client-side from fetched history or
materialized in a view is an implementation decision.

### Muscle heatmap component

New reusable component: compact body silhouette with regions lit from
`exercise_muscle_regions` primary regions. Used on history cards (small) and
available to the session detail screen (large).

### Modality / category chip

Depends on the movement-model redesign (Stage 1 of 6 landed). The card reserves
the chip slot and simply omits it until sessions can be tagged with
modality/category. No redesign work blocks on the movement model.

## Data gaps summary

| Need | Source | Status |
|---|---|---|
| Session names for block sessions | main-block captured workout | derivable now |
| Estimated duration | program `estimated_duration_minutes`, captured workout minutes, block minutes sum | exists, needs plumbing |
| Region-level muscles | `exercise_muscle_regions` | exists |
| Modality/category | movement model (in progress) | slot degrades until ready |
| Weekly goals | new entity | build (phased) |
| Rest days in streak/calendar | rest-days feature (shipped 2026-08-24) | integrate |
| PRs | computed from `set_instances` history | build (phased) |
| Calories | — | dropped by decision |

## Phasing

1. **Phase 1 — structure + History:** three-tab layout, hero header with collapse
   (ring shows sessions vs a hardcoded-default goal until goals land), session
   naming, card redesign with heatmap + chips + est→actual, date formats,
   Calendar tab with Month/Week toggle and rest markers.
2. **Phase 2 — Stats:** summary tiles with deltas, four charts, rest-day-aware
   streak rework, weeks-in-a-row.
3. **Phase 3 — Goals & Records:** weekly-goal entity + editing, multi-metric
   goals, PR computation, records section + drill-in, PR badges on cards.
4. **Later:** modality chip lights up when the movement model supplies it.

## Testing

- Unit: naming rule (all four sources + fallbacks), date formatting (three
  brackets, year boundaries), streak arithmetic with rest days (preserve, break,
  today-grace), weeks-in-a-row with and without goals, goal progress math,
  PR detection (weight, e1RM, session volume), period deltas.
- Charts render from the same lib-level selectors the tests cover; chart visuals
  verified on device.
- Device verification per screen per the usual workflow (dedicated simulator).

## Out of scope

- Workout calories (any source).
- Movement-model tagging itself (only the chip slot is this project's).
- Social/sharing features seen in competitor research.
