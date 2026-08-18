# Daily Session Recommender — whole-workout composition from the catalog

**Date:** 2026-08-18
**Status:** Approved design, pre-implementation
**Owner:** Brian Wilson

## 1. Problem & context

The 2026-08-16 Daily Training spec envisioned the recommender assembling a
session exercise-by-exercise on a Push/Pull/Legs split. That is now **deferred
to a future phase**. The catalog has grown into a library of whole workouts
captured from social media (11 today: strength, full-body, CrossFit-style,
mobility, etc.), and the near-term win is a recommender that composes today's
session from **whole catalog workouts**, not individual exercises.

**Vision for this phase:** each day the recommender selects one catalog
workout per session block — warm-up, mobility, main workout, optional
conditioning/accessory, cool-down — sized to the minutes Brian has available,
steered by soreness, energy, and what he trained recently.

## 2. Decisions made (with rationale)

| Decision | Choice |
|---|---|
| Unit of selection | Whole catalog workouts, one per block. Exercise-level generation deferred |
| Session shape | Five blocks: warm-up (raise) → mobility/dynamic (activate) → main workout → conditioning/accessory (optional) → cool-down. RAMP-informed |
| Split | **No fixed Push/Pull/Legs sequence.** Rolling 7-day muscle-coverage tracker steers the main pick toward neglected groups (option C over loose-split A and pure-avoidance B) |
| Missing block coverage | Built-in fallback library fills any block the catalog can't, marked as built-in, with a gap nudge to capture a replacement (B + gap flag from A) |
| Engine architecture | Rules shortlist per block → one AI judgment call picks across blocks (option B; matches Nutrition OS doctrine and the existing compose-session call) |
| Classification | AI tags each capture at entry: block roles, muscles + emphasis, duration, intensity, skill. Editable. One-time backfill of the existing 11 |
| Inputs | Existing daily check-in unchanged: energy 1–10, minutes available, per-muscle soreness 1–3 |
| Recovery days | Widespread severe soreness → mobility + cool-down only session, deliberately |
| Variety | Usage ledger (workout, date, muscles hit) drives recency exclusion and coverage scoring |
| Reroll granularity | Per block — swap one block from its shortlist without regenerating the session |

## 3. Data model

### 3.1 Workout tags (assigned at capture)

Each captured workout gains AI-assigned, user-editable metadata:

- **Block roles** — the subset of {warmup, mobility, main, conditioning,
  cooldown} this workout can serve. Multi-role is expected (a stretching
  routine may serve mobility and cooldown).
- **Muscle groups** — with a primary/secondary emphasis flag, reusing the
  existing muscle-region vocabulary the check-in's soreness map uses.
- **Estimated duration** — minutes, from the caption's stated length or
  inferred from movements × rounds.
- **Intensity** — low / moderate / high.
- **Skill level** — Beginner / Intermediate / Advanced (nullable).

Classification runs inside the existing capture pipeline (capture-post edge
function) as an extension of the extraction it already does. Tags are editable
on the captured-workout edit screen. A one-time backfill classifies the
existing 11 catalog workouts.

### 3.2 Usage ledger

One table recording each performed catalog workout: workout id, date
performed, block it served, muscles hit (denormalized from tags at time of
performance). Written when a session containing the workout is completed, and
by the existing adopt-a-catalog-workout path.

Powers: rolling 7-day coverage, "muscles hit yesterday," recency exclusion,
and (future) the exercise-level engine.

### 3.3 Built-in fallback library

A small shipped set of generic routines: {warmup, mobility, cooldown} ×
{upper, lower, full-body}, each with a fixed duration and movement list.
Static app data, not database rows. Marked `builtin` so the UI can badge them
and the gap nudge can fire.

Conditioning has no built-in: it is the optional block, so a missing
conditioning candidate simply drops the block.

## 4. Rules tier (deterministic, client-side, unit-tested)

Pure TS modules, same doctrine as the existing engine. In order:

1. **Coverage** — from the ledger, compute per-muscle training load over the
   last 7 days, weighted toward recent days. Identify yesterday's muscles and
   neglected groups.
2. **Recovery-day gate** — if soreness is widespread and severe (threshold:
   ≥3 regions at severity ≥2, or any region at 3 alongside low energy ≤3),
   the session is mobility + cool-down only, sized to the time budget. Skip
   steps 3–5 for the main/conditioning blocks.
3. **Main shortlist** — candidates must: carry the `main` role, fit the main
   block's time envelope (±25% before round-trimming), not be dominated by
   muscles at soreness ≥2, not have been performed in the last 4 days, and
   not exceed the user's skill level. Score by neglected-coverage overlap,
   then recency (older = better), then duration fit. Keep top 5.
4. **Support shortlists** — for warmup, mobility, cooldown: candidates must
   carry the role, fit the block envelope, and share body focus with at least
   one main candidate (upper/lower/full derived from muscle tags). Keep top
   3 per block, then append the matching built-in as the final candidate.
   Conditioning: same, but only when the time budget clears 75 minutes; no
   built-in appended.
5. **Time envelope** — main gets the remainder after support blocks; warmup,
   mobility, cooldown get 5–10 minutes each (scaled down proportionally when
   the budget is under 45 minutes); conditioning gets 10–20 when present.
   Each candidate carries a computed round-trim/extension hint ("do 3 of 4
   rounds ≈ 18 min") so composition can land on the budget.

## 5. AI tier — one judgment call

Extends the existing compose-session edge call. Input: check-in, coverage
summary, yesterday's session, and the per-block shortlists with tags and
trim hints. Output (constrained):

- One workout id per block, **only from that block's shortlist** (conditioning
  omittable).
- Optional round adjustment per pick, from the precomputed hints.
- One-line rationale per block.
- Gap flags when a built-in was chosen ("no upper-body mobility captures").

The client re-validates: ids in shortlist, durations sum within ±10% of the
budget. Any violation, timeout, or API failure → the rules tier's top-scored
candidate per block stands as the session. **You always get a session.**

## 6. Today tab UX

- The session card shows all five blocks with per-block minutes, total
  minutes, the per-block rationale, and built-in badges where applicable.
- Each block row has a reroll affordance that swaps in the next shortlist
  candidate for that block only; totals re-flow.
- Gap nudges render under the affected block ("capture a lower-body mobility
  routine to replace this built-in").
- Starting the session writes ledger rows on completion. The existing
  adopt-a-catalog-workout flow is unchanged and also writes the ledger.
- Recovery days present as such ("Recovery day — you're beat up. Mobility and
  stretching only."), not as a thin normal session.

## 7. Sections migration

The stored-session shape currently knows warmup | main | accessory | bfr |
cooldown. Add `mobility`; treat `conditioning` as the existing `accessory`
slot (no rename of stored data); `bfr` remains for the deferred Phase 3.
Old stored sessions are never rewritten.

## 8. Error handling & edge cases

- **Empty/thin catalog** — day one with zero suitable captures yields an
  all-built-in session for support blocks; with no main candidate, the
  recommender says so and offers the least-recently-done main workout with
  the exclusion rules relaxed (recency first, then soreness dominance —
  never skill level), labeled as a compromise.
- **Short budgets** (~30 min) — support blocks compress to ~3–5 minutes each;
  conditioning never appears.
- **Classification failure at capture** — the workout enters the catalog
  untagged and is excluded from recommendation until tagged (edit screen
  prompt), matching the existing capture-review flow.
- **AI failure** — pure-rules session, per §5.

## 9. Testing

- Pure-module unit tests: coverage math, recovery-day gate, shortlist
  filters/scoring, time envelope, round-trim hints, response validation.
- Fixture tests for the AI contract: golden shortlists in, schema-valid
  composition out; malformed responses exercise the fallback.
- Classification prompt gets fixture captions with expected tag outputs.
- On-device verification of the Today card, reroll, and ledger writes before
  merge (per the standing rule that green typecheck proves nothing about
  schema correctness).

## 10. Explicitly deferred

- Exercise-level session generation (the original PPL vision) — future phase,
  will reuse the tags and ledger built here.
- Share extension, progression promotion, BFR programming (unchanged from the
  2026-08-16 spec's Phase 3).
- Learning from skip/complete behavior to adjust future picks.
