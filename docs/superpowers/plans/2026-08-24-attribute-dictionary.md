# Attribute Dictionary Implementation Plan (Stage 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the user-approved attribute dictionary (see the decision record: the Attribute Audit artifact, decided 2026-08-24) to the database: naming fragments and orders on every identity value, the identity/modifier style split, the approved merges/renames/drops/additions, the new Grip attribute, and the engine amendments that make grips and the Box rule part of identity and naming.

**Architecture:** One data migration (`20260826100000_attribute_dictionary.sql`) carrying reference-data changes + a new `grips` table + two FK columns on exercises + CREATE OR REPLACE amendments to the engine functions, developed TDD-style against staging with a new V8 harness block, self-verifying in-file, then pushed to live under the Task-11 gate pattern. All Stage 1 standing rules apply (RLS on new tables, idempotency guards, in-file self-verify for data migrations, `psql -1` rehearsal, backup before push, fail-closed harness).

**Conventions:** identical to `2026-08-24-movement-model-foundation.md` (staging 56322, live credential minting + SET ROLE, harness style). Fragment convention: silent values store NULL fragment; the engine emits only non-empty fragments.

---

### Task 1: The dictionary migration + engine amendments (staging)

**Files:**
- Create: `supabase/migrations/20260826100000_attribute_dictionary.sql`
- Modify: `scripts/movement-model/verify_foundation.sql` (V8 block; V6 fixture extended for grips)

- [ ] **Step 1 (TDD): V8 assertions first** — append a self-contained V8 DO block asserting the END state, run harness, watch it fail on the first check. V8 checks (observed values in every RAISE):
  - `grips` table exists with 9 rows (6 Orientation, 3 Width), RLS enabled, read-only to anon; `exercises.grip_orientation_id` and `exercises.grip_width_id` columns exist with FK → grips ON DELETE SET NULL.
  - movement_styles: exactly 11 rows; `is_identity` true for exactly {Strict, Kipping, Butterfly, Plyometric (Explosive), Assisted, Weighted, Deficit}; no rows named Standard, Unbroken, Alternating, 'Partial / Range-Limited', Controlled.
  - movement_families: no 'Core', no 'Mobility/Control'; 'Midline' exists; total 27.
  - goal_types: no 'Cool-Down'; total 6; zero exercise_goal_types rows referencing a nonexistent goal.
  - load_positions: no 'Bodyweight'; 'Double Overhead' and 'Waiter' exist (category 'Dumbbell / KB'); 'Hang' category = 'Start Position'; Back/Front/Overhead/Zercher have implies_equipment_id = Barbell's id; total 15.
  - range_depths: no 'Variable / Custom'; total 8; 'Box' has implies_equipment_id = Box equipment id.
  - stances: 'Supine' and 'Prone' exist; 'Athletic' exists and 'Athletic / Partial Squat' does not; legacy 'Supine / Prone' still present (retires in Stage 3); total 13.
  - equipment: Jump Rope, GHD, Parallettes, Sled, Weight Vest exist; total 30.
  - Naming metadata: zero identity values with a non-null fragment but null name_order; spot asserts — equipment 'Kettlebell' fragment 'Kettlebell' order 40; load position 'Goblet' fragment 'Goblet' order 45; stance 'Wide (Sumo)' fragment 'Wide-Stance' order 30; style 'Strict' fragment 'Strict' order 12; symmetry 'Alternating' fragment 'Alternating' order 35; grip width 'Wide' fragment 'Wide-Grip' order 25; silent defaults (equipment Bodyweight, stance Standard, range Full, symmetry Bilateral) have NULL fragments.
  - Engine: `exercise_identity_attrs` includes grip columns (assert via a fixture in V6, not here).
- [ ] **Step 2: the migration.** Sections, in order, each idempotent:
  1. **Grips**: CREATE TABLE `grips` (id, name UNIQUE, category CHECK ('Orientation','Width'), description, display_order, name_fragment, name_order, created_at) + RLS + public-SELECT policy (standing rule); seed 9 values per the artifact (Pronated/Supinated/Neutral/Mixed/Hook/False; Standard/Wide/Close) with fragments (Underhand, Neutral-Grip, Mixed-Grip, False-Grip, Wide-Grip, Close-Grip; silent: Pronated, Hook, Standard) order 25; ADD COLUMN grip_orientation_id/grip_width_id UUID REFERENCES grips(id) ON DELETE SET NULL + indexes.
  2. **Naming metadata backfill** on all identity values per the artifact's tables (equipment = name @40 except Bodyweight NULL; load positions = name @45 with barbell-group implies; stances @30 with Wide (Sumo)→'Wide-Stance', Narrow→'Narrow-Stance', Standard NULL; range depths @20 with Full NULL, ATG→'ATG', Lockout Only→'Lockout'; styles @10/12/14 by category; symmetries: Alternating→'Alternating' @35, all others NULL).
  3. **Style split**: add Butterfly (Dynamic Power, identity); set is_identity per the approved seven; repoint exercise_movement_styles rows from Controlled→Tempo (dedupe-safe), then DELETE junction rows referencing Standard/Unbroken/Alternating/'Partial / Range-Limited', null out any exercises.movement_style_id pointing at dropped values, DELETE the four dropped rows + Controlled.
  4. **Families**: UPDATE 'Core'→'Midline'; merge 'Mobility/Control' into 'Mobility' (repoint exercises.movement_family_id + movement_family_modalities dedupe-safe, delete row).
  5. **Goals**: merge 'Cool-Down'→'Recovery' (repoint exercise_goal_types dedupe-safe + exercises.goal_type_id, delete row).
  6. **Load positions**: add 'Double Overhead' + 'Waiter'; UPDATE 'Hang' category to 'Start Position'; drop 'Bodyweight' (null exercises.load_position_id refs, delete exercise_load_positions junction refs, delete row).
  7. **Range depths**: ADD COLUMN implies_equipment_id UUID REFERENCES equipment(id) ON DELETE SET NULL; set Box→Box equipment; drop 'Variable / Custom' (null refs, delete row).
  8. **Stances**: add 'Supine' and 'Prone'; rename 'Athletic / Partial Squat'→'Athletic'; keep legacy 'Supine / Prone' (Stage 3 reclassifies then drops).
  9. **Equipment**: add Jump Rope (Bodyweight / Apparatus), GHD (Supports / Surfaces), Parallettes (Bodyweight / Apparatus), Sled (Implements), Weight Vest (Implements) with fragments/order.
  10. **Engine amendments** (CREATE OR REPLACE, preserving SECURITY DEFINER/search_path/locking exactly as shipped): `exercise_identity_attrs` gains the two grip columns; `generate_exercise_name` gains grip fragments and generalizes suppression to also honor range_depths.implies_equipment_id (suppress the equipment word when EITHER the load position OR the range depth implies that equipment).
  11. **Recompute backfill**: `PERFORM recompute_exercise_identity(id) FROM exercises;` (fragments changed generated names; all real rows are name_is_custom so display names cannot change — assert name md5 unchanged in the trailing block via a well-known-count proxy: zero rows where name_is_custom=false).
  12. **Trailing self-verify** DO block mirroring the V8 essentials (standing rule — push must fail closed).
- [ ] **Step 3:** apply to staging (`psql -v ON_ERROR_STOP=1 -f`), re-run harness → PASS. Extend V6's rolled-back fixture with one grip case: fixture child + grip_width 'Wide' (fragment 'Wide-Grip') appears in the generated name at order 25 and in the fingerprint; harness → PASS again.
- [ ] **Step 4:** idempotency: re-apply the file (exit 0); `psql -1` single-transaction re-apply (exit 0).
- [ ] **Step 5:** invariant checks: exercises count unchanged; zero name changes (`md5(string_agg(name...))` before/after); parent links unchanged; no orphaned junction rows (goal/style junctions vs their reference tables).
- [ ] **Step 6:** commit both files: `feat(db): approved attribute dictionary - fragments, style split, grips, merges and drops`.

### Task 2: Reviews

- [ ] Spec-compliance review against the artifact's decision record (every table above vs live staging state) + quality review (merge/repoint correctness under dedupe, engine amendment fidelity, live-drift defenses). Fix loops per the standing process.

### Task 3: Push to live (Task-11 gate pattern, unchanged)

- [ ] Gates: migration list clean → orphan check 0 → staging `psql -1` rehearsal of THIS migration → fresh backup via dump script (NOTE: dump list doesn't yet include grips/new tables — that's fine, this migration doesn't destroy anything the dump misses; the Back-merge lesson doesn't apply since all drops here are reference values whose exercise references are nulled, not deleted) → dry-run lists exactly this one migration → push → live harness PASS → live spot checks (counts per V8) → anon API probes (grips readable, not writable).
- [ ] Merge branch to main, push, delete branch.

### Task 4: Close out Stage 2

- [ ] Spec: replace the "Open items — attribute audit outcomes" line with a pointer to the artifact decision record; note the new grips attribute in the schema section and the two engine generalizations.
- [ ] Roadmap: tick Stage 2, note the Supine/Prone legacy value hand-off to Stage 3; Stage 3 gains: reclassify rows tagged legacy 'Supine / Prone', then drop the value.
- [ ] Memory update; report to user with the Stage 3 preview (core-set curation + catalog pass).
