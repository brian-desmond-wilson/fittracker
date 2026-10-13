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

One row per block of the day, linked by `session_id`. **A block role may
repeat** (since 2026-10-09): a 2-hour session is warmup → main → main →
abs → conditioning → cooldown, and the coach picks only from the catalog,
so two `main` rows and two `conditioning` rows on one session are normal.
Unique on `(session_id, block, block_position)`.

**Order is `block_position`**, 0-based across the whole session, in the
order the blocks are performed. Ties fall back to the canonical role order
warmup → mobility → main → conditioning → bfr → cooldown — which is how
every row written before the column existed (all `0`) keeps the order it
always had. The app's own composer still writes one row per role at
position 0; only the gateway writes repeated roles. Through
`/v1/jobs/save-session` you never set it: the `blocks` array order IS the
position.

There is no `abs` role. Core work goes in as `conditioning` (its items land
in the `accessory` section); on the 10-09 day "Core Strength Workout" is
conditioning 1 of 2 and "Bodyweight AMRAP" conditioning 2 of 2. The app
numbers a repeated role in its headings ("Main workout 1 of 2", "Main
workout 2 of 2") so the day still reads as one continuous session.

Exactly one of `captured_workout_id` / `builtin_key` is set.

Columns: `id, session_id, block, block_position, name, captured_workout_id,
builtin_key, minutes, rounds_note, reason, locked, dismissed`.

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
`exercise_order`, walking the blocks in `block_position` order. Built-in
blocks contribute no items. `item_order` is a single running index across
the whole session. `section` is the block name, except conditioning →
`accessory`.

**`block_id`** (since 2026-10-09) names the block row an item was exploded
from. It is what lets the app show the first main's movements under the
first main and the second's under the second — the section alone cannot
tell them apart. NULL means "the first block whose role owns my section",
which is how every item written before the column existed reads, and how
the app's own composer still writes. Through `/v1/jobs/save-session` you
set it indirectly with `block_index` (below).

Columns the app writes: `session_id, exercise_id, item_order, section,
target_sets, target_reps, rest_seconds, reason`; the gateway also writes
`block_id` and `weight_note`. `was_performed` stays NULL until the session
is finished.

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
replace its blocks and items; the gateway has no delete route and its only
update route is the scoped item edit in §8, so for anything larger the agent
can only add a second suggestion beside it.

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

A single-main day (the shape every session had before 2026-10-09; still
valid, and items may omit `block_index` because no role repeats):

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
`name` and `minutes`; `item_order` contiguous from 0. `source` defaults to
`ai`, `status` to `suggested`, `locked` and `dismissed` to false. A
stringified JSON object for `inputs_snapshot` or `section_minutes` is
unwrapped. `weight_note` is the per-exercise load prescription (free text,
optional).

### Multi-workout sessions (since 2026-10-09)

A block role **may repeat**. The `blocks` array is the performance order:
each block is stored with `block_position` = its index in the array. (You
may send `block_position` for clarity; if you do it must equal the index.)
Each item may carry **`block_index`**, the index into `blocks` of the block
it was copied from; it:

- is **required** for every item whose section's role appears more than
  once in `blocks` (two mains → every `main` item says which);
- must point at a block whose role owns the item's section (`main` → a
  `main` block, `accessory` → a `conditioning` block);
- must not step backwards along `item_order` — the items are one timeline
  that walks the blocks in order.

Items that omit it (allowed only when the role is unique) land with
`block_id = NULL` and the app reads them as the first block of that role,
exactly as before.

`section_minutes` is one entry per **section**, so two mains sum into one
`main` number: on 10-09, `{"warmup": 15, "main": 44, "accessory": 46,
"cooldown": 15}`.

### Example: the 2026-10-09 session (SoMa, 2 hours)

warmup 15 → Dumbbell Only Workout 24 → 20-Min AMRAP 20 → Core Strength
Workout 30 → Bodyweight AMRAP 16 → cooldown 15. Items are copied from
`agent_workout_library_exercises` for each catalog block, in
`exercise_order`, with `block_index` naming the block; the rows below are
abbreviated to the first movement of each block, so substitute the view's
`exercise_id`s and keep `item_order` running 0…N-1 across the whole list.

```json
{
  "session": {
    "user_id": "bd91dc7e-7eb8-4655-b05a-c9f72db39e9e",
    "session_date": "2026-10-09",
    "gym_profile_id": "abd10c0d-f655-4997-9568-a7c23ce9b614",
    "checkin_id": null,
    "ramp_week": 8,
    "source": "ai",
    "status": "suggested",
    "section_minutes": { "warmup": 15, "main": 44, "accessory": 46, "cooldown": 15 },
    "day_reason": "Two-hour SoMa session: dumbbell strength, a 20-minute AMRAP, core, then bodyweight conditioning.",
    "inputs_snapshot": { "mode": "blocks", "minutes": 120, "energy": 8, "shortlists": {} },
    "compose_signature": null
  },
  "blocks": [
    { "block": "warmup",       "name": "Full-Body Warm-up",     "builtin_key": "builtin-warmup-full", "captured_workout_id": null, "minutes": 15, "rounds_note": null, "reason": "Fifteen minutes to open up before two strength blocks." },
    { "block": "main",         "name": "Dumbbell Only Workout", "captured_workout_id": "38f29212-ec6f-4b20-990c-2f827e1d36a1", "builtin_key": null, "minutes": 24, "rounds_note": null, "reason": "Dumbbell strength first, while fresh." },
    { "block": "main",         "name": "20-Min AMRAP",          "captured_workout_id": "3cece261-ba0c-4af0-b61b-f68784454aeb", "builtin_key": null, "minutes": 20, "rounds_note": null, "reason": "Density work straight after the strength block." },
    { "block": "conditioning", "name": "Core Strength Workout", "captured_workout_id": "979a225f-bdc2-4fe4-b8c3-4521367eb95c", "builtin_key": null, "minutes": 30, "rounds_note": null, "reason": "Abs between the mains and the finisher." },
    { "block": "conditioning", "name": "Bodyweight AMRAP",      "captured_workout_id": "73a33d11-df12-44dd-96c6-c1a7fb54d742", "builtin_key": null, "minutes": 16, "rounds_note": null, "reason": "Bodyweight conditioning to close the work." },
    { "block": "cooldown",     "name": "Full-Body Cool-down",   "builtin_key": "builtin-cooldown-full", "captured_workout_id": null, "minutes": 15, "rounds_note": null, "reason": null }
  ],
  "items": [
    { "block_index": 1, "exercise_id": "<Dumbbell Only Workout, exercise_order 1>", "item_order": 0, "section": "main",      "target_sets": 3, "target_reps": "10", "rest_seconds": 60, "reason": null, "weight_note": "Ramp 15×8, 20×5 → work 25 lb" },
    { "block_index": 1, "exercise_id": "<Dumbbell Only Workout, exercise_order 2>", "item_order": 1, "section": "main",      "target_sets": 3, "target_reps": "10", "rest_seconds": 60, "reason": null, "weight_note": null },
    { "block_index": 2, "exercise_id": "<20-Min AMRAP, exercise_order 1>",          "item_order": 2, "section": "main",      "target_sets": null, "target_reps": "10", "rest_seconds": null, "reason": null, "weight_note": null },
    { "block_index": 3, "exercise_id": "<Core Strength Workout, exercise_order 1>", "item_order": 3, "section": "accessory", "target_sets": 3, "target_reps": "15", "rest_seconds": 45, "reason": null, "weight_note": null },
    { "block_index": 4, "exercise_id": "<Bodyweight AMRAP, exercise_order 1>",      "item_order": 4, "section": "accessory", "target_sets": null, "target_reps": "12", "rest_seconds": null, "reason": null, "weight_note": null }
  ]
}
```

Blocks 0 and 5 are built-ins and contribute no items. Items from block 1
all come before items from block 2, and so on — `block_index` never drops
as `item_order` climbs.

Responses:

```json
{ "ok": true,  "data": { "session_id": "71d4a3ee-…" } }
{ "ok": false, "error": { "code": "save_failed", "message": "item[3]: block_index is required because block \"main\" appears more than once" } }
```

On any failure nothing is written. Messages name the row: `session: …`,
`block[<index>] "<block>": …`, `item[<index>]: …`, `items: item_order must
be contiguous from 0 (got 0,1,3)`, `items: item_order must follow block
order (item_order 7 is in block[1] but item_order 6 is in block[2])`,
`item[<index>]: section "main" does not belong to block[3] "conditioning"`,
`item[<index>]: block_index 6 is out of range (blocks has 6 entries)`. The
three-insert flow through `/v1/log/workouts`, `/v1/log/workout_blocks` and
`/v1/log/workout_items` still works, but it is not atomic, and it would
have to set `block_position` and `block_id` itself.

## 8. Correcting a saved session — `POST /v1/jobs/update-session-items`

Added 2026-10-09. Until now the gateway was insert-only: once a session was
saved, a wrong load note or rep target could only be fixed by saving a
second session beside it. This route edits the **prescription fields of an
already-saved `suggested` session's items** in place — the coach notices
after saving that an exercise should read "work 26 lb" rather than
"work 24 lb", or that a movement should be 12 reps instead of 10, and
corrects it before Brian trains.

**When to use it:** the session is still `suggested` (Brian has not tapped
Start) and only `weight_note`, `target_reps` or `target_sets` need to
change. Anything else — a different exercise, a different block, a new
session order — is a new `save-session`. Once the session is `accepted`,
`completed`, `skipped` or `rested` the app owns it and the route refuses.

Request, same auth as every route (`x-agent-key`):

```json
{
  "session_id": "71d4a3ee-…",
  "items": [
    { "id": "e0c1…", "weight_note": "Ramp 15×8, 20×5 → work 26 lb", "target_reps": "12" },
    { "id": "f8a2…", "target_sets": 4 }
  ]
}
```

Each item names its `generated_session_items.id` and **at least one** of the
three editable fields. `weight_note` and `target_reps` are text or `null`
(`target_reps` is text in the schema: `"10"`, `"8-12"`, `"AMRAP"`);
`target_sets` is an integer or `null`. Sending `null` clears the field.
Fields not named are left as they are.

Response:

```json
{ "ok": true, "data": { "session_id": "71d4a3ee-…", "updated": 2, "item_ids": ["e0c1…", "f8a2…"] } }
```

**The four guards.** Every one is checked before the first UPDATE runs, so
a single bad item rejects the whole request and nothing is written:

| # | guard | error code | message |
|---|---|---|---|
| 1 | `session_id` is a uuid and the session exists | `session_not_found` | `No session with id <session_id>.` |
| 2 | the session's status is exactly `suggested` | `session_not_editable` | `Only suggested sessions can be edited (status is '<status>').` |
| 3 | an item carries only `id`, `weight_note`, `target_reps`, `target_sets` | `invalid_field` | `item[<i>]: field '<f>' is not editable.` |
| 4 | every item id exists **and** has `session_id` equal to the request's | `item_not_found` | `item[<i>]: id <id> does not belong to session <session_id>.` |

Other rejections: `no_items` (`items` missing or empty), `no_fields`
(`item[<i>]: at least one of weight_note, target_reps, target_sets is
required.`), `invalid_value` (wrong type, e.g. `target_sets: "3"`),
`bad_json`. All are `ok: false` with the usual `{ code, message }` envelope,
and every outcome is audit-logged as route `jobs/update-session-items`,
resource `workout_items`, `rows` = items updated (0 on rejection).

Guard 4 is deliberately a single "does not belong" error for both a
nonexistent id and an id from some other session, so a mistaken id can
never leak which session it belongs to. The UPDATE itself also filters on
`session_id`, so the row can't be edited across sessions even in a race.
The route needs no migration: it issues plain UPDATEs under the service
role, exactly like `/v1/log/:resource` issues inserts.

Item ids come from `GET /v1/read/workout_items?where[session_id]=<id>`
(`ft.py read workout_items --where session_id=<id>`); the save route
returns only the session id.
