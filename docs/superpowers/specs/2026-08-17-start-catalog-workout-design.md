# Start a catalog workout — running a saved workout instead of today's recommendation

**Date:** 2026-08-17
**Status:** Approved design, pre-implementation
**Owner:** Brian Wilson

## 1. Problem & context

Daily Training Phase 1 ships a catalog of workouts captured from social posts,
and Phase 2 ships a recommender that composes a session each morning from the
exercise catalog. The two do not meet. A captured workout can be browsed and
edited, but there is no way to *do* it: the only startable thing in the app is
the session the recommender built.

Brian saves workouts precisely because he intends to do them. On a given day he
will open one — say a kettlebell conditioning workout from a creator — and want
to run that instead of the push/pull/legs session waiting on the Today tab.

**This design adds a Start button to a captured workout's page and defines what
"instead of" means for the daily loop's memory.**

### Three things already half-built that this completes

The schema and the recommender already anticipate this and stop short:

- `generated_sessions.served_captured_workout_id` exists (Phase 2 migration) and
  the AI composer may return a `servedWorkoutId` naming a whole captured workout.
- When it does, `validateAiSession` deliberately returns `items: []` — "a workout
  served whole keeps its creator's shape; we didn't compose its sections."
- Nothing consumes that. The Today tab renders sections from items, so a served
  workout renders as an empty session; the logging screen builds its template
  from session items, so it would play nothing.
- `captured_workouts.raw_protocol` carries the caption's prescription verbatim,
  and its column comment already states its purpose: "what the Phase-2
  recommender should show when it serves a captured workout whole."

So the path exists as a dead end. This work finishes it, and the manual Start
button and the AI's own `servedWorkoutId` converge on the same rendering and the
same playback.

## 2. Decisions made (with rationale)

| Decision | Choice | Why |
|---|---|---|
| What Start does | Adopts the workout as **today's session**, then hands off to the existing logging screen | Everything the loop learns from hangs off the session record. A workout started outside it would log exercises correctly but leave the recommender believing you never trained |
| The recommended session | Marked **skipped**, kept | Preserves "suggested X, did Y instead" — the most useful signal a learning recommender has. Overwriting the row would destroy it |
| One session per day | Relaxed to one **pending** session per day | Required by the above: a skipped row and a live row share a date. Completed sessions are history and sit outside the constraint entirely — a second workout in one day is a fact, not a conflict |
| Split stamp | **None** — stored unstamped, rotation looks back past unstamped sessions | A full-body conditioning workout is not push, pull, or legs. Stamping it arbitrarily would consume a rotation slot and skew tomorrow. Rotation stands still instead |
| Prescription fidelity | Show the creator's prescription as reference; **logging unchanged** | Rounds, `21-15-9`, `AMRAP`, `2x24kg` have no home in a sets/reps/weight logger. Coercing them silently changes the workout. Displaying them loses nothing and is a small change |
| Check-in | **Not required** | The check-in shapes the recommendation, which you have overridden by choosing your own workout. Nothing is lost by skipping it; a sheet between wanting to train and training is pure friction |
| Scope | **Captured workouts only** for the first cut | These are the workouts saved with intent to do them. WODs and program workouts share the plumbing and can follow without rework |

### Rejected alternatives

- **Log it as a side workout, leave the session alone.** Simplest to build and
  wrong: exercise recency would update (it reads raw exercise instances) but the
  rotation and ramp read completed sessions, so the split would never advance
  and tomorrow would serve the same day again.
- **Infer the split from the movements.** Full-body workouts land arbitrarily,
  and a run of similar captures can stall the rotation on one day anyway.
- **Teach the logger about rounds and non-numeric prescriptions.** The right
  eventual answer, but it means new columns and real work in the app's most
  complex screen. Deferred; §7.
- **Ask replace-or-additional on every start.** A decision on every workout to
  serve an occasional case.

## 3. Schema changes

One migration. Four alterations to `generated_sessions`, none to the capture
tables.

```sql
-- 1. A user-picked session is neither AI-composed nor rules-composed.
ALTER TABLE public.generated_sessions DROP CONSTRAINT generated_sessions_source_check;
ALTER TABLE public.generated_sessions ADD CONSTRAINT generated_sessions_source_check
  CHECK (source IN ('ai', 'rules_fallback', 'user_pick'));

-- 2. A workout served whole has no split day. NULL means "does not advance the
--    rotation" — see nextSplitDay's lookback.
ALTER TABLE public.generated_sessions ALTER COLUMN split_day DROP NOT NULL;

-- 3. One PENDING session per day, not one row per day. Replacing today's
--    suggestion keeps the skipped original beside the session you chose, and a
--    second workout after one is already finished is a second completed row —
--    completed and skipped are history, and history is never unique.
ALTER TABLE public.generated_sessions
  DROP CONSTRAINT IF EXISTS generated_sessions_user_id_session_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS generated_sessions_pending_day
  ON public.generated_sessions (user_id, session_date)
  WHERE status IN ('suggested', 'accepted');
```

`checkin_id` is already nullable, so a session started without a check-in needs
no change. `served_captured_workout_id` already exists.

**Why completed sessions must stay outside the constraint.** An earlier draft
had one *active* session per day and marked whatever was there as skipped. That
silently corrupts the rotation: finish your pull day in the morning, start a
catalog workout in the evening, and marking the completed pull session skipped
makes the §5 lookback reach past it — so tomorrow serves pull again, a day you
already did. A completed session is a fact about your training and is never
rewritten.

**No new columns for the prescription.** The rounds, weights, durations and
notes stay where they are, on `captured_workouts` and
`captured_workout_exercises`, read through `served_captured_workout_id`. One
source of truth: editing a captured workout stays authoritative for a session
already built from it, and nothing can drift.

## 4. Adopting a workout as today's session

A new function in the daily client library, alongside the existing session
writes. It stays inside the suggest-only boundary — it runs only from the user's
tap.

Given a captured workout id:

1. Sample the clock once (`getLocalDateString`), as every daily compute does.
2. Read today's **pending** session, if any (`suggested` or `accepted`), and
   mark it `skipped`. Completed sessions on the same date are left untouched —
   they are history (§3), and the new session simply joins them.
3. Insert a session row for today:
   - `served_captured_workout_id` = the workout
   - `split_day` = NULL
   - `source` = `'user_pick'`
   - `ramp_week` = computed as usual from the first session date
   - `gym_profile_id` = the active gym, if any
   - `checkin_id` = today's check-in if one exists, else NULL
   - `status` = `'suggested'`
4. Copy the workout's exercises into `generated_session_items`, ordered by
   `exercise_order` → `item_order`, every one in section `main`, carrying
   `target_sets`, `target_reps` and `rest_seconds` across verbatim. `reason` is
   NULL — nothing recommended these, you did.
5. Return the new session id.

Section `main` for everything is a deliberate flattening: the creator's workout
has its own shape, and slicing it into our warm-up/accessory/cool-down vocabulary
would assert structure the source never had.

### Which session the day shows

`fetchTodaySession` currently expects one row per date and must now choose:

1. The pending session (`suggested` or `accepted`) if there is one — the thing
   you have yet to finish is what the Today tab is for.
2. Otherwise the most recently created completed session, so the tab shows what
   you did rather than reverting to an empty day.
3. Skipped rows are never shown.

The recompute guard in the session hook keeps its current meaning: a day whose
session is anything other than `suggested` is never recomposed, so adopting a
catalog workout cannot be undone by a background refresh.

### Handing off

Handing back a session id means the caller navigates to exactly the route the
Today tab already uses — the daily-mode logging screen, keyed by session id.
Acceptance, instance creation, completion and the performed backfill all work
unchanged, because from that point down this *is* a daily session.

## 5. The rotation lookback

`fetchCandidateData` currently derives the last completed split day as:

> the most recent completed session's `split_day`

With unstamped sessions that yields NULL, and `nextSplitDay(null)` restarts at
push. The fix is to find the most recent completed session **that carries a
stamp**, skipping unstamped ones.

`nextSplitDay` itself does not change: it already treats NULL as "no history,
start at push", which stays correct for a genuinely fresh user.

Because a date can now hold more than one completed session, "most recent" is
ordered by session date **and creation time**, not date alone — otherwise two
sessions on one day tie and the winner is arbitrary.

Two sessions in a day are both read: if you complete a stamped push session and
then a catalog workout, the lookback finds push and tomorrow serves pull. The
unstamped workout neither advances nor rewinds anything.

Consequence, stated plainly: a week of nothing but catalog workouts leaves the
rotation exactly where it was. That is the intent — those workouts were not
push, pull or legs days, and the split resumes where it paused.

## 6. UI

### The Start button (captured workout page)

A primary button pinned at the bottom of the workout page, matching the Today
tab's Start control in shape, placement and haptics. Label: **Start Workout**.

Hidden while the page is in edit mode — you are changing the workout, not
starting it.

Confirmations, both a two-button alert:

- **Today's session is already underway** (accepted, instance exists) →
  "You're partway through today's session. Start this instead?" The in-progress
  instance is left alone; the session row it belongs to becomes skipped.
- **Today's session is already finished** (completed) → "You've already trained
  today. Start this as well?" Confirming adds a second session for the date. The
  finished one is never rewritten (§3), so both count and the rotation keeps the
  stamp the completed session earned.

No check-in gate. No confirmation in the ordinary case — a suggested session is
replaced silently, because that is the whole point of the button.

### Today tab — rendering a served workout

Currently the tab renders sections from items and titles the day from the split.
When today's session carries a `served_captured_workout_id`:

- Title: the workout's name, not "Push day".
- Below it: the workout's description, and its `rounds` where present.
- Badge: "From your catalog" in place of "AI composed" / "Rules composed".
- Movements listed in order with their prescription line, in one unsectioned
  list — no section headers, since the workout was not composed into sections.
- The check-in summary line and the planned-minutes total are hidden — neither
  applies to a workout we did not time.
- The Start / Continue button behaves exactly as it does now.

This is what makes the AI's own `servedWorkoutId` path work too.

### Logging screen — prescription and title

Two changes, both in the daily branch:

- **Title:** the served workout's name when there is one, else the split day as
  now. A session with no split and no served workout cannot occur.
- **Prescription block:** above the logging controls for each movement, the
  creator's own words for that movement — sets, reps, weight, duration, rest,
  and the movement note — rendered as reference text, visually distinct from the
  editable controls. Where the workout has `rounds`, it is shown once at the top
  of the session alongside the name. Where a movement has no prescription at
  all, nothing is shown rather than an empty scaffold.

The existing rep coercion stays for composed sessions. For served workouts the
prescription is displayed rather than parsed, so `21-15-9` and `AMRAP` reach the
screen intact and the logger's defaults sit underneath as the starting point for
what you actually did.

`raw_protocol` is the fallback: when a movement has no parsed prescription but
the workout has raw protocol lines, show those at the top of the session. Its
column comment asked for exactly this.

## 7. Out of scope

- **Teaching the logger rounds.** A circuit repeated 3–4× is logged today as
  sets against each movement. The prescription block tells you the shape; the
  logger does not enforce it. Revisit once there is real use.
- **WODs and program workouts.** Same plumbing, deferred by §2.
- **Un-replacing a day.** No undo for a skipped session. The record is kept, so
  an undo can be added later without data loss.
- **Rating a catalog workout.** Phase 3's too-easy/right/too-hard flow applies to
  exercises and is unaffected; whether a served workout should be rated as a
  whole is a Phase 3 question.

## 8. Testing

**Pure unit tests** (the tier that carries the arithmetic):

- Rotation lookback: a completed unstamped session between two stamped ones does
  not advance the split; a stamped and an unstamped session completed on the same
  date resolve to the stamped one whichever order they were created; a fresh user
  with only unstamped sessions still starts at push; the existing rotation cases
  still pass.
- Item mapping: exercise order preserved; NULL sets and rest carried as NULL, not
  defaulted; a workout with no exercises produces no session (and Start refuses).
- Day selection: pending beats completed; newest completed wins when there is no
  pending; skipped is never chosen.

**Integration, against the real database** (the schema is not rebuildable from
the repo — verify on the live one):

- The partial unique index permits skipped + pending on one date, permits two
  completed on one date, and still rejects two pending sessions on one date.
- Adopting twice in a day leaves exactly one pending session and two skipped.
- Adopting after completing a session leaves the completed row untouched, still
  stamped and still completed.

**On device** (the standing rule for this app — a dedicated simulator instance
and a unique Metro port):

- Start from a captured workout page with no session today; with a suggested
  session; with one underway; with one completed.
- The Today tab renders the served workout, and Continue returns to it.
- Finish the workout and confirm the session completes, the exercises log, and
  tomorrow's rotation is unchanged from what today would have been.

## 9. Open questions

None blocking. The one judgment call worth revisiting after living with it: if
catalog workouts become the norm rather than the exception, a rotation that
stands still indefinitely stops being a pause and starts being a stall — at
which point inferring a split from the movements (rejected in §2) deserves a
second look.
