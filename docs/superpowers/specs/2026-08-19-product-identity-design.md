# Product identity: one record, referenced — never copied

**Date:** 2026-08-19
**Status:** implemented 2026-08-19. Backfill ran clean: 17 identity / 7 branded
/ 15 walk-through, 0 unstamped rows after, assemblability unchanged for every
meal. One mid-run crash (concept slug NOT NULL) cost Red Bull Blue its concept
link; the verify pass caught and repaired it.
**Supersedes:** `2026-08-18-inventory-saved-food-twin-design.md` (the "twin"
framing patched the seam; this names it and closes it)
**Scope:** a foreign key from stock to product, the backfill that makes every
existing row conform, find-or-create-product in every add flow, and UI-language
renames. Table renames are explicitly out.

---

## 1. The model (owner's, confirmed in chat)

- **Product** — a class: name, brand, flavor, barcode, nutrition per serving.
  One row, referenced by everything else. A barcode identifies a SKU, so
  "product" here means SKU: the two Propel bottles with different barcodes are
  two products. Attributes are immutable-ish — label corrections and
  reformulations are edits, not new identities.
- **Stock** — instances of a product in the kitchen: quantity, location,
  expiration. An instance must say which product it is an instance of.
- **Ingredient type** — "Peanut Butter", not Jif. Carries taste ratings, never
  nutrition.
- **Recipe** — ingredients, where each ingredient is a *default product* plus
  its type links. The default product is what gives a recipe numbers when
  nothing is in stock; the type is what lets any Peanut-Butter-type product in
  stock satisfy it. (Refinement over the pure-types model: a type has no
  calories.)
- **Meal build** — a log: what was actually eaten, which packages it consumed.
- **Packaged meal** — a product that is also a one-ingredient recipe of itself.

## 2. Mapping to schema (tables keep their names)

| Model word (UI language) | Table |
| --- | --- |
| Product | `saved_foods` |
| Stock / instance | `food_inventory` + `food_inventory_locations` |
| Ingredient type | `food_concepts` (+ `food_concept_links`) |
| Recipe | `meals` + `meal_items` |
| Meal build | `meal_logs` |

**The flaw being fixed:** `food_inventory` carries its own copy of product
identity (name, brand, barcode, nutrition) and no reference to `saved_foods`.
The two halves are paired indirectly — matching barcodes, or both linking to
the same concept — which is how 15 stocked products ended up unreachable from
the meal builder, and how "Oats Overnight" could only be found by typing
"oatmeal".

## 3. Schema change

```sql
ALTER TABLE public.food_inventory
  ADD COLUMN saved_food_id uuid REFERENCES public.saved_foods(id) ON DELETE SET NULL;
```

- Named `saved_food_id`, matching `meal_items` and `meal_logs` — the model word
  "product" lives in UI language only.
- `ON DELETE SET NULL`: deleting a product must never delete stock; an orphaned
  instance is repairable, a vanished shelf is not.
- The FK means **identity** — "this stock is a package of that product." It is
  not substitution; substitution stays with concept links.
- Inventory's own nutrition columns stay, as the per-package copy the dynamic
  pricing already reads. Collapsing them onto the product row is a possible
  later cleanup, out of scope here.

## 4. Resolution order

`resolveInventoryMatches` (and `findInventoryMatchForFood`, which wraps it)
gains a first tier:

1. **Identity:** an in-stock inventory row with `saved_food_id` = this
   ingredient's product.
2. **Barcode** (unchanged) — belt for rows the backfill couldn't stamp.
3. **Concept** (unchanged) — substitution: any in-stock product of the same
   type, freshest first, with the "made with Jif this week · +40 cal" line.

## 5. Add flows: find-or-create product, then the instance

Every path that creates a `food_inventory` row starts from the product:

| Path | Change |
| --- | --- |
| `EditFoodScreen` (manual add, scan add) | find product by barcode, else by exact name+brand; create it from the collected fields if absent. Insert the inventory row with `saved_food_id`. Pass **both** ids to the one `inventory-intelligence` call so both halves link to the same concepts. |
| `BulkCaptureModal` | same, via the same shared helper (`findOrCreateProduct` in `savedFoodsService`). |
| `preparedMeals` delivery function | already creates product + links atomically; add `saved_food_id` to the inventory insert inside the function. |

Product creation is best-effort relative to the add: a failure logs, the
inventory row still lands (FK null), and the backfill idiom recovers it.

## 6. Backfill (scratchpad script, service role — the repair idiom, not a migration)

**Identity rule:** stamp the FK only where identity is certain — barcode
equality, or exact name+brand equality (the Thistle dishes). Everything else
gets its **own product record** created from the inventory row's fields, with
the FK pointed at it. Concept-only pairings are substitution, not identity:
"Oats Overnight Carrot Cake" is not an instance of "Instant Oatmeal, prepared",
so it gets its own product and keeps its Oatmeal concept link.

Three groups over today's 39 rows:

1. **FK by identity (~17):** barcode matches (Arrowhead, Boost, Huel Black) and
   the name-identical Thistle dishes.
2. **Own product created, FK stamped, existing concept links copied to the new
   product (~7):** Oats Over Night, Oats Overnight Carrot Cake, Instant Oatmeal
   (Quaker), Mixed Berry Vanilla Protein Shake (Chobani), Cooked Sticky White
   Rice (bibigo), Organic Milk (Organic Valley), Bananas (Organic). Their
   generic saved foods ("Instant Oatmeal, prepared", "Whole Milk", "Banana"…)
   remain as products in their own right — recipes point at them, and
   substitution still reaches the branded stock through the shared concept.
3. **The confirmed 15:** own product created, FK stamped, concepts per the
   walk-through — Oikos PRO → Greek Yogurt; Beef Sirloin → Steak; Ravioli →
   Pasta; Chobani Strawberries & Cream and Huel Strawberry → Protein Shakes;
   **new concept Energy Drinks** (Red Bull Blue + the existing Red Bull Yellow
   product); **new concept Egg Bites** (Factor Bacon & Cheddar + the existing
   Factor Chicken Chorizo product); the other eight deliberately unlinked —
   one-off packaged items with no substitutable family, repairable later from
   the meal page.

Script prints before/after: rows without FK, expected 39 → 0.

## 7. UI language

Screens and copy say **Product**, **Ingredient**, **Recipe** where they
currently mix "saved food", "food", "concept". Applied opportunistically as
screens are touched — not a sweep — except the two places users hit the seam:
the builder's "Create X as a new food" (→ "new product") and the link-repair
copy ("not linked to a rated food concept" → "no ingredient type yet").

## 8. Out of scope

- Renaming tables or columns.
- Dropping inventory's nutrition columns.
- Pure type-based recipe ingredients (rejected: types carry no nutrition).
- Retiring never-used products; the library's archiving owns that.

## 9. Risks

- The FK tier changes resolution for existing meals only where identity was
  already certain, so no meal should change availability on day one; the
  backfill script asserts that by diffing each meal's assemblability before
  and after.
- Two adds of the same barcode-less product under slightly different names
  still mint two products. Accepted: exact-match is the only safe automatic
  rule, and the repair chip exists.
