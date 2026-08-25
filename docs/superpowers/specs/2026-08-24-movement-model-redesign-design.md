# Movement Model Redesign — Design Spec

**Date:** 2026-08-24
**Status:** Approved pending final review
**Scope:** The exercise/movement catalog: schema, taxonomy, naming, alias resolution, and migration of the existing 307 rows. Workout classification and app UI rework are follow-up phases, listed but not designed here.

## Goal

A canonical exercise catalog where every exercise derives from a core movement by adding identity attributes, names are generated from those attributes (with curated overrides), wild names from captured workouts resolve to catalog entries via aliases, and duplicates are structurally impossible — enforced by the database, not by discipline.

## Decisions made (with user, 2026-08-24)

1. **Identity vs. modifier attributes.** Structural attributes (equipment, load position, stance, range depth, symmetry, and identity-flagged styles) define distinct catalog exercises. Execution attributes (tempo, pause, eccentric, etc.) are modifiers applied to a prescription at programming time and never create catalog entries. The boundary is **data** — an `is_identity` flag per attribute value — not code, because the split is per-value (Kipping and Weighted are identity; Tempo and Pause are modifiers).
2. **Naming.** Every exercise gets a deterministic machine-generated name from its attributes. A curated common name may override it for display ("Sumo Deadlift" over "Wide-Stance Deadlift"). Generated name and all wild names persist as aliases.
3. **Alias resolution.** Auto-link high-confidence matches (exact normalized alias hit, or attribute-fingerprint match); low-confidence goes to a review queue. Every confirmation saves an alias so no name asks twice.
4. **Architecture: Option C — fingerprint identity + machine-maintained tree.** Identity and dedup via a unique attribute fingerprint per core movement. `parent_exercise_id` is kept for the existing tier UI but demoted to machine-derived (largest strict subset of identity attributes); it can never be hand-set and never contradict the attributes.

## Schema design

### Catalog identity (columns on `exercises`)

| Column | Behavior |
|---|---|
| `core_movement_id` | FK → `exercises(id)`, the tier-0 root this exercise derives from. NULL = outlier (allowed, explicit). Core rows reference themselves, so "has a core movement" is uniformly true for everything except outliers. |
| `identity_fingerprint` | Trigger-maintained canonical text encoding of the sorted set of identity attribute values. UNIQUE with `core_movement_id`. This is the dedup guarantee. |
| `parent_exercise_id` | Machine-maintained: the catalog entry whose identity-attribute set is the largest strict subset of this one. Recomputed by trigger on attribute change. Never hand-set. |
| `tier` | Stored, trigger-maintained depth (0 = core). Replaces the recursive computation the app mirrors client-side today. |
| `generated_name` | Output of the naming function. |
| `display_name` policy | Custom override if set, else `generated_name`. `name` column remains the display name; a `name_is_custom` boolean records whether it is an override. |
| `is_core` | Kept: TRUE marks tier-0 core movements. Existing constraint (core ⇒ no parent) kept. |
| `is_movement` | **Kept, redefined** (user decision 2026-08-24): a pure curation label — "first-class named movement of the sport", i.e. what the Movements tab shows — with zero role in identity, naming, or hierarchy. Its current inconsistencies (e.g. Strict Press core-but-not-movement) are fixed during the Phase 4 catalog pass, which sets it explicitly on every row. |

### One storage shape per attribute (ends dual storage)

| Attribute | Final shape | Change |
|---|---|---|
| Modality (`movement_categories`) | single FK | copied down from core movement by trigger |
| Movement family | single FK | copied down from core movement by trigger |
| Skill level | single text + CHECK | unchanged |
| Load position | single FK | junction `exercise_load_positions` dropped |
| Stance | single FK | junction `exercise_stances` dropped |
| Range depth | single FK | unchanged |
| Symmetry | single FK | unchanged |
| Plane of motion | single FK | junction `exercise_planes_of_motion` dropped (Multi-Planar value covers the multi case) |
| Goal types | junction only | column `goal_type_id` dropped |
| Scoring types | junction only | unchanged |
| Muscle regions | junction only (`is_primary` kept) | unchanged |
| Equipment | junction only | `exercise_equipment` **created on live** (repo migration never applied); `equipment_types` text array backfilled into it, then dropped |
| Movement styles | junction, identity-flagged values only on catalog rows | column `movement_style_id` dropped; modifier-flagged values move to prescriptions |
| Variation options system | **retired** | `variation_categories` / `variation_options` / `exercise_variations` folded in: the 10 live links migrate to attributes or aliases during the catalog pass, then tables drop |

Modifiers on prescriptions: `wod_movements`, `program_workout_exercises`, and `generated_session_items` gain a modifier list (style values flagged `is_identity = false`), rendered by prefixing the modifier's name fragment ("Pause Overhead Squat").

### Names and aliases

New table `exercise_aliases`: `exercise_id`, `alias`, `alias_normalized` (UNIQUE across the whole table), `kind` (`generated` / `display` / `short` / `wild`), `source` (`seed` / `curation` / `capture`), timestamps. Every display name, generated name, short name, and wild-caught name lives here. The uniqueness constraint is the structural guarantee that one name can only ever mean one exercise. `exercises.aliases` text array drops after backfill.

### Naming generator

- Reference values gain `name_fragment` (may be empty = contributes no words) and `name_order`.
- Defaults are silent: Standard stance, Full depth, Bilateral, Sagittal, and Bodyweight-where-implied have empty fragments.
- Suppression rule: a load position may declare `implies_equipment_id`; when set and matching, the equipment word is dropped (squat+barbell+back → "Back Squat"). Positions shared across equipment (Goblet) do not suppress → "Kettlebell Goblet Squat" (+ curated override "Goblet Squat").
- Generation = non-empty fragments of identity values, sorted by `name_order`, + core movement noun. Runs in a DB function, re-fired on attribute change; syncs `generated_name` and the alias table.
- Two fingerprints generating the same string is caught by alias uniqueness → review queue, never a silent collision.

### Reference-table hygiene (data, not code)

- Stray `Back` muscle region merges into `Upper Back` (links repointed, row deleted).
- `muscle_regions.region_group` column (Upper Body / Core–Midline / Lower Body / Whole Body) replaces the app's hardcoded display-order ranges.
- New junction `movement_family_modalities` replaces the app's drifted hardcoded modality→family map (fixes Push/Press missing under Lifting; Rotation and Swing unreachable).
- New table `alias_abbreviations` (KB→kettlebell, OH→overhead, C2B→chest-to-bar, …) used by the normalizer.
- `movement_styles.is_identity` flag per row.

### Alias resolution pipeline

One guarded front door: a single create/link function enforces fingerprint + alias constraints; the capture pipeline cannot insert exercises directly.

Matching ladder:
1. **Normalized exact alias hit** → auto-link.
2. **Fingerprint match**: AI extractor parses name + capture context into core movement + identity attributes; existing fingerprint → auto-link **and save the name as an alias** (self-improving).
3. **Review queue** (`exercise_match_reviews`): raw name, capture context, ranked candidates with confidence, and a prefilled draft (parsed attributes + generated-name preview) when no candidate fits. Actions: confirm candidate (saves alias) / pick other / mint draft via the front door / dismiss.

## Migration plan (sequencing is the design)

**Principle: data before constraints, constraints before app changes, column drops last.**

- **Phase 0 — Baseline.** Snapshot the live schema as the migration tree's new baseline (live and repo have diverged; live is truth). Table backups (`pg_dump`) before every destructive step.
- **Phase 1 — Attribute taxonomy audit.** Before classifying anything: rule on each of the 15 attributes — does it earn its place, does it overlap another (known overlaps to resolve: range depth vs. the `Partial / Range-Limited` style value; symmetry `Alternating` vs. style `Alternating`), what is missing, and is each value list exhaustive. This rides the same pass that assigns `name_fragment`, `name_order`, and `is_identity` to every value, so every value gets touched exactly once. Output: the final attribute dictionary, user-approved.
- **Phase 2 — Reference data.** Apply audit outcomes: merges, new values, naming metadata, identity flags, `region_group`, family↔modality junction, abbreviation dictionary.
- **Phase 3 — Schema additions.** New columns, `exercise_aliases`, `exercise_equipment`, `exercise_match_reviews`, triggers and functions. Constraints created NOT VALID / not yet enforced.
- **Phase 4 — Catalog pass (the real work).**
  - Curate the core movement set (proposal from live data + CrossFit canon; user approves).
  - Classify all 307 rows: core movement or explicit outlier, identity attributes, resulting parent/tier. AI-assisted batch producing a **review sheet the user approves before any write**.
  - Merge duplicates: repoint every downstream FK (`wod_movements`, `program_workout_exercises`, `exercise_instances` (RESTRICT), `source_exercises`, `captured_workout_exercises`, `generated_session_items`, `movement_ratings`, `exercise_skill_state`), keep loser names as aliases, delete losers.
  - Fix wrong tree placements by fixing attributes (Burpee out from under Squat, Kettlebell Swing out from under Deadlift, Band Lateral Walk out from under Lunge); the machine-derived parent then lands right by construction.
  - Backfill equipment junction from the text array (normalizing the two naming generations).
- **Phase 5 — Turn the locks.** Validate/enforce fingerprint uniqueness and alias uniqueness; triggers own generated names, parents, tiers from here on.
- **Phase 6 — App unification (own roadmap phase).** One save path for both wizards (kills the two-wizards-two-outcomes bug), an update path (today edit = delete + recreate), reads move to the new columns, filter pills read classification data instead of name substrings, tier UI reads stored `tier`.
- **Phase 7 — Retire legacy.** Precisely (resolving the dual-storage attributes per the final-shape table above, which is authoritative): drop **columns** `goal_type_id` and `movement_style_id` (their attributes live in junctions); drop **junction tables** `exercise_planes_of_motion`, `exercise_load_positions`, `exercise_stances` (their attributes live in the single FK columns, which survive); drop `equipment_types` and `exercises.aliases`; drop the variation-options tables (`variation_categories`, `variation_options`, `exercise_variations`). Only after Phase 6 ships. The harness's V7 guard block, which protects these against premature drops, retires with them.

### Verification (closes every phase)

Audit queries proving: every row has a core movement or explicit outlier status; every fingerprint unique; every generated name matches a fresh regeneration; alias table covers every name; no orphaned junction rows; no downstream FK pointing at a merged-away row. Post-migration, the Movement Model artifact gets updated to the "after" state.

## Out of scope (explicitly)

- Workout-level classification (follows once exercises are clean).
- App UI redesign beyond the save/read unification in Phase 6.
- The wod_movements Rx/L2/L1 scaling system and `movement_scaling_links` difficulty chains — untouched by this redesign; they layer on top of clean identity.

## Amendments (2026-08-24, Stage 2 — attribute dictionary applied to live)

The Phase 1 attribute audit is complete; the approved dictionary is the Attribute Audit artifact (decision record; all seven contested calls approved as recommended) and it is live via migration `20260826100000_attribute_dictionary.sql`. Summary of what it changed relative to this spec's original tables:

- **New attribute: Grip** — reference table `grips` (category Orientation | Width), two single-select FK columns on exercises (`grip_orientation_id`, `grip_width_id`), identity, naming order band 25. Chin-Up = Supinated ("Underhand" fragment, curated override), Wide-Grip / Close-Grip derivable.
- **Styles**: 11 values; identity = {Strict, Kipping, Butterfly, Plyometric (Explosive), Assisted, Weighted, Deficit}; modifiers = {Pause, Tempo, Eccentric (Negative), Isometric (Hold)}; dropped Standard, Unbroken, Alternating, Partial / Range-Limited; Controlled merged into Tempo.
- **Families**: 28 — Core renamed **Midline**; Mobility/Control merged into Mobility.
- **Goals**: 6 — Cool-Down merged into Recovery.
- **Load positions**: 15 — added Double Overhead and Waiter; dropped Bodyweight; Hang recategorized "Start Position".
- **Range depths**: 8 — dropped Variable / Custom; `implies_equipment_id` added (Box implies Box equipment).
- **Stances**: 13 — added Supine and Prone; Athletic / Partial Squat renamed Athletic; legacy combined "Supine / Prone" retained until the Phase 4 catalog pass reclassifies its rows, then drops.
- **Equipment**: 30 — added Jump Rope (silent), GHD, Parallettes, Sled, Weight Vest ("Vest").
- **Engine generalizations**: grips joined the identity fingerprint and the name generator; implied-equipment suppression honors both load-position and range-depth implications; every identity value now carries its name fragment and order (bands: 10 assistance styles, 12 execution, 14 dynamic, 20 range, 25 grip, 30 stance, 35 alternating, 40 equipment, 45 load position).
- **Naming metadata is data**: silent defaults (Standard stance, Full depth, Bilateral, Pronated, Bodyweight, Jump Rope) carry NULL fragments.

## Open items

- Core movement list — proposed and approved in Phase 4.
- Whether the Movements/Exercises tab split survives in the app — decided in Phase 6.
