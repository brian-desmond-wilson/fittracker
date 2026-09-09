# Movement Model Redesign — Master Roadmap

Spec: `docs/superpowers/specs/2026-08-24-movement-model-redesign-design.md`

This is the tracking checklist for the whole redesign. Detailed implementation plans are authored per stage, because later stages depend on decisions produced by earlier gates. Nothing is skipped; a stage is done only when its exit criteria all pass.

## Stage map

| Stage | Spec phases | Plan | Status |
|---|---|---|---|
| 1. Foundation | 0–3 | `2026-08-24-movement-model-foundation.md` | **done 2026-08-24, live** |
| 2. Attribute audit session | 1 (decision gate) | decision record: Attribute Audit artifact; applied via `2026-08-24-attribute-dictionary.md` | **done 2026-08-24, live** |
| 3. Catalog pass | 4 | authored next | **unblocked** |
| 4. Turn the locks | 5 | authored with Stage 3 | blocked by 3 |
| 5. App unification | 6 | authored after Stage 4 | blocked by 4 |
| 6. Retire legacy | 7 | authored with Stage 5 | blocked by 5 |

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

- [ ] Fingerprint uniqueness enforced — REPLACING the plain `exercises_fingerprint_idx` from Stage 1 (build the unique index, then drop the plain one; never carry both) ; alias uniqueness already live from Stage 1
- [ ] Triggers own generated names, parents, tiers
- [ ] Sibling-recompute on identity change (recomputing X re-derives siblings whose attrs strictly contain X's), or a documented decision that inter-batch drift is acceptable (Task 9 review I5)
- [ ] Symmetric core-reference validation in enforce_core_self_reference: a non-self core_movement_id must reference an is_core row, read under FOR KEY SHARE of the target — closes both the phantom-core insert gap and the demote-vs-insert race in either commit order (Task 9 final review; until then V5's inverse invariant detects the state post-hoc)
- [ ] Replace the pg_trigger_depth guards with a session-variable guard before any trigger-driven insert paths exist (Task 9 review I2 — depth guard silently skips recompute for rows inserted from inside another trigger)
- [ ] Harness assertion: no duplicate generated_name within a core; zero-attribute children flagged (Task 9 review M3/I4)
- [ ] Movement Model artifact updated to the "after" state
- **Exit gate:** a duplicate insert is rejected by the database in a live test

## Stage 5 — App unification (Phase 6)

- [ ] One save path for both wizards; update path added
- [ ] Reads move to new columns (stored tier, display name, junction truth)
- [ ] Filter pills read classification data, not name substrings
- [ ] Capture pipeline routed through the guarded front door + review queue UI
- [ ] Dictionary-change re-normalization: adding an alias_abbreviations row re-normalizes all exercise_aliases and routes collisions to the review queue (Task 6 review finding — until this lands, the dictionary is append-rarely and any change requires a harness re-run)
- [ ] Minting a user-named exercise must set name_is_custom=true or the engine clobbers the provided name on insert (Task 9 review M4; the Stage 2 migration flips drift rows true as a stopgap)
- [ ] Wizard family filter: update for Midline rename and Mobility/Control merge (Stage 2 quality review — until then Midline is reachable only via Show All Families); clean the Cool-Down references in goal handling
- [ ] Grip columns need a category guard (orientation column must reference an Orientation grip, width a Width grip) before Stage 3 tooling writes them — Stage 2 quality review
- [ ] Revisit the wide-open authenticated write policies on exercise_equipment and exercise_aliases once the front door exists (Task 9 review I1)
- [ ] When user-created rows gain core_movement_id (deriving from official cores): revisit fingerprint-uniqueness scope re created_by (two users' identical private variants would collide globally) and re-test enforce_core_self_reference under RLS (Stage 4 review I3/M5)
- **Exit gate:** on-device verification of add / edit / capture-match flows

## Stage 6 — Retire legacy (Phase 7)

- [ ] Legacy drops, exactly (spec Phase 7 wording is authoritative, disambiguated 2026-08-24): columns `goal_type_id` + `movement_style_id`; junctions `exercise_planes_of_motion` + `exercise_load_positions` + `exercise_stances` (their single FK columns SURVIVE as canonical); `equipment_types`; `exercises.aliases`; tables `variation_categories` + `variation_options` + `exercise_variations`. Retire the harness's V7 guard in the same change.
- [ ] Final verification suite green; spec and artifact updated
- **Exit gate:** no app code references a dropped column (grep proves it)
