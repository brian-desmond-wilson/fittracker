# Turn the Locks Implementation Plan (Stage 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make duplicate exercises physically impossible and close the engine's known race/drift gaps: fingerprint uniqueness enforced by the database, sibling recompute on identity change, session-variable trigger guard, symmetric core-reference validation. Exit gate: a duplicate insert is rejected by the database in a live test.

**Preconditions (met 2026-09-08):** Stage 3 catalog pass LIVE — 287 exercises, zero per-core fingerprint duplicates, generated-name duplicates limited to 5 declared pairs, harness V0–V9 PASS on live.

**Architecture:** ONE migration (`20260909100000_turn_the_locks.sql`) under the full standing rules (idempotent, single-transaction under `psql -1`/`db push`, `SET LOCAL lock_timeout` first, in-file self-verify DO blocks, RLS on any new table, generator only if data-driven — this stage is schema/engine only, so hand-written SQL is expected). Harness V10 additions. Staging rehearsal on fresh live dump, two-stage review, gated live push.

**Binding items (roadmap Stage 4 + engine-review hand-offs):**

### Task 1: The migration + harness

- [x] **Fingerprint UNIQUE lock:** build the unique index on the fingerprint identity (exact expression must match how `exercises_fingerprint_idx` scopes it — read Stage 1 `20260825140000`/`20260825150000` for the semantics of `identity_fingerprint`, cores, and outliers; outliers/coreless rows must not collide with each other), then DROP the plain `exercises_fingerprint_idx`. Never carry both. Define and document the semantics for: a bare (zero-attribute) derivation vs its own core — if the engine's fingerprint makes those equal, the index must either treat the core row's self-reference as distinct or the migration must document why a bare child is already impossible.
- [x] **Sibling recompute (Task 9 review I5):** when a row's identity changes, re-derive parents/tiers of siblings whose attribute sets strictly contain the changed row's (their parent may now be the changed row). Trigger-driven, engine-side, with the session-variable guard preventing infinite recursion.
- [x] **Session-variable guard (I2):** replace the `pg_trigger_depth()` guards in the engine with a `set_config`/`current_setting` session-variable guard so trigger-driven insert paths cannot silently skip recompute.
- [x] **Symmetric core-reference validation (Task 9 final review):** in `enforce_core_self_reference`, a non-self `core_movement_id` must reference an `is_core` row, read under `FOR KEY SHARE` of the target — closes the phantom-core insert gap and the demote-vs-insert race in either commit order. V5's inverse invariant stays as post-hoc detection.
- [x] **Harness V10:** unique index exists AND plain index gone (never both); duplicate generated_name within a core limited to EXACTLY the 5 declared pairs (by core id + string, both directions — copy the tight allowance from the Stage 3 self-verify); zero-attribute children flagged (M3/I4 — WARNING, not failure, unless the lock makes them impossible); BEGIN/ROLLBACK fixture proving a duplicate insert (same core + same identity attrs as an existing row) is REJECTED by the unique index; fixture proving the symmetric core-reference validation rejects a non-core target.
- [x] Self-verify DO blocks in-file; idempotent re-run proof; all three proofs on staging (currently the applied Stage 3 end state from the fresh 2026-09-08 dump).

### Task 2: Reviews, rehearsal, push, close-out

- [x] Spec review (against this plan + roadmap items) and code-quality review (live-run safety, lock profile, trigger recursion), fix loops until approved.
- [x] Fresh live dump (`scripts/movement-model/dump_live_data.sh`) + staging rebuild + final three proofs (freshness gate).
- [x] Gated live push (`supabase db push --linked`, user confirms first), harness V0–V10 against live, live exit-gate test: duplicate insert attempt in a transaction, verify rejection, roll back.
- [x] Merge to main, push. Roadmap tick, spec amendment, memory update, Movement Model artifact "after" state.
