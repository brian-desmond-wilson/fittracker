# Catalog Pass Implementation Plan (Stage 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Classify all 307 catalog rows against the live attribute dictionary — core movement (or explicit outlier), full identity attributes, `is_movement` curation — merge duplicates with history repointed, and leave the catalog ready for Stage 4's uniqueness lock. Two hard user gates: the core movement set, and the full classification review sheet (approved BEFORE any write).

**Architecture:** Analysis and classification happen OFFLINE (scripts + AI batch producing reviewable CSVs; nothing writes to any database until the user approves). Application happens as ONE data migration built from the approved sheet, executed on staging first under the full Stage 1/2 standing rules (TDD harness additions, in-file self-verify, idempotency, `psql -1`, fresh-dump rehearsal, backup, gated push). Engine-review hand-offs from the roadmap are binding on the apply step.

**Conventions:** as `2026-08-24-movement-model-foundation.md` (staging 56322, credential minting, harness style). Decision records: the Attribute Audit artifact (dictionary) and the Movement Model artifact (before-state).

---

### Task 1: Core movement set proposal (user gate A)

- [x] Analyze the live catalog (fresh read): the 9 existing cores, the 34 non-core movements, the 264 exercises, family/modality distribution, the current messy tree (documented misfiles: Burpee under Squat, Kettlebell Swing under Deadlift, Band Lateral Walk under Lunge), and the 27 scaling links.
- [x] Propose the tier-0 core set: for each proposed core — name, family, modality, and the count + examples of catalog rows that would derive from it. Explicitly list: existing cores kept/renamed (incl. whether "Strict Press" should become core "Press" with Strict as its style-derived child), misfiled rows re-homed, movements promoted to core (candidates the data suggests: Snatch, Jerk/Push Press family, Push-Up, Dip, Muscle-Up, Handstand, Burpee, Swing, Carry, Sit-Up, Rope Climb, Wall Ball, Bike, Ski, Swim, Jump Rope — judge each against the data, don't rubber-stamp), and which rows are OUTLIERS (no core; explicit, expected).
- [x] Deliverable: a decision table (artifact) with a recommendation per row and coverage stats (every one of the 307 rows accounted for: derives-from-X, outlier, or duplicate-of-Y). User approves/edits in chat.

### Task 2: Full classification batch (user gate B)

- [x] With the approved core set: classify every row — core_movement_id / outlier; every identity attribute (equipment from the text array + name/description inference, load position, stance, range depth, symmetry, grips, identity styles); modality/family/goals/muscles kept or corrected; `is_movement` curation; duplicate-merge list (winner, losers, loser names → aliases).
- [x] Mechanics: AI batch over the catalog in chunks with the full dictionary in context; consolidate to `docs/superpowers/audit/catalog-pass-2026-08.csv` (one row per exercise, proposed values, a confidence column, and a would-be generated-name preview using the live fragments so the user sees the naming consequence of every classification).
- [x] Sanity passes before showing the user: fingerprint-collision preview (any two rows classifying to the same core + attribute set = a proposed merge, never an accident); implied-equipment canonicalization applied (load position/range implications materialized as equipment junctions consistently); zero rows unaccounted for; legacy 'Supine / Prone' rows reclassified to Supine or Prone.
- [x] Deliverable: review sheet + summary artifact (counts, merges, notable renames-by-derivation, outliers). USER APPROVES BEFORE ANY WRITE.

### Task 3: Apply (staging → reviews → live)

- [x] Build ONE migration from the approved sheet. Binding rules from the engine reviews (roadmap Stage 3 list): apply classifications in ascending identity-attribute-cardinality order per core (parents finalize before children); after all rows land, purge and rebuild ALL kind='generated' aliases from final generated names, routing collisions to exercise_match_reviews; merges repoint EVERY downstream FK (wod_movements, program_workout_exercises, exercise_instances (RESTRICT), source_exercises, captured_workout_exercises, generated_session_items, movement_ratings, exercise_skill_state, exercise_match_reviews.resolved_exercise_id) before deleting losers, loser names saved as wild aliases; equipment text[] backfilled into exercise_equipment via the normalization map, then the array contents verified equivalent (array itself drops in Stage 6); drop the legacy 'Supine / Prone' stance value once its rows are reclassified; grip category guard added (orientation column references Orientation grips only, width likewise — the Stage 2 hand-off).
- [x] Harness V9: post-pass invariants — every row has core or explicit outlier status; zero fingerprint duplicates within a core (the Stage 4 lock's precondition); zero duplicate generated_name within a core; every merge target exists; no orphaned junction rows; alias table covers every display name.
- [x] TDD, in-file self-verify, idempotency, `psql -1`, two-stage review, fresh-dump rehearsal, backup, gated push, merge to main — all per the Stage 1/2 pattern.

### Task 4: Close out Stage 3

- [x] Roadmap tick + Stage 4 unblock note; spec amendment (catalog state); memory; Movement Model artifact updated to the "after" state; report with Stage 4 preview (turn the locks).
