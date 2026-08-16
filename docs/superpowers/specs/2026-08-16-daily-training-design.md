# Daily Training — social-sourced exercise catalog + AI daily recommender

**Date:** 2026-08-16
**Status:** Approved design, pre-implementation
**Owner:** Brian Wilson

## 1. Problem & context

Brian is returning to training after ~8 weeks off, and for the next 6–7 weeks is
traveling (Arizona, Hawaii, Tahoe, NYC, Japan), likely at a different gym each
week. Workouts must be composable from whatever equipment the current gym has.

He constantly encounters exercises and workouts on Instagram/TikTok that he
wants to try but has no way to capture, organize, or programmatically reuse.

**Vision:** share (phase 3) or paste (phase 1) a social post into FitTracker;
AI extracts and indexes it — poster handle, exercise name(s), muscle groups,
equipment, category (warmup / stretch / conditioning / mobility / strength),
single exercise vs. full workout — into the existing unified exercise library
with a tappable link back to the original post. A daily recommender then
composes a complete session (~2 hours, adjustable) from the catalog, respecting
recovery, the current gym's equipment, a Push/Pull/Legs split, rotation, and
per-movement progressive scaling.

## 2. Decisions made (with rationale)

| Decision | Choice |
|---|---|
| Phasing | Catalog first — capture + browse ships in days; recommender mid-trip; share extension last |
| Capture fidelity | Caption text + thumbnail + 10-second user review. **No video download** — platform ToS + fragility. Manual caption paste as fallback for private/blocked posts |
| Placement | New third training mode ("Daily") alongside CrossFit and Strength modes |
| Skill levels | Learn as you go — start conservative (8 weeks detrained), promote/demote from post-workout too-easy/right/too-hard ratings |
| Catalog home | Merge into the existing unified `exercises` table (AI dedupes against existing entries); new source/attribution tables alongside |
| Gym equipment | Gym profiles: name, location, equipment checklist seeded from a preset (full commercial / hotel gym / bodyweight). One active at a time. **No trip entity** — gyms stand alone |
| Split | Push/Pull/Legs repeating sequence; a missed day shifts the sequence, never breaks it |
| Daily check-in | Soreness by muscle region (body-map taps) + energy (1–10) + minutes available (default 120) |
| Full-workout posts | Explode into individual exercises **and** keep the original as a captured workout servable whole |
| Pool bias | Captures get rotation priority; stock library fills structural gaps |
| BFR | Bands always packed → always-available equipment at the user level; recommender programs BFR finishers regularly |
| AI provider | Match existing pattern — OpenAI via Supabase edge functions (same keys, same two-tier model split as nutrition) |
| Engine architecture | **Approach A: hybrid rules + one AI judgment call** (below) |

### Engine architecture — Approach A

Mirrors the proven Nutrition OS doctrine (`supabase/functions/fuel-plan/index.ts`
header comment):

- Rules tier first: client-side, deterministic, instant, unit-tested pure TS
  modules. All arithmetic lives here.
- The model is asked exactly one thing it can't compute: a judgment call
  (compose today's session from pre-filtered candidates).
- Suggest only — the AI writes nothing; every acceptance is the user's tap.
- Constrained output: the model may only return IDs from the candidate list it
  was handed; the client re-validates.
- Rules keep the numbers; the model contributes composition + one-line reasons.
- If the AI call fails (hotel WiFi, bad response), the rules tier's top-ranked
  composition stands alone. **You always get a workout.**

Rejected: full-AI generation (untestable, drifts on progression math and time
budgets, no workout on failure) and pure rules (can't make the pairing/soreness
judgment calls the vision requires).

## 3. Data model

### 3.1 New tables

**`captured_sources`** — one row per shared post.
- `id`, `user_id`, `platform` (`instagram` | `tiktok` | `other`), `source_url`
  (the tap-back link), `poster_handle`, `caption_text`, `thumbnail_url`
  (rehosted into app-owned storage — never hot-linked), `captured_at`,
  `raw_extraction JSONB` (the AI's full output, for audit/debug),
  `extraction_status` (`pending` | `reviewed` | `failed`).

**`source_exercises`** — junction, many-to-many.
- `source_id → captured_sources`, `exercise_id → exercises`, plus
  `was_created` (this capture created the exercise vs. linked an existing one).
- One post can yield several exercises; one exercise can accumulate many
  sources over time.

**`captured_workouts`** — full-workout posts preserved whole.
- `id`, `source_id`, `name`, `notes`.
- **`captured_workout_exercises`**: `captured_workout_id`, `exercise_id`,
  `exercise_order`, `sets`, `reps` (TEXT — supports "21-15-9"),
  `rest_seconds`, `notes` — the creator's programming as parsed.

**`gym_profiles`**
- `id`, `user_id`, `name`, `location`, `preset` (`full_gym` | `hotel_gym` |
  `bodyweight` | `custom`), `is_active` (partial unique index: one active per
  user).
- **`gym_profile_equipment`**: `gym_profile_id`, `equipment_id → equipment`
  (existing reference table).
- User-level flag (profile/settings): BFR bands always available — injected
  into every gym's effective equipment list.

**`daily_checkins`**
- `id`, `user_id`, `checkin_date` (unique per user/date), `energy` (1–10),
  `minutes_available` (default 120).
- **`daily_checkin_soreness`**: `checkin_id`,
  `muscle_region_id → muscle_regions` (existing reference table),
  `severity` (1–3).

**`generated_sessions`** — the recommender's output + memory.
- `id`, `user_id`, `session_date`, `gym_profile_id`, `checkin_id`,
  `split_day` (`push` | `pull` | `legs`), `ramp_week` (re-entry ramp position),
  `source` (`ai` | `rules_fallback`), `served_captured_workout_id` (nullable),
  `status` (`suggested` | `accepted` | `completed` | `skipped`),
  `workout_instance_id` (nullable — set when logging starts),
  `inputs_snapshot JSONB` (candidates + constraints handed to the AI, for
  audit), `created_at`.
- **`generated_session_items`**: `session_id`, `exercise_id`, `item_order`,
  `section` (`warmup` | `main` | `accessory` | `bfr` | `cooldown`),
  `target_sets`, `target_reps` (TEXT), `rest_seconds`, `reason` (the AI's
  one-liner), `was_performed` (backfilled on completion — the
  suggested-vs-performed log, mirroring `eat_next_suggestions`).

**`exercise_skill_state`** — learn-as-you-go levels.
- `user_id`, `exercise_id`, `current_level` (`beginner` | `intermediate` |
  `advanced`), `consecutive_too_easy` (INT), `last_rating`
  (`too_easy` | `right` | `too_hard`), `updated_at`.
- Two consecutive `too_easy` → promote along the movement's progression chain
  (`movement_scaling_links`, which already exists with
  progression/regression/lateral types and difficulty deltas — currently
  unpopulated; capture + curation will fill it).

### 3.2 Changes to existing tables

- **`workout_instances`**: make `program_instance_id` and `program_workout_id`
  nullable so a generated session logs through the existing chain
  (`workout_instances → workout_sessions → exercise_instances →
  set_instances`) without a parallel logging system. Add a CHECK that a row has
  either a program parentage or a `generated_session` pointing at it (enforced
  app-side; DB check optional).
- **`exercises`**: no structural change. Captures create or link entries using
  the existing taxonomy junctions (`exercise_muscle_regions` with
  `is_primary`, `exercise_equipment`, `exercise_goal_types`), `skill_level`,
  and `video_url` left empty (the source link lives on `captured_sources`).

## 4. Capture pipeline

1. **Entry (phase 1):** capture button on the Daily surface opens a bottom
   sheet; paste an Instagram/TikTok URL. The phase-3 iOS share extension feeds
   this same pipeline — nothing gets rebuilt.
2. **Fetch (edge function `capture-post`):** given the URL, pull the post's
   public embed/oEmbed data — caption text, poster handle, thumbnail. The
   thumbnail is downloaded server-side and rehosted into app-owned storage
   (same fetch-and-rehost approach as `dish-image-search`'s pick action). If
   the platform returns nothing (private post, region block), the sheet lets
   the user paste the caption text manually; the URL still saves.
3. **Extract (same edge function, OpenAI judgment tier):** model reads caption
   + thumbnail and returns structured JSON: `post_type`
   (`single_exercise` | `full_workout`), and per exercise: proposed `name`,
   `muscle_regions` (primary/secondary), `equipment`, `category`
   (warmup/stretch/conditioning/mobility/strength), `skill_level`, and
   `library_match` — the id of an existing exercise it duplicates, if any
   (the model is handed a compact index of the current library to match
   against; client re-validates any returned id exists).
4. **Review (client):** a confirm card per capture shows the proposed entries,
   matches, and tags, editable inline. Nothing enters the catalog without the
   accept tap. Accepting writes `captured_sources` + exercise rows/links +
   taxonomy junctions (+ `captured_workouts` when applicable) in one
   transaction. Rejecting keeps the source row with `extraction_status:
   failed` for retry.

**Error handling:** fetch failure → manual-caption fallback; extraction
failure → source saved, user can retry or hand-enter; duplicate URL → surface
the existing capture instead of re-processing.

## 5. Daily recommender

### 5.1 Inputs
Today's check-in, active gym's effective equipment (checklist + BFR),
PPL position, recent history (existing logging chain), catalog with skill
states and rotation recency.

### 5.2 Rules tier — pure TS modules, on-device, offline-capable, unit-tested
- **Split position:** next of push/pull/legs by least-recently-completed;
  missed days shift the sequence.
- **Re-entry ramp:** weeks 1–2 volume-capped (reduced sets per muscle group),
  easing on a fixed schedule regardless of AI output.
- **Candidate filter:** muscle groups matching the split day; equipment ⊆
  active gym; sore regions (severity 2–3) excluded, severity 1 downgraded in
  rank.
- **Rotation ranking:** captures before stock; least-recently-performed first
  (derived from `exercise_instances` + `generated_session_items`).
- **Progression resolution:** each candidate resolved to the user's current
  level via `exercise_skill_state` + `movement_scaling_links` — handstand work
  surfaces as its beginner regression until earned.
- **Time budget:** warmup / main / accessories / BFR finisher / cooldown each
  get a slice of `minutes_available`; shortening trims from the back
  (cooldown → BFR → accessories). Low energy scales set counts down, not
  focus.
- Output: a ranked candidate list per section + a complete rules-only
  composition (the fallback).

### 5.3 AI tier — one judgment call (edge function `compose-session`)
Receives the pre-filtered, pre-ranked candidates + constraints. Returns a
composed session: exercise ids (only from the candidate list — re-validated
client-side, unknown ids dropped), order, sets, reps, rest, one-line `reason`
per pick. May serve a `captured_workout` whole when one fits the day's focus,
equipment, and time. Client operational scaffolding copies `useFuelPlan`:
single retry after token refresh, per-signature answer cache, event-driven
recompute (never timers).

### 5.4 Failure behavior
No connectivity / bad response / invalid ids → the rules-only composition is
the session, labeled `source: rules_fallback`. Always a workout.

### 5.5 Feedback loop
Post-workout: per-movement too-easy/right/too-hard taps update
`exercise_skill_state` (two consecutive too-easy → promote along the
progression chain). `generated_session_items.was_performed` is backfilled on
completion — recommended-vs-performed feeds future rotation and ramp logic.

## 6. Surfaces

- **Training tab, third mode "Daily"** alongside the kettlebell (CrossFit) and
  dumbbell (Strength) mode icons. Tabs:
  - **Today** — check-in sheet if none today, then the composed session with
    per-exercise source links (tap → original post).
  - **Workouts** — sessions servable whole: captured creator workouts in
    Phase 1, joined by the recommender's own compositions in Phase 2,
    distinguished by source. Each shows its movements, the rounds as
    prescribed, the creator's verbatim protocol, and a link back to the post.
  - **Exercises** — the captured movement collection with real filters: muscle
    region, equipment, category, poster handle, skill level — driven by the
    existing taxonomy junctions (finally replacing name-substring filtering).

  **Revised 2026-08-16 (was Today / Catalog / Gyms).** Two problems with the
  original: captured workouts had no read surface anywhere in the app, so the
  rows were write-only; and Gyms held a permanent tab slot for what is
  configuration rather than a daily surface. Splitting Catalog into Workouts
  and Exercises fixes the first. Gyms moves — see below.
- **Gym profiles** are not a Daily tab. Choosing today's gym belongs in the
  daily check-in (it is one more thing you answer about today, alongside
  soreness and time). Editing a gym's equipment checklist is rare setup and
  belongs in Profile with the other configuration screens. Both are Phase 2.
- **Capture button** in the Daily header.
- All pickers/check-ins/review cards are **bottom sheets** (standing rule: no
  inline pickers).
- **Home** — today-card points at the generated session when Daily mode is in
  use.
- **Execution/logging** — reuses the existing workout logging screen
  (`app/workout/[id].tsx`) via the relaxed `workout_instances` parentage.

## 7. Phasing

- **Phase 1 — ship this week:** migrations (§3), `capture-post` edge function,
  paste-a-link sheet, review card, Exercises tab with filters, Workouts tab
  showing captured workouts. Value: start collecting immediately.
- **Phase 2 — mid-trip:** gym profiles (check-in picker + Profile editor),
  check-in sheet, rules-tier modules,
  `compose-session` edge function, Today tab, Home card, logging integration.
  Value: the daily loop goes live.
- **Phase 3 — after:** progression promotion UX, BFR finisher programming,
  serving captured workouts whole, iOS share extension (expo-share-intent +
  dev build), polish.

## 8. Testing

- Every rules module is a pure TS function with unit tests in
  `src/lib/__tests__/` (same pattern as `fuelPlan`/`mealScore` et al.):
  split-position edge cases, ramp caps, soreness exclusion, time-budget
  trimming, rotation ordering, progression resolution.
- Edge functions: JSON output schema-validated; candidate-id constraint tested
  with adversarial fixtures (ids not in list → dropped).
- Capture: golden-file tests for extraction JSON → row-writing transaction.
- Reminder: the Supabase client is untyped — a green typecheck proves nothing
  about column names; migration ↔ client field names need eyeball + runtime
  verification.

## 9. Out of scope (explicitly)

- Video download or vision analysis of platform-hosted video (ToS + fragility).
- Automatic gym-equipment inference from photos.
- Any writes by AI without a user tap.
- CrossFit class/WOD result logging (separate known gap, untouched here).
- Multi-user/social features of the catalog.
