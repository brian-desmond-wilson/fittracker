# Movement Model Redesign — Master Roadmap

Spec: `docs/superpowers/specs/2026-08-24-movement-model-redesign-design.md`

This is the tracking checklist for the whole redesign. Detailed implementation plans are authored per stage, because later stages depend on decisions produced by earlier gates. Nothing is skipped; a stage is done only when its exit criteria all pass.

## Stage map

| Stage | Spec phases | Plan | Status |
|---|---|---|---|
| 1. Foundation | 0–3 | `2026-08-24-movement-model-foundation.md` | ready |
| 2. Attribute audit session | 1 (decision gate) | interactive, worksheet from Stage 1 | blocked by 1 |
| 3. Catalog pass | 4 | authored after Stage 2 | blocked by 2 |
| 4. Turn the locks | 5 | authored with Stage 3 | blocked by 3 |
| 5. App unification | 6 | authored after Stage 4 | blocked by 4 |
| 6. Retire legacy | 7 | authored with Stage 5 | blocked by 5 |

## Stage 1 — Foundation (Phases 0–3)

- [ ] Local staging stood up from a fresh live-schema baseline; migration history repaired
- [ ] Attribute audit worksheet generated (all 15 attributes, every value, live usage counts)
- [ ] Reference-table structural columns added (`region_group`, `is_identity`, `name_fragment`, `name_order`, `implies_equipment_id`)
- [ ] `movement_family_modalities`, `alias_abbreviations` created and seeded
- [ ] Known-certain reference fixes applied (stray Back region merged, region groups, family↔modality truth)
- [ ] Catalog identity columns on `exercises` (`core_movement_id`, `identity_fingerprint`, `tier`, `generated_name`, `name_is_custom`)
- [ ] `exercise_aliases` (+ normalizer), `exercise_equipment`, `exercise_match_reviews` created
- [ ] Fingerprint / naming / parent / tier engine (functions + triggers) implemented and SQL-tested
- [ ] Verification suite green on staging; applied to live; verification green on live
- **Exit gate:** schema is live, engine is proven, no behavior change visible in the app yet

## Stage 2 — Attribute audit session (user + Claude)

- [ ] Rule on all 15 attributes: keep / merge / drop; overlaps resolved (range depth vs Partial/Range-Limited style; symmetry Alternating vs style Alternating)
- [ ] Rule on every value: keep / merge / rename; missing values added
- [ ] Every value gets `is_identity`, `name_fragment`, `name_order` (and `implies_equipment_id` for load positions)
- [ ] Outcome written back into the spec as the final attribute dictionary; seed migration applied
- **Exit gate:** user-approved attribute dictionary, applied to live

## Stage 3 — Catalog pass (Phase 4)

- [ ] Core movement set proposed (from live data + CrossFit canon) and user-approved
- [ ] All 307 rows classified: core movement or explicit outlier, full identity attributes, explicit `is_movement` curation (kept as a pure Movements-tab label per user decision)
- [ ] Review sheet produced; user approves before any write
- [ ] Duplicates merged with every downstream FK repointed; loser names kept as aliases
- [ ] Equipment text array backfilled into the junction; wrong tree placements fixed via attributes
- [ ] Table backups taken before every destructive step
- **Exit gate:** every row classified, zero unexplained rows, audit queries green

## Stage 4 — Turn the locks (Phase 5)

- [ ] Fingerprint uniqueness enforced; alias uniqueness already live from Stage 1
- [ ] Triggers own generated names, parents, tiers
- [ ] Movement Model artifact updated to the "after" state
- **Exit gate:** a duplicate insert is rejected by the database in a live test

## Stage 5 — App unification (Phase 6)

- [ ] One save path for both wizards; update path added
- [ ] Reads move to new columns (stored tier, display name, junction truth)
- [ ] Filter pills read classification data, not name substrings
- [ ] Capture pipeline routed through the guarded front door + review queue UI
- **Exit gate:** on-device verification of add / edit / capture-match flows

## Stage 6 — Retire legacy (Phase 7)

- [ ] Five dual-storage columns, `equipment_types`, `exercises.aliases`, variation-options tables dropped
- [ ] Final verification suite green; spec and artifact updated
- **Exit gate:** no app code references a dropped column (grep proves it)
