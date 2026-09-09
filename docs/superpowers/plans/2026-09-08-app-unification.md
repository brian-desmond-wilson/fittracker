# App Unification Implementation Plan (Stage 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking. Task granularity follows this project's house convention (task-level with binding requirements; the dispatching controller carries per-step detail into implementer prompts).

**Goal:** The app reads and writes the new movement model exclusively at its edges — one guarded save/update path, classification-driven browsing, and a capture pipeline that resolves names through the alias table and routes unknowns to the review queue instead of minting duplicates.

**Architecture:** A single TypeScript "front door" module owns every write to the exercises catalog; both wizards, the edit path, and the capture pipeline call it. Reads move to the stored columns the engine maintains (tier, generated_name, junctions). One small DB migration adds alias re-normalization + policy tightening (same gated live-push procedure as Stages 3–4). No visual redesign: existing design language, pickers as bottom sheets, primary actions at the end of scrollable content.

**Tech Stack:** Expo/React Native + TypeScript (mobile/), Supabase JS (UNTYPED client — a green typecheck proves nothing about column names; every task must probe staging over REST), Postgres engine from Stages 1–4, one SQL migration.

**Environment:** Staging DB postgresql://postgres:postgres@127.0.0.1:56322/postgres (Stage 4 end state, live-identical); staging REST http://127.0.0.1:56321 (anon key via `supabase status`). Never edit `mobile/.env`; never source repo-root `.env`. Expo smoke tests need `--no-dev`. Branch: `app-unification`.

**Binding sources:** roadmap Stage 5 list (`2026-08-24-movement-model-roadmap.md`), spec Phase 6, the 2026-09-08 app survey (paths below), guardrail G4 (no free-text variant field, ever), Stage 4 notes (duplicate = SQLSTATE 23505 on `exercises_fingerprint_key`, retryable 40P01 deadlocks, deferred-constraint recipe is curation-only, not for the app).

---

### Task 1: Front-door data layer (all catalog writes in one module)

**Files:**
- Create: `mobile/src/lib/supabase/frontDoor.ts`
- Modify: `mobile/src/lib/supabase/crossfit.ts` (createMovement ~:1087, createExercise ~:521, generateUniqueSlug ~:1048 — delegate or export for reuse; no behavior change to untouched callers yet)
- Test: `mobile/src/lib/supabase/__tests__/frontDoor.test.ts` (unit: payload shaping, error mapping) + a committed REST probe script `scripts/movement-model/probe_front_door.sh` run against staging

- [ ] `createCatalogExercise(input)` and `updateCatalogExercise(id, patch)` — the ONLY insert/update paths for `exercises`. Input: name (optional custom), core_movement_id | null (outlier), attribute ids (load_position, stance, range_depth, symmetry, grip_orientation, grip_width, bench_angle, direction, support_position, arm_position, variant_label — variant only from `variant_labels` scoped to the chosen core, G2), equipment ids (junction), muscles (primary/secondary), goals, modality/family, is_movement, description/media fields.
- [ ] Naming contract: custom name provided → write name + `name_is_custom: true`; no custom name → insert with `name_is_custom: false` and a placeholder name, then read back the engine's `generated_name`/`name` (engine owns it). Never write `generated_name`, `identity_fingerprint`, `tier`, `parent_exercise_id`.
- [ ] Legacy compat (until Stage 6): also write `equipment_types` text array (names) and `skill_level` so existing readers keep working; keep slug via the collision-probing generator.
- [ ] Error mapping: 23505 on `exercises_fingerprint_key` → typed `DuplicateExerciseError` carrying the existing row (query by core+attributes to find it); 40P01 → one automatic retry then typed error; core-validation rejection → typed error.
- [ ] Update path recomputes junctions diff-style (delete/insert changed rows only) inside one logical operation; verify engine recompute fires (read back fingerprint change) via REST probe on staging.
- [ ] Probe script proves on staging: create-with-core generates a name; create duplicate → DuplicateExerciseError; custom name survives (name_is_custom honored, M4 closed); update changes an attribute and the stored name/tier follow; cleanup deletes probe rows.
- [ ] DECISION (Stage 4 review M5, live the moment user rows gain cores): fingerprint uniqueness stays GLOBAL (not scoped by created_by). Rationale: single-developer app; a user variant identical to an official row IS the duplicate the model exists to prevent, and DuplicateExerciseError surfaces the existing row instead of failing opaquely. Record in code comment at the error mapper; revisit only if the app ever becomes multi-tenant-authored.
- [ ] Typecheck + unit tests + probe green; commit.

### Task 2: One wizard, both tabs, plus edit

**Files:**
- Modify: `mobile/src/components/training/crossfit/AddMovementWizard.tsx`, `AddExerciseWizard.tsx` (the second becomes a thin wrapper or is deleted; both FABs open the unified wizard), `wizard/Step1Core.tsx`, `wizard/Step2Classification.tsx`, `wizard/Step3Attributes.tsx`, `crossfit/ParentMovementSearch.tsx` (becomes the core picker: `is_core` rows only), `crossfit/SwipeableMovementCard.tsx` (add Edit action beside Delete), `src/components/training/item-detail/TrainingItemDetailScreen.tsx` (Edit entry point)
- Test: probe-backed manual script + component tests where the repo already has them

- [x] Extend the front door first (review follow-ups): (a) add `scoring_type_ids` to the create/update input, write the `exercise_scoring_types` junction, and derive `requires_distance` exactly as the old writer did; (b) fix create-with-equipment transient collision by resequencing create: insert with NULL core → junctions → set core_movement_id last, so the recompute lands directly on the final identity (kills the transient-on-create class; update keeps the Task 1 discriminator); (c) after any successful save, compare client fingerprint to the readback's stored fingerprint and console.error on mismatch (drift alarm). Unit tests + probe extensions for all three.
- [x] Both tabs' FABs open ONE wizard component; only preset differs (`is_movement`). All saves go through `createCatalogExercise` / `updateCatalogExercise`. Delete both inline insert paths (including the "bundler caching" direct insert) — the Exercises-tab data loss (dropped muscle regions/stances/loads/styles) dies here.
- [x] Step 1: Core vs Derivation vs Outlier. Derivation → core picker (is_core rows). Name field becomes optional: live preview text "will be named by its attributes" with a "use custom name" toggle. NO free-text variant field anywhere (G4); variant label appears in Step 3 as a picker of the chosen core's `variant_labels` only.
- [x] Step 2: family/modality read from `movement_family_modalities` (kill the hardcoded map — Midline reachable, merged/renamed families correct); remove `Cool-Down` from goal handling (`src/types/crossfit.ts:15`, `src/lib/wodDetailHelpers.ts:163`, `src/lib/dailyCandidates.ts:90`); fix the hardcoded "Core / Midline" muscle-region section header logic (`Step2Classification.tsx:511`).
- [x] Step 3: single-select per identity attribute (matches the model: one FK column each), equipment multi-select (junction), plus the four new attribute pickers (direction, support position, arm position, bench angle) fed from their dictionaries. Pickers are bottom sheets; primary action at end of scroll (house rules).
- [x] Duplicate save → friendly sheet naming the existing exercise with "open it" action (from DuplicateExerciseError payload).
- [x] Edit: card swipe action + detail-screen button open the wizard pre-filled from the row + junctions; save calls update. Deleting stays as-is.
- [x] Verify against staging via Expo (`--no-dev` for staging env) + REST probes; commit per logical change.

### Task 3: Reads, filters, and tier truth

**Files:**
- Modify: `mobile/src/components/training/crossfit/MovementsTab.tsx`, `ExercisesTab.tsx`, `mobile/src/lib/supabase/crossfit.ts` (fetchMovements/fetchAllExercises/searchMovements/searchAllExercises/searchMovementsWithTier/fetchTierMap), `mobile/src/lib/movementTier.ts` (retire), `TrainingItemDetailScreen.tsx`
- Test: REST probes comparing list payloads before/after; snapshot/unit where present

- [x] Tier badges read `exercises.tier`; delete the whole-table JS walker and the per-detail `get_movement_tier` RPC call.
- [x] Exercises tab query excludes `is_movement = true` rows (the split becomes real); Movements tab unchanged semantics.
- [x] Filter pills read classification: pills = modality-driven (Weightlifting / Gymnastics / Monostructural / Recovery) with family sub-filter or equivalent — server-side `.eq` filters, not client name-substring matching; delete the substring lists; rename the ambiguous "Core" pill to "Cores" (hierarchy meaning) with `is_core` filter.
- [x] Detail screen: equipment chips from `exercise_equipment` junction (names via join), aliases display from `exercise_aliases` (replaces the legacy array read at :277), hierarchy from `parent_exercise_id` as today but tier from stored column; variation-options section reads stay for now (Stage 6 drops them) but stop MINTING variation options (`createVariationOption` callers removed with the old wizards in Task 2).
- [x] Search: `searchMovementsWithTier` matches name OR `exercise_aliases.alias` (join), replacing the legacy aliases-array filter.
- [x] Commit per logical change.

### Task 4: Capture through the guarded door + review queue UI

**Files:**
- Modify: `mobile/src/lib/supabase/capture.ts` (saveCapture ~:196-245, fetchCatalog), `mobile/src/lib/captureReview.ts`, `mobile/src/components/training/daily/CaptureSheet.tsx`, `CaptureReviewSheet.tsx`
- Create: `mobile/src/components/training/daily/MatchReviewSheet.tsx` (review queue UI), `mobile/src/lib/supabase/matchReviews.ts`
- Modify: `supabase/functions/capture-post/index.ts` (extraction prompt unchanged; matching contract tightened)
- Test: REST probes on staging incl. alias-hit, alias-miss, and review-resolution paths

- [ ] Resolution order per captured name: (1) exact `exercise_aliases.alias_normalized` lookup (normalize client-side identically to `normalize_alias` — port the function — or via a one-line RPC; prefer the RPC so the dictionary stays single-source), including display-name equality; (2) the existing LLM `library_match_id` (validated as today); (3) NO auto-create — insert an `exercise_match_reviews` row (captured name, source link, candidate ids from a fuzzy alias search) and save the workout item linked to the review, displayed as "pending review" in the captured workout.
- [ ] `MatchReviewSheet`: lists pending reviews; per row: link to an existing exercise (search picker reusing the Task 3 alias-aware search), "link + save alias" (writes the wild alias via a front-door helper), or "create new" (opens the Task 2 wizard, then links). Resolving updates `exercise_match_reviews` (status + resolved_exercise_id) and repoints the captured item.
- [ ] The capture flow's silent `createExercise` path is deleted; `was_created` handling adjusted; existing captured data untouched.
- [ ] Daily Catalog tab: equipment pill reads junction-backed data (fetchCatalog select updated) — behavior identical for existing rows via the compat array until Stage 6, but new rows must appear correctly.
- [ ] Probes prove: caption name that IS an alias links without model help; unknown name creates a review and NO exercise row; resolving each of the three ways ends with a correctly linked item and (for alias path) a new alias row. Commit per logical change.

### Task 5: Dictionary re-normalization + policy tightening (DB migration)

**Files:**
- Create: `supabase/migrations/20260910100000_renormalize_and_policies.sql`
- Modify: `scripts/movement-model/verify_foundation.sql` (V11)
- Test: migration self-verify + harness + REST negative probes (anon/authenticated writes)

- [ ] Trigger on `alias_abbreviations` (INSERT/UPDATE/DELETE): re-normalize every `exercise_aliases.alias_normalized`; a collision pair routes the LOSER (newer row) to `exercise_match_reviews` and removes it from aliases — never fails the dictionary write; NOTICE counts. (Task 6 review hand-off.)
- [ ] Align the `equipment` dictionary SELECT policy with the other dictionaries (currently authenticated-only; Task 3 found anon embeds return null) in the same policy pass.
- [ ] Tighten writes: `exercise_equipment`, `exercise_aliases`, and `exercise_scoring_types` (Task 2 finding: its policies are all-true for authenticated) INSERT/UPDATE/DELETE policies restricted to rows whose exercise is `created_by = auth.uid() AND is_official = false`; official rows writable only via SECURITY DEFINER helpers/service role. Front door (Tasks 1/4) must still work as an authenticated user against staging — prove with REST probes both directions (own row succeeds, official row rejected).
- [ ] V11: policy shape asserted; re-normalization fixture (BEGIN/ROLLBACK: add abbreviation, observe re-normalized alias + routed collision).
- [ ] House rules: lock_timeout header, idempotent, single-transaction, self-verify, psql -1 + idempotent re-run proofs on staging. This migration ships to live through the SAME gated procedure (fresh dump, rehearsal, user confirms push).

### Task 6: Exit gate + close-out

- [ ] Live tier-parity sweep before/at the Task 5 push: stored tier vs get_movement_tier for all rows on LIVE; recompute any drifted row via the engine (staging had one: Incline Bench Press).
- [ ] Live-parity check: the column-as-relation embed (`core_movement:core_movement_id(name)`) verified once against LIVE's PostgREST version (local stack accepted it; constraint-name hints did not).
- [ ] `npx tsc --noEmit` clean in mobile/; full REST probe suite green against staging; Expo staging smoke (`--no-dev`) of: create derivation (generated name appears), create duplicate (friendly rejection), edit attribute (name/tier update), capture with alias hit, capture with unknown → review → resolve all three ways.
- [ ] Gated live push of the Task 5 migration; harness V0–V11 on live.
- [ ] ON-DEVICE verification by the user (roadmap exit gate): add / edit / capture-match flows on the real phone. Dev-client rebuild NOT expected (no new native modules) — confirm before claiming.
- [ ] Merge to main, push. Roadmap tick, spec amendment, memory, artifact note. Stage 6 unblock note listing every legacy read removed here (and any still left, which Stage 6 must wait on).
