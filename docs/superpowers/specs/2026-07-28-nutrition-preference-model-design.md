# Nutrition OS — Phase 1: Preference & Constraint Model

**Date:** 2026-07-28
**Status:** Approved design, pending implementation plan
**Companion docs:** *FitTracker — Software Architecture Reference* and *FitTracker — Concept Map* (snapshot 2026-07-28, `main` @ `f7f77b6`)

## 1. Context

The Nutrition OS initiative builds a closed loop: Food Inventory → Ingredient Library → Meal Library → Nutrition Recommendations → Shopping List → vendors. It is decomposed into five sub-projects, each with its own spec → plan → implementation cycle:

1. **Preference & Constraint Model** ← this spec
2. Meal Library (supersedes `meal_templates`)
3. Recommender + "Eat Next" surface
4. Inventory loop closure (auto-decrement, assemblable-now)
5. Shopping intelligence (vendor-grouped demand)

Phase 1 is the knowledge base every later phase queries: what the owner likes, what is off-limits, the EoE (eosinophilic esophagitis) texture/form constraints, how he eats (bowls, no hands, ≤5-minute prep, small frequent meals), where food comes from, and the lean-bulk calorie progression. Source data comes from the July 2026 discovery conversation (food ratings for ~60 concepts, hard exclusions, constraints, vendors, calorie ramp).

**Design intelligence is deterministic first.** All data is structured and queryable so the Phase 3 recommender is a filter, not a parser. An LLM prompt-context export is a trivial serialization later.

## 2. Goals

- Persist food preferences at the **concept** level (e.g., "Ground Beef — love"), not per branded product.
- Record per-concept EoE form qualifiers and prep-effort flags.
- Record global eating constraints as structured fields.
- Establish the vendor vocabulary (Amazon Fresh, Costco via Instacart, Gus's, Thistle) for later phases.
- Model the lean-bulk calorie ramp with **suggest-confirm** advancement driven by `weight_logs` trend; `profiles.target_*` remains the canonical daily budget.
- Ship one Profile-menu screen to view and edit all of the above.
- Seed everything from the discovery data via migrations.

## 3. Non-goals (later phases)

Recommender logic; Meal/Recipe entities; Home dashboard cards; shopping list behavior; notification families; concept↔product linking UI; LLM integration.

## 4. Architectural constraints honored

- No third nutrition-bearing product entity — concepts link to the existing `saved_foods` and `food_inventory` (Concept Map hazard #1).
- Constraints live in a namespaced singleton table: the shared kernel's "one deliberate decision" alternative to further `profiles` columns (Concept Map §2 rule).
- `profiles` nutrition targets stay canonical; the ramp writes onto them only on user-confirmed level change.
- House conventions throughout: user-scoped tables + RLS `user_id = auth.uid()`, hard deletes, text CHECK enums mirrored by TS unions, `created_at`/`updated_at`, local-date strings, alert-on-failure writes, full-screen modal pattern, `colors.ts` palette.
- Migrations are forward-only, idempotent, additive; prod is authoritative and holds real personal data (no staging).

## 5. Data model

Five new tables. All carry `id uuid PK`, `user_id → auth.users`, `created_at`, `updated_at` (except links: `created_at` only), RLS owner policy.

### 5.1 `food_concepts`

The preference vocabulary (~60 seeded rows).

| Column | Type | Constraint / meaning |
|---|---|---|
| `name` | text NOT NULL | display name, e.g. "Ground Beef" |
| `slug` | text NOT NULL | unique per user |
| `rating` | text NOT NULL | CHECK: `love \| like \| neutral \| dislike \| never` |
| `requires_small_pieces` | bool default false | EoE dicing/slicing requirement (chicken breast, rotisserie chicken, steak) |
| `prep_intensive` | bool default false | enjoyed but slow to prepare solo (salmon, bacon, sausage, eggs) — later phases prefer pre-cooked forms |
| `form_note` | text | free text, e.g. "must be diced; no bones; not eaten by hand" |
| `notes` | text | |

Rating and qualifiers are columns on the concept row (single-user system; exactly one rating per concept).

### 5.2 `food_concept_links`

Junction from concepts to the two existing product entities.

| Column | Type | Constraint |
|---|---|---|
| `concept_id` | uuid → food_concepts | NOT NULL |
| `saved_food_id` | uuid → saved_foods | nullable |
| `food_inventory_id` | uuid → food_inventory | nullable |
| `matched_by` | text NOT NULL | CHECK: `seed \| auto_name_match \| user` |

CHECK: exactly one of `saved_food_id` / `food_inventory_id` is non-null. Unique on (`concept_id`, `saved_food_id`) and (`concept_id`, `food_inventory_id`). FKs are `ON DELETE CASCADE` from all three parents — deleting a concept (or a product) silently removes its links.

### 5.3 `nutrition_vendors`

| Column | Type | Notes |
|---|---|---|
| `name` / `slug` | text NOT NULL | slug unique per user |
| `app_url` | text | deep link (e.g. Instacart), nullable |
| `display_order` | int | |
| `is_active` | bool default true | |
| `notes` | text | |

Seeded: Amazon Fresh, Costco (Instacart), Gus's Community Market, Thistle. Vocabulary only this phase; the shopping phase adds FKs into it.

### 5.4 `nutrition_constraints` (singleton)

Unique on `user_id`; exactly one row.

| Column | Type | Seed value |
|---|---|---|
| `has_eoe` | bool | true |
| `avoids_eating_with_hands` | bool | true |
| `prefers_bowls` | bool | true |
| `spice_tolerance` | text CHECK `none \| mild \| medium \| hot` | `medium` |
| `max_prep_minutes` | int | 5 |
| `prefers_small_frequent_meals` | bool | true |
| `max_leftover_hours` | int | 24 |
| `notes` | text | germaphobe; prefers fresh over reheated; sandwiches wrapped in foil |

### 5.5 `calorie_ramp_levels`

| Column | Type | Notes |
|---|---|---|
| `level` | int NOT NULL | unique per user |
| `name` | text NOT NULL | |
| `target_calories` | int NOT NULL | |
| `target_protein_g` | int NOT NULL | |
| `target_carbs_g` / `target_fats_g` | int | nullable |
| `is_active` | bool default false | exactly one active (partial unique index on `user_id` where `is_active`) |
| `started_at` | date | local-date; set when level becomes active |

Seeded levels: 1 Foundation 2300 kcal / 160 g P; 2 Momentum 2500 / 165; 3 Growth 2700 / 170; 4 Peak 2900 / 175. Level 1 is seeded active with `started_at = null`; **seeding does NOT write `profiles` targets** — the first write happens on the first user-confirmed level change in-app.

**Level-change semantics:** confirm → set old level `is_active=false` → set new level `is_active=true`, `started_at=today` → write `target_calories`/`target_protein_g` (and carbs/fats when present) onto `profiles`.

> **AMENDED during implementation.** Doing this as separate client writes meant a failure after the level swap left the active level and the owner's real daily targets **silently disagreeing** — the worst failure mode in this feature. It is now a single atomic Postgres function, `set_active_ramp_level(p_level_id uuid, p_today date)` (`security invoker`, `search_path = ''`), added by `supabase/migrations/20260728100300_set_active_ramp_level_rpc.sql`. A plpgsql body runs in one implicit transaction, so all three writes commit or none do; it also asserts a `profiles` row exists rather than succeeding vacuously. The client function is `changeRampLevel(targetLevelId, todayLocalDate)`.

## 6. Ramp progression math

New pure lib `src/lib/rampProgress.ts` (sibling of `mealPace.ts`; no I/O):

- **Input:** recent `weight_logs` rows, active level `started_at`, today's local date.
- **Computation:** group logs by ISO week; weekly average weight; week-over-week gain rate.
- **Output:** `{ recommendation: 'advance' | 'hold' | 'insufficient_data', reason: string, weeklyGainLbs: number | null }`.
- **Policy constants (in code, documented — deliberately not schema):** `TARGET_WEEKLY_GAIN_MIN_LBS = 0.5`, `TARGET_WEEKLY_GAIN_MAX_LBS = 0.75`, `PLATEAU_GAIN_THRESHOLD_LBS = 0.25`, `PLATEAU_WEEKS_TO_ADVANCE = 2`, minimum 1 week at current level (a null `started_at` — the seeded state — waives this gate), minimum 3 weigh-ins per counted week.
- **Rules:** plateau (2 consecutive weeks < 0.25 lb/wk) → `advance`; gaining within 0.5–0.75 → `hold`; not enough data → `insufficient_data`.

The suggestion surfaces only inside the Preferences screen this phase. Promotion to a Home card is Phase 3's concern.

## 7. UI

One new Profile-menu entry → **Nutrition Preferences** full-screen slide-up modal (`presentationStyle="fullScreen"`, `useSafeAreaInsets()`, dark palette via `colors.ts`). Sections top-to-bottom:

1. **Lean Bulk Ramp card** — active level chip (level, name, calories, protein); weekly-trend line from `rampProgress`; suggestion banner when `advance` (confirm dialog before any write); manual "Change level" affordance (no criteria required).
2. **Eating Constraints** — toggles/pickers bound 1:1 to the singleton row.
3. **Food Ratings** — FlatList grouped by rating, ordered Never → Dislike → Neutral → Like → Love (blockers first); 300 ms debounced search; tap-to-expand inline editor (rating segmented control, two qualifier toggles, form note); header "+ Add" (name + rating); swipe-to-delete.
4. **Vendors** — list with name / active / deep-link editing.

Every write uses the named-alert-on-failure idiom. No linking UI this phase.

## 8. Seeding & backfill

Three migrations, in order, resolving the single user via `select id from auth.users limit 1`:

1. **Schema** — the five tables, CHECKs, partial unique index, RLS policies.
2. **Seed data** — all discovery concepts with ratings and qualifiers, including: never = tofu, radish, hot dogs, mushrooms, mayonnaise, pickles; dislike = egg whites, cottage cheese, string cheese, beef jerky, coffee; `requires_small_pieces` = chicken breast, rotisserie chicken, steak; `prep_intensive` = salmon, bacon, sausage, eggs; plus the full love/like/neutral lists across protein, carbs, fats, fruits, drinks, and convenience foods. Also: constraints row, 4 vendors, 4 ramp levels (Level 1 active, no `profiles` write).
3. **Link backfill** — conservative name-matching of existing `saved_foods` and `food_inventory` rows to concepts (`matched_by='auto_name_match'`); exact/normalized-substring matches only; ambiguous rows left unlinked. Idempotent (upsert on the unique keys) and additive-only.

## 9. Types, testing, verification

- `src/types/nutrition-preferences.ts` — TS unions mirroring every CHECK constraint (the practical enum contract); CI typecheck gate stays at 0.
- **Jest unit tests for `rampProgress.ts`** — weekly averaging, gain-rate edges, plateau detection, insufficient-data, sparse weigh-ins. If Jest is not yet wired, minimal wiring is in scope (aligns with audit item R2, which designates pure math libs as first test targets).
- Data access: a `src/lib/supabase/nutritionPreferences.ts` query module (house pattern for larger domains).
- Runtime verification on a dedicated simulator instance with a unique Metro port; note the dev client requires a rebuild (expo-image change) before on-device verification.

## 10. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Rating attachment | New concept layer | Ratings are concept-level in reality; one rating covers all products; dislikes can block never-logged foods |
| Schema style | Fully relational (Approach A) | Downstream recommender filters structured fields; typed contract; house patterns; LLM export is a trivial serialization later |
| Qualifiers | Columns on `food_concepts` | Queryable; the qualifier set is small and stable |
| Constraints home | Namespaced singleton table | Kernel rule's sanctioned alternative to more `profiles` columns; not scalar targets |
| Ramp vs `profiles` | Ramp writes onto canonical `profiles` targets on confirmed change | Preserves single source of truth for "today's budget" |
| Advancement | Suggest-confirm | Smart but never silently changes the budget |
| Thresholds | Code constants | Policy, not data; unlikely to vary per level |
| UI scope | One view/edit screen | Data is write-once-ish; full management suite deferred |
