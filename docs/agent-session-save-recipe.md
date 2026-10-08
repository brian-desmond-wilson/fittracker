# Agent session save recipe

How the Muse agent persists a composed training session so the app shows it
exactly like its own AI-composed sessions. Reference example: the AI session
for **2026-09-13** (status later moved to `skipped`), id
`7ade7f2b-522b-41dd-98d4-8d13b3948ad3`. Derived from the app's own writer,
`saveGeneratedSession` in `mobile/src/lib/supabase/daily.ts`, and from the
live rows.

## The shape, in one paragraph

A suggested session is **one `generated_sessions` row, its
`generated_session_blocks` rows (one per block), and its
`generated_session_items` rows (one per exercise inside the catalog
workouts the blocks picked)**. There is **no workout instance at suggest
time**: `workout_instance_id` is NULL on the 09-13 row and on every freshly
composed session. The `workout_instances` row is created by the app when
Brian taps Start, and only then is the session flipped to `accepted` and
linked to it. The agent should write the first three tables and leave the
instance to the app.

## 1. Session row — `generated_sessions`

Columns the app reads for display (its select in `queryDaySessions`):
`id, session_date, split_day, ramp_week, source, served_captured_workout_id,
status, workout_instance_id, gym_profile_id, section_minutes,
compose_signature, day_reason, created_at, inputs_snapshot->assumed`, plus
the joined items and blocks below.

The 09-13 row:

| column | value |
|---|---|
| id | `7ade7f2b-522b-41dd-98d4-8d13b3948ad3` (let the DB generate it) |
| user_id | `bd91dc7e-7eb8-4655-b05a-c9f72db39e9e` |
| session_date | `2026-09-13` |
| gym_profile_id | `abd10c0d-f655-4997-9568-a7c23ce9b614` |
| checkin_id | `2b154670-743d-415d-a4e6-96e0d1a0c033` (that day's `daily_checkins.id`; NULL is allowed for a draft composed before the check-in exists) |
| split_day | `null` (blocks-mode sessions carry no push/pull/legs split) |
| ramp_week | `4` |
| source | `ai` |
| served_captured_workout_id | `null` (set only when one whole workout IS the day; blocks mode leaves it null) |
| status | `suggested` (the app later moves it to accepted / completed / skipped / rested) |
| section_minutes | `{"warmup": 8, "mobility": 5, "main": 30, "cooldown": 7}` — one key per block that has work, minutes as integers; NULL when empty |
| day_reason | `With no work yesterday and only mild lower-body soreness, today emphasizes neglected chest and core while keeping the leg contribution moderate.` |
| inputs_snapshot | `{"aiBody": {…}, "shortlists": {…}}` — see below |
| compose_signature | see grammar below; **written last, in a separate update** |
| workout_instance_id | `null` |
| created_at | default `now()` |

### `inputs_snapshot`

Two top-level keys on every AI session:

- `aiBody` — the exact JSON body sent to the composer: `mode`, `minutes`,
  `energy`, `soreness`, `coverage` (`{neglected: [...], yesterday: [...]}`),
  `relaxedMain`, `overrodeRecovery`, `instructions`, `debrief`,
  `fixedBlocks`, `yesterdayWasRest`, `shortlists`.
- `shortlists` — the per-block candidate lists again, each candidate as
  `{id, name, minutes, focus, builtin, muscles, lastPerformedDaysAgo,
  roundsNote, score}`.

A tomorrow-draft also writes an `assumed` key (`{energy, minutesAvailable,
soreness}`); the app reads it to label the session as drafted on assumed
inputs. Omit it for a real-inputs compose.

### `compose_signature` grammar

Nine fields joined by `::`. The app treats a session carrying the current
signature as "already composed for these inputs" and leaves it alone; a
mismatch makes the Today tab recompose. The 09-13 value:

```
2026-09-13::60::7::train::::adj:::deb:::skill:Intermediate::cooldown:builtin-cooldown-full,main:9d8db4a2-…,main:a9d5cd99-…,main:c0e960e8-…,main:e8216cb2-…,main:f5c8acfe-…,mobility:264e556a-…,mobility:a50c58d7-…,mobility:builtin-mobility-full,warmup:264e556a-…,warmup:a50c58d7-…,warmup:builtin-warmup-full
```

| # | field | 09-13 | meaning |
|---|---|---|---|
| 1 | date | `2026-09-13` | the session date |
| 2 | minutes | `60` | check-in `minutes_available` |
| 3 | energy | `7` | check-in `energy` 1–10 |
| 4 | mode | `train` | `train` or `recovery` (active-recovery day) |
| 5 | override | `` (empty) | `override` when the user overrode a recovery call, else empty |
| 6 | adjustments | `adj:` | `adj:` + comma-joined, sorted ids of today's one-shot instructions (none here) |
| 7 | debrief | `deb:` | `deb:` + the session id of the debrief that informed this compose (none here) |
| 8 | skill | `skill:Intermediate` | `skill:` + the user's skill ceiling |
| 9 | shortlist ids | `block:id,block:id,…` | every candidate offered, as `block:id`, sorted; built-ins use their `builtin-*` key |

Note field 5 sits between two `::`, so an empty override reads as `::::`.

**Agent guidance:** the signature exists so the app's own composer can tell
whether it must recompose. If the agent writes a session with a signature
the app cannot reproduce, the Today tab will treat the session as stale and
may compose over it (a `suggested` + `ai` session is the one kind the app
will overwrite). Two safe options:

- Write a **NULL** signature. The app then treats the session as unclaimed
  and may recompose it on next open. Fine for a session Brian will start
  straight away; not fine if it must survive until morning.
- Reproduce the grammar faithfully from the same inputs. Fields 1–3 and 9
  are fully in the agent's hands; field 4 is `train` unless the day is a
  recovery day; 5–7 are empty unless the agent is honouring instructions or
  a debrief; field 8 must match the user's current skill ceiling
  (`Intermediate` on 09-13).

## 2. Block rows — `generated_session_blocks`

One row per block of the day, linked by `session_id`. Unique on
`(session_id, block)`. Order is by the block name, not a column: the app
sorts warmup → mobility → main → conditioning → cooldown. Exactly one of
`captured_workout_id` / `builtin_key` is set.

Columns: `id, session_id, block, name, captured_workout_id, builtin_key,
minutes, rounds_note, reason, locked, dismissed`.

The 09-13 main block:

| column | value |
|---|---|
| session_id | `7ade7f2b-522b-41dd-98d4-8d13b3948ad3` |
| block | `main` |
| name | `20 Rounds` (the catalog workout's name, copied, so it survives a delete) |
| captured_workout_id | `f5c8acfe-80c9-447c-848d-86e92a390504` |
| builtin_key | `null` |
| minutes | `30` |
| rounds_note | `Do 30 rounds (written: 20)` (NULL when no adjustment) |
| reason | `Train neglected chest and core with light quad exposure; do the adjusted 30 rounds (written: 20).` |
| locked | `false` |
| dismissed | `false` |

A built-in block (09-13 cooldown) is the same row with
`captured_workout_id = null`, `builtin_key = builtin-cooldown-full`,
`name = Full-Body Cool-down`, `minutes = 7`. Known built-in keys:
`builtin-warmup-full`, `builtin-mobility-full`, `builtin-cooldown-full`.

## 3. Item rows — `generated_session_items`

The loggable movements, derived from the blocks: for every block that is a
catalog workout, copy that workout's `captured_workout_exercises` rows, in
`exercise_order`, walking blocks in day order (warmup → mobility → main →
conditioning → cooldown). Built-in blocks contribute no items. `item_order`
is a single running index across the whole session. `section` is the block
name, except conditioning → `accessory`.

Columns the app writes: `session_id, exercise_id, item_order, section,
target_sets, target_reps, rest_seconds, reason`. `was_performed` stays NULL
until the session is finished.

09-13 has 22 items: warmup 0–12, mobility 13–18, main 19–21. Example:

| column | value |
|---|---|
| session_id | `7ade7f2b-522b-41dd-98d4-8d13b3948ad3` |
| exercise_id | `f57a4584-232e-4e44-9fa3-8276a991b076` (Golf Swings) |
| item_order | `0` |
| section | `warmup` |
| target_sets / target_reps / rest_seconds / reason | `null` (blocks mode carries prescriptions on the workout, not per item) |

The gateway's `workout_library_exercises` resource gives the agent each
workout's exercise rows to copy from (`exercise_id`, `exercise_order`,
`target_sets`, `target_reps`, `rest_seconds`).

## 4. Workout instance — `workout_instances` (app-owned, do not write)

Created by the app when Brian presses Start on the session, then
`generated_sessions.status` → `accepted` and `workout_instance_id` is set.
The app's insert for a daily session:

| column | value (09-02 example, instance `d45111d8-72f6-489c-806e-d66479bbf948`) |
|---|---|
| user_id | `bd91dc7e-7eb8-4655-b05a-c9f72db39e9e` |
| program_instance_id | `null` |
| program_workout_id | `null` |
| week_number | `0` (daily sessions are week 0) |
| day_number | `0` |
| status | `in_progress` at start; `completed` at finish |
| scheduled_date | `2026-09-02` (the session date) |
| started_at | `2026-09-02 17:13:02+00` |
| gym_id | `null` |

Starting also creates one `workout_sessions` row and the
`exercise_instances` / `set_instances` rows as sets are logged (09-02: 1
session, 8 exercise instances, 35 sets). None of that is the agent's job.

## 5. Order of operations

1. **Insert `generated_sessions`** with `status = suggested`, `source = ai`,
   `workout_instance_id = null`, `compose_signature = null`. Keep the
   returned `id`.
2. **Insert `generated_session_blocks`** rows with that `session_id`.
3. **Insert `generated_session_items`** rows with that `session_id`.
4. **Update `generated_sessions`** to set `compose_signature` (or leave it
   NULL, see guidance above). The app stamps it last so a half-written
   session never looks finished.

Before step 1, read `workouts?date=<day>`: if a session for that day already
exists with status other than `suggested`, or with `source = user_pick`, the
app would refuse to overwrite it and the agent should too. If a `suggested`
+ `ai` session exists, the app's own behaviour is to update it in place and
replace its blocks and items; the gateway has no update or delete route, so
the agent can only add a second suggestion beside it.

## 6. Gateway coverage

Write allowlist today (`POST /v1/log/:resource` inserts into the resource's
table; views reject inserts):

| needed table | gateway resource | status |
|---|---|---|
| generated_sessions | `workouts` | **allowlisted** |
| generated_session_blocks | — | **missing** |
| generated_session_items | — | **missing** |
| workout_instances | — | missing, and should stay so (app-owned) |

Two things the route cannot do yet that the recipe needs: step 4 is an
**update**, and the route only inserts, so the signature has to go in with
step 1 or stay NULL; and there is no read-back of the inserted id other
than the route's response (`data.rows[0].id`), which is sufficient.

## 7. Atomic save — `POST /v1/jobs/save-session` (preferred)

Added 2026-10-08 after a three-insert save failed midway and left a session
with no blocks. One request, one Postgres transaction: the session row, its
blocks and its items all land, or nothing does.

Request, same auth as every route (`x-agent-key`):

```json
{
  "session": {
    "user_id": "bd91dc7e-7eb8-4655-b05a-c9f72db39e9e",
    "session_date": "2026-10-08",
    "gym_profile_id": "abd10c0d-f655-4997-9568-a7c23ce9b614",
    "checkin_id": null,
    "ramp_week": 8,
    "source": "ai",
    "status": "suggested",
    "section_minutes": { "warmup": 8, "main": 36, "cooldown": 8 },
    "day_reason": "Pull emphasis for the stalest groups…",
    "inputs_snapshot": { "mode": "blocks", "minutes": 60, "energy": 7, "...": "..." },
    "compose_signature": null
  },
  "blocks": [
    { "block": "warmup", "name": "Full-Body Warm-up", "builtin_key": "builtin-warmup-full", "captured_workout_id": null, "minutes": 8, "rounds_note": null, "reason": "Dynamic warmup before strength work." },
    { "block": "main", "name": "The Workout", "captured_workout_id": "98d3666f-…", "builtin_key": null, "minutes": 28, "rounds_note": "Do 4 rounds (written: …)", "reason": "Pull-day main…" }
  ],
  "items": [
    { "exercise_id": "…", "item_order": 0, "section": "main", "target_sets": null, "target_reps": "8", "rest_seconds": null, "reason": null, "weight_note": "Ramp 15×8, 20×5, 24×3 → work 26 lb" }
  ]
}
```

Rules enforced before anything is written: `session.user_id`,
`session_date` and `ramp_week` present; at least one block; every block
names exactly one of `captured_workout_id` / `builtin_key` and carries
`name` and `minutes`; no duplicate `block` names; `item_order` contiguous
from 0. `source` defaults to `ai`, `status` to `suggested`, `locked` and
`dismissed` to false. A stringified JSON object for `inputs_snapshot` or
`section_minutes` is unwrapped. `weight_note` is the per-exercise load
prescription (free text, optional).

Responses:

```json
{ "ok": true,  "data": { "session_id": "71d4a3ee-…" } }
{ "ok": false, "error": { "code": "save_failed", "message": "block[2] \"main\": duplicate block name" } }
```

On any failure nothing is written. Messages name the row: `session: …`,
`block[<index>] "<block>": …`, `item[<index>]: …`, `items: item_order must
be contiguous from 0 (got 0,1,3)`. The three-insert flow through
`/v1/log/workouts`, `/v1/log/workout_blocks` and `/v1/log/workout_items`
still works, but it is not atomic.
