# Movement Model Redesign — Master Roadmap

Spec: `docs/superpowers/specs/2026-08-24-movement-model-redesign-design.md`

This is the tracking checklist for the whole redesign. Detailed implementation plans are authored per stage, because later stages depend on decisions produced by earlier gates. Nothing is skipped; a stage is done only when its exit criteria all pass.

## Stage map

| Stage | Spec phases | Plan | Status |
|---|---|---|---|
| 1. Foundation | 0–3 | `2026-08-24-movement-model-foundation.md` | **done 2026-08-24, live** |
| 2. Attribute audit session | 1 (decision gate) | decision record: Attribute Audit artifact; applied via `2026-08-24-attribute-dictionary.md` | **done 2026-08-24, live** |
| 3. Catalog pass | 4 | `2026-09-08-catalog-pass.md` | **done 2026-09-08, live** |
| 4. Turn the locks | 5 | `2026-09-08-turn-the-locks.md` | **done 2026-09-08, live** |
| 5. App unification | 6 | `2026-09-08-app-unification.md` | **done 2026-09-09, live, exit gate passed on device** |
| 6. Retire legacy | 7 | `2026-09-09-stage6-retire-legacy.md` | **done 2026-09-09, live — REDESIGN COMPLETE** |

## Stage 1 — Foundation (Phases 0–3)

- [x] Local staging stood up from a fresh live-schema baseline; migration history repaired
- [x] Attribute audit worksheet generated (all 15 attributes, every value, live usage counts)
- [x] Reference-table structural columns added (`region_group`, `is_identity`, `name_fragment`, `name_order`, `implies_equipment_id`)
- [x] `movement_family_modalities`, `alias_abbreviations` created and seeded
- [x] Known-certain reference fixes applied (stray Back region merged, region groups, family↔modality truth)
- [x] Catalog identity columns on `exercises` (`core_movement_id`, `identity_fingerprint`, `tier`, `generated_name`, `name_is_custom`)
- [x] `exercise_aliases` (+ normalizer), `exercise_equipment`, `exercise_match_reviews` created
- [x] Fingerprint / naming / parent / tier engine (functions + triggers) implemented and SQL-tested
- [x] Verification suite green on staging; applied to live; verification green on live
- **Exit gate:** schema is live, engine is proven, no behavior change visible in the app yet

## Stage 2 — Attribute audit session (user + Claude)

- [x] Rule on all 15 attributes: keep / merge / drop; overlaps resolved (range depth vs Partial/Range-Limited style; symmetry Alternating vs style Alternating)
- [x] Rule on every value: keep / merge / rename; missing values added
- [x] Every value gets `is_identity`, `name_fragment`, `name_order` (and `implies_equipment_id` for load positions)
- [x] Outcome written back into the spec as the final attribute dictionary; seed migration applied
- **Exit gate:** user-approved attribute dictionary, applied to live

## Stage 3 — Catalog pass (Phase 4)

Engine-review hand-offs (Task 9 review, must be honored by the batch tooling):
- [x] Batch-recompute in ascending identity-attribute-cardinality order per core (parents finalize before children, else tiers build on stale parents)
- [x] After the batch: purge and rebuild ALL kind='generated' aliases from final generated names, routing collisions to the review queue
- [x] Canonicalize implied-equipment: when a load position implies equipment, the junction row must consistently exist (or consistently not); assert no duplicate generated_name within a core
- [x] Recompute descendants after any core rename or merge (trigger does not fire on name changes)
- [x] Never read generated_name on rows with no core movement (it echoes the display name there)

- [x] Reclassify rows tagged the legacy combined 'Supine / Prone' stance, then drop the value (Stage 2 hand-off)
- [x] Core movement set proposed (from live data + CrossFit canon) and user-approved
- [x] All 307 rows classified: core movement or explicit outlier, full identity attributes, explicit `is_movement` curation (kept as a pure Movements-tab label per user decision)
- [x] Review sheet produced; user approves before any write
- [x] Duplicates merged with every downstream FK repointed (incl. `exercise_match_reviews.resolved_exercise_id`, which is ON DELETE RESTRICT per Task 7 review); loser names kept as aliases
- [x] Equipment text array backfilled into the junction; wrong tree placements fixed via attributes
- [x] Table backups taken before every destructive step
- **Exit gate:** every row classified, zero unexplained rows, audit queries green — MET 2026-09-08: `20260908100000_catalog_pass.sql` applied to LIVE (287 exercises = 48 cores + 187 derives + 52 outliers, 25 merges, 299 aliases, zero fingerprint collisions; harness V0-V9 PASS on live). Stage 4 unblocked.

## Stage 4 — Turn the locks (Phase 5)

- [x] Fingerprint uniqueness enforced — REPLACING the plain `exercises_fingerprint_idx` from Stage 1 (build the unique index, then drop the plain one; never carry both) ; alias uniqueness already live from Stage 1
- [x] Triggers own generated names, parents, tiers
- [x] Sibling-recompute on identity change (recomputing X re-derives siblings whose attrs strictly contain X's), or a documented decision that inter-batch drift is acceptable (Task 9 review I5)
- [x] Symmetric core-reference validation in enforce_core_self_reference: a non-self core_movement_id must reference an is_core row, read under FOR KEY SHARE of the target — closes both the phantom-core insert gap and the demote-vs-insert race in either commit order (Task 9 final review; until then V5's inverse invariant detects the state post-hoc)
- [x] Replace the pg_trigger_depth guards with a session-variable guard before any trigger-driven insert paths exist (Task 9 review I2 — depth guard silently skips recompute for rows inserted from inside another trigger)
- [x] Harness assertion: no duplicate generated_name within a core; zero-attribute children flagged (Task 9 review M3/I4)
- [x] After-state is documented by "The FitTracker Catalog" artifact (cfb9a43f, live state) — supersedes updating the older Movement Model artifact
- **Exit gate:** MET 2026-09-08 — duplicate insert rejected on LIVE by exercises_fingerprint_key (SQLSTATE 23505, rolled back, catalog untouched). `20260909100000_turn_the_locks.sql` live; harness V0-V10 PASS on live. Stage 5 unblocked.

## Stage 5 — App unification (Phase 6)

- [x] One save path for both wizards; update path added
- [x] Reads move to new columns (stored tier, display name, junction truth)
- [x] Filter pills read classification data, not name substrings
- [x] Capture pipeline routed through the guarded front door + review queue UI
- [x] Dictionary-change re-normalization: adding an alias_abbreviations row re-normalizes all exercise_aliases and routes collisions to the review queue (Task 6 review finding — until this lands, the dictionary is append-rarely and any change requires a harness re-run)
- [x] Minting a user-named exercise must set name_is_custom=true or the engine clobbers the provided name on insert (Task 9 review M4; the Stage 2 migration flips drift rows true as a stopgap)
- [x] Wizard family filter: update for Midline rename and Mobility/Control merge (Stage 2 quality review — until then Midline is reachable only via Show All Families); clean the Cool-Down references in goal handling
- [x] Grip columns need a category guard (orientation column must reference an Orientation grip, width a Width grip) before Stage 3 tooling writes them — Stage 2 quality review
- [x] Revisit the wide-open authenticated write policies on exercise_equipment and exercise_aliases once the front door exists (Task 9 review I1)
- [x] When user-created rows gain core_movement_id (deriving from official cores): revisit fingerprint-uniqueness scope re created_by (two users' identical private variants would collide globally) and re-test enforce_core_self_reference under RLS (Stage 4 review I3/M5)
- **Exit gate:** PASSED 2026-09-09 — user verified add (generated naming, duplicate sheet + Open), edit (auto-rename, stale-image invalidation), and capture on device. Captured workout "Melt Programming Benchmark WOD Day 2": 7 items linked, 4 review cards resolved (Dumbbell Thruster, Dumbbell Deadlift, Straight-Leg Sit-Up, Alternating Dumbbell Snatch — all minted as tier-1 derivations, zero silent creates). Fixes landed during the gate: core-search thenable bug, duplicate-sheet navigation sequencing, image invalidation on identity change, share-intent URL race + blank-URL dedupe guard, name_is_custom reconciliation. Dictionary gained Straight-Leg identity style (migration 20260911100000, LIVE) so straight-leg variants carry a real fingerprint instead of a kept custom name.

## Stage 6 — Retire legacy (Phase 7)

Hardening hand-offs from the Stage 5 quality review (2026-09-09, pre-existing conditions surfaced by hostile probing — address here or in a dedicated hardening pass):
- [x] Parent candidacy scoped 2026-09-09 (migration `20260914110000_scope_parent_candidacy.sql`, LIVE): a candidate parent must be official or share the child's owner; apply-time sweep re-parented the 4 known cross-owner rows (Incline Dumbbell Press + three Cable Chest Fly children) to their cores. Slot-squatting handled by playbook, not constraint surgery: a private row squatting a (core, fingerprint) slot is resolved during official curation by promoting the row (is_official=true, curated fields) or renaming its identity. Residuals logged for the multi-user hardening pass: (a) ten ownerless non-official seed rows from 2025-10-17 (zero exposure today — the NULL-owner leg admits them as parents but they capture nothing; durable fix is assigning owners/officialness); (b) three official rows (Front Squat, Overhead Squat, Chest-to-Bar) parent to USER-OWNED non-official cores via the untouched core fallback — fix is promoting those cores to official; (c) the legacy `Exercises are viewable by everyone` USING(true) SELECT policy makes all private exercises world-readable — retire it alongside alias scoping.
- [x] Curation pass DONE 2026-09-09 (migration `20260914100000_core_curation.sql`, LIVE; decision record `docs/superpowers/audit/2026-09-09-skill-scoring-curation.csv`): every catalog row now carries skill_level and ≥1 scoring type (fail-closed assertion in the migration proves it); derivations backfilled from cores; "when relevant" is expressed with the Not Scored / N/A scoring type (all Recovery/Mobility rows). Wizard requires both on create/edit (`missingClassification`, step-2 gate + save gate). Bound Ups deleted with its history (user verdict: not a real exercise; cascaded one logged instance + one captured item).
- [ ] DEFERRED to the multi-user milestone (decision 2026-09-09): wild-alias carve-out as a resolution-poisoning vector + everyone-readable alias table leaking private exercise names. Rationale: solo user today; the carve-out is deliberate Stage 5 behavior. Bundle with the USING(true) exercises SELECT policy retirement (see hardening residuals above) when accounts multiply.

- [x] Legacy drops EXECUTED 2026-09-09 (migration `20260915100000_retire_legacy.sql`, LIVE): all four exercises columns, all three attribute junctions (single FK columns survive as canonical), all three variation tables, plus four all-NULL vestigial variant-pointer FK columns on exercise_standards / movement_measurement_profiles / movement_scaling_links found during Task 8 review. V7 harness guard inverted to assert ABSENCE. Final pre-drop backup `backups/catalog_data_20260909211947.sql` (local, git-ignored — the only remaining copy of the legacy tables' contents, incl. 10 exercise_variations rows for Pike Walk + Hanging Knee Raise). App moved off every legacy read/write first (front door, 11 goal_type FK embeds, variations UI, equipment junction with core_default_equipment fallback shared helper, edge function generate-exercise-image redeployed). Tooling updated: dump script table list, dump-swap deletes + dataset floors, wizard probe asserts junctions; generate_catalog_pass.py + audit_worksheet.sql marked historical (generator still regenerates the Stage 3 migration byte-identically). NOTE: swap_fresh_dump.sql needs a POST-drop dump before its next use — the pinned 2026-09-08 dump still COPYs the dropped tables.
- [x] Final verification green 2026-09-09: harness V0-V11 PASS on staging with inverted V7 (V8 updated to 13 styles incl. Straight-Leg), all four probe suites PASS against the dropped schema, tsc clean, jest 88 suites / 1788+4 tests. Live post-push REST proof: dropped column 400s, dropped table 404s, surviving FK columns + junction embeds 200, 290 exercises intact. Spec Phase 7 annotated.
- **Exit gate:** PASSED 2026-09-09 — repo-wide grep over mobile/src + supabase/functions finds zero reads/writes of any dropped structure; every residual hit is a junction-internal column (exercise_movement_styles.movement_style_id, exercise_goal_types.goal_type_id), the in-memory WODMovementConfig.equipment_types field, a comment, or a test fixture. Exit-gate UI follow-ups shipped and device-verified 2026-09-09: review-chip confirm dialog (double-tap ref guard) and "Standard — as <core>" attribute display with core description.
