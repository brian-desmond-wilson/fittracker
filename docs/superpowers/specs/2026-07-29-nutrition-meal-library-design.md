# Nutrition OS — Phase 2: Meal Library

**Date:** 2026-07-29
**Status:** Approved design, pending implementation plan
**Companion docs:** *FitTracker — Software Architecture Reference*, *FitTracker — Concept Map* (snapshot 2026-07-28), and the Phase 1 spec `2026-07-28-nutrition-preference-model-design.md`

## 1. Context

Phase 2 of the Nutrition OS builds the Meal Library: real Meals with categories, roles, prep time, and a computed **Brian Score**, superseding the never-used `meal_templates` feature. It also ships the concept↔product linking UI deferred from Phase 1, one-tap meal logging, an Emergency Calories surface, and a proper fix for inventory decrement.

Prod facts that shaped this design (verified 2026-07-29):

- `meal_templates`, `meal_template_items`, and `meal_logs.meal_template_id` hold **zero rows** — supersession requires no data migration and the old tables can be dropped.
- Only 5 `saved_foods` and 22 `food_inventory` rows exist; most Top 10 meal components must be seeded.
- The existing decrement bridge (`consumeOneInventoryUnit`) writes the legacy single-location `food_inventory.quantity` column, is a non-atomic read-then-write, and is bypassed entirely by template logging.

## 2. Goals

- A `meals` + `meal_items` model composing **saved foods only** (Approach A), with totals always computed from items — never stored (Concept Map hazard #1).
- Brian Score derived from Phase 1 data by a pure lib, with a per-meal taste override; Brian Approved badge.
- Six-way category organization (the discovery sub-libraries) plus an optional role for the Phase 3 recommender.
- One-tap logging reusing the meal_logs fan-out + snapshot semantics, now with inventory decrement.
- Atomic, location-aware inventory consume/refund RPCs shared by the meal path and the existing barcode path.
- Concept↔product linking screen (confirm/reject/manage), using a TS port of the backfill's head-noun matcher.
- Emergency Calories pinned surface with live remaining-calories context.
- Seed: ~20 staple saved foods (concept-linked) + the Top 10 meals, Korean Beef Bowl as gold standard.
- Drop `meal_templates` / `meal_template_items` / `meal_logs.meal_template_id` (verified-empty guard in the migration).

## 3. Non-goals (later phases)

Recommender logic and "Eat Next" (Phase 3); assemblable-now filtering and expiration nudges (Phase 4); vendor-grouped shopping demand and orderability scoring (Phase 5); price/cost data; meal photos; LLM integration.

## 4. Decisions log

| Decision | Choice | Why |
|---|---|---|
| Item target | `saved_foods` only, NOT NULL | One canonical "what is this food" entity; inventory nutrition is the weaker copy; stock is transient, meals are permanent |
| Old tables | Drop (final migration, emptiness-guarded) | Zero rows in prod; dormant leftovers are the concept map's cautionary tale |
| Organization | `category` (6 sub-libraries) + optional `role` | Browsing and job-to-fill are different vocabularies; core meals have no role |
| Brian Score | Derived by pure lib + per-meal taste override | Phase 1 already knows the inputs; a great bowl beats the average of its parts |
| Cost component | Dropped; renormalize /95 → /100 | No price data exists anywhere in the app |
| Decrement | New atomic location-aware RPCs, shared by meal + barcode paths | Existing bridge has three known flaws; one implementation everywhere |
| Stock resolution | Barcode match, else unique shared-concept match | Seeded staples have no barcodes; the concept layer is the durable join |
| Item deletion protection | `saved_food_id` FK is **RESTRICT** (old tables cascaded) | A meal silently losing an ingredient is the silent-divergence failure class |
| Linking rejections | No rejection-memory table | 27 products total; unmatched items simply remain in "Needs review" |

## 5. Data model

Both tables carry `id uuid PK`, `user_id → auth.users NOT NULL`, `created_at`; `meals` also `updated_at` (shared trigger). Per-operation RLS policies `to authenticated` with `public.` qualification, drop-guarded — the Phase 1 house style throughout.

### 5.1 `meals`

| Column | Type | Constraint / meaning |
|---|---|---|
| `name` | text NOT NULL | display name |
| `slug` | text NOT NULL | unique per user (seed idempotency, rename-safe) |
| `category` | text NOT NULL | CHECK: `breakfast \| lunch \| dinner \| snack \| shake \| emergency` — library grouping |
| `role` | text | CHECK: `pre_workout \| post_workout \| bridge \| calorie_booster \| emergency_catchup`, nullable |
| `default_meal_type` | text | CHECK: `breakfast \| lunch \| dinner \| snack \| dessert`, nullable; when null, logging slot derives from category (`shake`→`snack`, `emergency`→`snack`, others map 1:1) |
| `prep_minutes` | int NOT NULL | CHECK ≥ 0; 0 = open-and-eat |
| `taste_override` | text | CHECK: `love \| like \| neutral \| dislike \| never`, nullable; replaces computed taste when set |
| `notes` | text | |

**No nutrition columns.** Totals (7 nutrients) are computed client-side from items, exactly as `mealTemplatesService` does today.

### 5.2 `meal_items`

| Column | Type | Constraint |
|---|---|---|
| `meal_id` | uuid → meals | NOT NULL, ON DELETE CASCADE |
| `saved_food_id` | uuid → saved_foods | NOT NULL, **ON DELETE RESTRICT** |
| `servings` | numeric(5,2) | NOT NULL default 1, CHECK > 0 |
| `display_order` | int | NOT NULL default 0 |
| `small_pieces_ok` | bool | NOT NULL default false — "this product is already in EoE-compliant form"; only meaningful when the linked concept has `requires_small_pieces` |

Unique `(meal_id, saved_food_id)` — the same food twice means adjusting servings. `created_at` only. RLS via `user_id` directly (no EXISTS subquery — simpler than the old template-items policies).

RESTRICT consequence: `deleteSavedFood` on a food used by a meal fails; the alert idiom surfaces "remove it from meal X first." This is deliberate.

### 5.3 `meal_logs.meal_id`

`meal_id uuid REFERENCES public.meals(id) ON DELETE SET NULL`, partial index `WHERE meal_id IS NOT NULL`. Replaces `meal_template_id` provenance. TS `MealLog` gains `meal_id: string | null` and loses `meal_template_id`; `useHistoricalMeals` selects the new column.

### 5.4 Drop migration (final, owner-gated)

Guard first — `raise exception` if `meal_templates`, `meal_template_items`, or `meal_logs WHERE meal_template_id IS NOT NULL` contain any row — then drop the two tables, the `meal_logs.meal_template_id` column, and its partial index. Forward-only and safe precisely because the guard proves emptiness at apply time.

## 6. Brian Score — pure lib `src/lib/mealScore.ts`

Sibling of `rampProgress.ts`: no I/O, options-object API, Jest-covered.

**Inputs:** meal row (prep_minutes, role, taste_override), items each with saved-food nutrition and linked concepts (rating, `requires_small_pieces`, `prep_intensive`), the `nutrition_constraints` row (reserved for future components; not consumed in v1 scoring).

**Rating→points map:** `love 30 · like 22 · neutral 15 · dislike 8 · never 0`.

**Components (raw max 95, Cost's 5 points dropped):**

- **Taste /30** — calorie-weighted average of item concept ratings; weight = servings × calories. Items with no linked concept are excluded from the average. If no item has a concept: taste = 15 and output flags `tasteUnknown: true`. `taste_override` (mapped through the same table) replaces the computation entirely.
- **Convenience /25** — `prep_minutes` ≤2 → 25, ≤5 → 20, ≤10 → 12, >10 → 5; −3 (once, not per item) if any ingredient concept is `prep_intensive`; floor 0.
- **Protein /15** — total ≥40 g → 15, ≥30 → 12, ≥20 → 8, ≥10 → 4, else 0.
- **EoE /15** — 15 − 5 per item whose concept has `requires_small_pieces` and whose `small_pieces_ok` is false; floor 0.
- **Calories /10** — role `bridge`: 10 if total within 250–400 inclusive, else 4. Otherwise: ≥500 → 10, 400–499 → 7, 300–399 → 4, else 2.

**Score** = `Math.round(raw × 100 / 95)`. Chip bands: ≥95 green ("core"), 71–94 neutral, ≤70 dim.

**Derived flags:**

- `containsNever` — any linked concept rated `never`. Red-flagged in UI; disqualifies Approved regardless of score.
- **Brian Approved** = `prep_minutes ≤ 10` AND `protein ≥ 30` AND (`calories ≥ 500` OR `role === 'bridge'`) AND EoE component = 15 AND taste points ≥ 22 AND NOT `containsNever`. The discovery's "orderable from your vendors" criterion is deferred to Phase 5 (no product↔vendor data exists).

Policy constants live in code, documented — same stance as `rampProgress`.

## 7. Inventory decrement

### 7.1 RPCs — `security invoker`, `search_path = ''`, plpgsql (one implicit transaction)

**`consume_inventory_units(p_inventory_ids uuid[]) returns table(inventory_id uuid, consumed int)`** — per id: decrement 1 from the `food_inventory_locations` row with stock (`ORDER BY is_ready_to_consume DESC, quantity DESC LIMIT 1 FOR UPDATE`); if the item has **no** location rows, fall back to `food_inventory.quantity = greatest(0, quantity − 1)` (legacy-only items exist: 22 inventory rows, 17 location rows). After each decrement with locations, resync `food_inventory.quantity = sum(location quantities)` so legacy readers stay correct. `consumed` is 0 when no stock — never an error.

**`refund_inventory_units(p_inventory_ids uuid[]) returns table(inventory_id uuid, refunded int)`** — mirror: +1 to the ready-to-consume location first, else the first location, else the legacy column; resync total.

`revoke all from public; grant execute to authenticated` on both. Unit semantics remain the documented "1 unit = 1 discrete container per logged item, regardless of servings."

### 7.2 Shared adoption

`foodInventoryMatchService.consumeOneInventoryUnit` / `refundOneInventoryUnit` become thin wrappers over the RPCs with single-element arrays (call sites in MealsScreen unchanged). The client-side read-modify-write is deleted.

### 7.3 Stock resolution for meal items — pure fn in `lib/supabase/mealLibrary.ts`

For each meal item, resolve `saved_food → food_inventory` candidate:

1. **Barcode**: saved food has a barcode and an in-stock inventory row shares it → match.
2. **Shared concept**: the saved food's linked concept(s) also link to exactly **one** in-stock inventory product → match. Two or more candidates → ambiguous, skip. Zero → skip.

Matched items log with `uses_inventory: true` and `inventory_items: [{id, quantity: 1}]` (the existing shape); one `consume_inventory_units` call covers all matches. The resolution core is a pure function (`resolveInventoryMatches(items, inventoryRows, links)`) so it's unit-testable without I/O.

## 8. One-tap logging

From the meal detail view: **Log** → slot picker (pre-filled per §5.1 mapping) → insert one `meal_logs` row per item — nutrition scaled by servings and snapshotted, shared `logged_at`, `date = viewingDateStr` (local-date convention), `saved_food_id`, `servings`, `meal_id` — then stock resolution + consume RPC. Decrement failure alerts but never blocks or rolls back the log (the meal was eaten either way).

**Undo:** the existing undo affordance extends to meals — delete the batch (`meal_id` + shared `logged_at`), then `refund_inventory_units` with the consumed ids kept in memory, mirroring the current single-item undo.

## 9. UI

### 9.1 Meal Library modal — replaces `MealTemplatesModal`

Entry: the existing "My Meals" button on MealsScreen, relabeled **"Meal Library"**. House full-screen modal; FlatList root scroller; React.memo rows; useCallback-stabilized handlers; unconditional header with Done (the Phase 1 load-failure lessons apply verbatim: loadFailed → Retry, silent refetch on failure-path resync).

- **Emergency section pinned first** (red accent), rendered only when `category='emergency'` has meals. Header shows **"~X cal remaining today"** (profile `target_calories` − day's logged total, both already available on MealsScreen and passed in). Meals sorted calories-descending.
- **Category sections** follow: Breakfasts, Lunches, Dinners, Snacks, Shakes. Row: name · cal/protein · prep min · score chip · Approved badge · role tag · red never-flag.
- **Detail view**: items × servings, computed totals, score breakdown (one bar per component), Log / Edit / Delete.
- **Builder (create/edit)**: name, category, role, prep minutes, taste-override chips, item picker (search saved foods, servings stepper), live totals + live score. Items with `requires_small_pieces` concepts show the `small_pieces_ok` toggle inline. Adding an item whose saved food is unlinked shows a one-tap head-noun link suggestion (insert `matched_by='user'`) or skip.

Files: `src/components/track/meals/library/` — `MealLibraryModal.tsx`, `MealRow.tsx`, `MealDetail.tsx`, `MealBuilder.tsx`, `styles.ts`. Deleted: `MealTemplatesModal.tsx`, `mealTemplatesService.ts`, template types in `types/track.ts`.

### 9.2 Food Matching screen — the deferred linking UI

New row in Nutrition Preferences ("Food Matching") → full-screen modal, two groups:

- **Needs review** — saved foods + inventory items with no `food_concept_links` row. Each row: product name/brand, suggested concepts as tap-to-confirm chips (top-ranked first), search picker for manual selection. Confirm inserts `matched_by='user'`.
- **Linked** — existing links with product, concept, source (`seed`/`auto_name_match`/`user`), and unlink (hard delete).

Matcher: `src/lib/conceptMatch.ts` — TS port of the backfill's head-noun algorithm with identical rules: exact normalized equality; plural-modulo equality (strip trailing `s`); head-noun suffix (`' ' + concept`, concept ≥5 chars); rank exact > plural > suffix, then concept-name length descending; no LIKE/wildcards. Ported test cases include: "Kerrygold Butter"→Butter matches, "Butter Lettuce"→Butter does not, "2% Milk" wildcard hazard, plural handling, and the accepted Nutter-Butter-class false positive (documented, filtered by human confirm here).

File: `src/components/profile/nutrition/FoodMatchingScreen.tsx` (+ row component), wired like the existing Nutrition Preferences modal.

## 10. Seeding

One migration, Phase 1 pattern: `do $$` block, `v_user_id` from `auth.users` with `raise exception` guard, closing `raise notice` with row counts. Idempotency mechanisms differ by table: meals and concept links use `on conflict … do nothing` on their unique keys; staple saved foods have no slug column, so each insert is guarded by a `not exists` check on `(user_id, name)` — re-running never duplicates and never overwrites user edits.

### 10.1 Staple saved foods (~20) — created only if no same-name row exists; `notes = 'Nutrition OS staple (seeded)'`

| Name (serving) | cal | P | C | F | sugars | Na mg | fiber | Concept link (slug) |
|---|---|---|---|---|---|---|---|---|
| Ground Beef, cooked 85/15 (4 oz) | 290 | 26 | 0 | 20 | 0 | 90 | 0 | `ground-beef` |
| Microwave Sticky White Rice (1 cup) | 310 | 6 | 68 | 1 | 0 | 10 | 1 | `microwave-rice` |
| Grilled Chicken Breast, diced (4 oz) | 180 | 34 | 0 | 4 | 0 | 380 | 0 | `chicken-breast` |
| Teriyaki Sauce (2 tbsp) | 60 | 2 | 12 | 0 | 10 | 900 | 0 | — |
| Korean BBQ Sauce (2 tbsp) | 60 | 1 | 13 | 0.5 | 11 | 520 | 0 | — |
| Greek Yogurt, whole milk plain (1 cup) | 220 | 20 | 9 | 11 | 9 | 80 | 0 | `greek-yogurt` |
| Protein Granola (1/2 cup) | 220 | 10 | 26 | 8 | 7 | 45 | 3 | `granola` |
| Instant Oatmeal, prepared (1 packet) | 160 | 4 | 33 | 2.5 | 12 | 260 | 3 | `oatmeal` |
| Peanut Butter (2 tbsp) | 190 | 8 | 7 | 16 | 3 | 140 | 2 | `peanut-butter` |
| Grape Jelly (1 tbsp) | 50 | 0 | 13 | 0 | 12 | 5 | 0 | — |
| White Bread (2 slices) | 150 | 5 | 28 | 2 | 3 | 230 | 1 | `bread` |
| Banana (1 medium) | 105 | 1.3 | 27 | 0.4 | 14 | 1 | 3 | `bananas` |
| Blueberries (1 cup) | 85 | 1 | 21 | 0.5 | 15 | 1 | 3.6 | `blueberries` |
| Whole Milk (1 cup) | 150 | 8 | 12 | 8 | 12 | 105 | 0 | `whole-milk` |
| Boost Very High Calorie (1 bottle) | 530 | 22 | 85 | 12 | 26 | 200 | 0 | `boost-high-protein` |
| Cashews (1 oz) | 160 | 5 | 9 | 13 | 2 | 95 | 1 | `cashews` |
| Shredded Cheddar (1/4 cup) | 110 | 7 | 1 | 9 | 0 | 180 | 0 | `cheese` |
| Salsa (2 tbsp) | 10 | 0 | 2 | 0 | 1 | 220 | 0 | — |
| Tortilla Chips (1 oz) | 140 | 2 | 19 | 7 | 0 | 115 | 1 | — |
| Whey Protein Powder (1 scoop) | 120 | 24 | 3 | 1.5 | 2 | 130 | 0 | `protein-shakes` |

Concept links use `matched_by='seed'`. Unlinked staples (sauces, jelly, salsa, chips) are deliberate: no matching Phase 1 concept exists, and their calorie weight keeps taste math honest without them.

### 10.2 The Top 10 meals

| Meal (slug) | Category | Role | Prep | Items × servings | ~cal / P |
|---|---|---|---|---|---|
| Protein Oatmeal Bowl | breakfast | — | 3 | oatmeal ×1, whey ×1, peanut butter ×1, banana ×1 | 575 / 37 |
| Greek Yogurt Bowl | breakfast | — | 2 | greek yogurt ×1, granola ×1, blueberries ×1 | 525 / 31 |
| **Korean Beef Bowl** | dinner | — | 5 | ground beef ×1.5, rice ×1, Korean BBQ sauce ×1 | 805 / 46 |
| Teriyaki Chicken Bowl | lunch | — | 5 | chicken (diced, `small_pieces_ok=true`) ×1.5, rice ×1, teriyaki ×1 | 640 / 59 |
| Cheeseburger Bowl | dinner | — | 5 | ground beef ×1.5, rice ×1, cheddar ×1 — **no pickles** | 855 / 52 |
| Taco Bowl | dinner | — | 5 | ground beef ×1.25, rice ×1, cheddar ×1, salsa ×1, tortilla chips ×1 | 930 / 48 |
| PB&J | lunch | — | 3 | bread ×1, peanut butter ×2, jelly ×1 | 580 / 21 |
| Banana + PB | snack | bridge | 2 | banana ×1, peanut butter ×1 | 295 / 9 |
| Boost + Cashews | **emergency** | emergency_catchup | 0 | Boost VHC ×1, cashews ×1 | 690 / 27 |
| Brian Bulk Shake | shake | calorie_booster | 4 | whole milk ×1, banana ×1, peanut butter ×2, whey ×1 | 755 / 49 |

**Korean Beef Bowl seeds `taste_override='love'` — the gold standard.** Some seeds honestly fail Brian Approved (PB&J and Banana+PB miss 30 g protein; Boost+Cashews misses by 3 g) — the badge reports reality, it doesn't flatter the seed data.

## 11. Migrations (2026-07-29, drop-guarded, owner-gated apply)

1. `20260729100000_meal_library_schema.sql` — `meals`, `meal_items`, `meal_logs.meal_id`, indexes, RLS, `updated_at` trigger.
2. `20260729100100_inventory_consume_rpc.sql` — `consume_inventory_units`, `refund_inventory_units`.
3. `20260729100200_meal_library_seed.sql` — staples + links + Top 10.
4. `20260729100300_drop_meal_templates.sql` — emptiness guard, then drop tables/column/index.

## 12. Types, testing, verification

- `src/types/meal-library.ts` — `MealCategory`, `MealRole`, `Meal`, `MealItem` unions/rows mirroring every CHECK; `types/track.ts` updated (`MealLog.meal_id`, template types removed).
- Jest: `mealScore.test.ts` (each component's thresholds, weighting, override, `tasteUnknown`, `containsNever`, Approved edges, renormalization), `conceptMatch.test.ts` (ported backfill cases), `resolveInventoryMatches` tests (barcode hit, unique-concept hit, ambiguous skip, no-stock skip). CI typecheck stays at 0.
- Data access: `src/lib/supabase/mealLibrary.ts` (fetch library with items+links, create/update/delete meal, logMeal, resolution, linking queries for Food Matching).
- No native changes — verification on the existing dev client via Metro reload (unique port per the simulator-isolation convention).
