# The saved-food twin

**Date:** 2026-08-18
**Status:** SUPERSEDED by `2026-08-19-product-identity-design.md` — never
implemented. The "twin" framing kept two copies of product identity and patched
the seam between them; the successor adds a foreign key from stock to product
and removes the seam instead.
**Scope:** creating an inventory item also creates the saved food for it, plus a
backfill for the items that never got one.

---

## 1. Why

A saved food is a product you know the numbers for; an inventory item is a
thing in your kitchen. Meals are built from the first, stock is the second, and
concept links tie them together. The seam between them leaks: a product that
enters through the inventory door — added by hand, scanned into stock, bulk
captured — never gets a saved food, so the meal builder cannot see it, the log
sheet cannot log it, and no meal can be assembled from it.

Today 23 of 39 inventory items have no saved food, including both Oats
Overnight products the owner tried and failed to add to a meal.

The delivery path already does this right: `preparedMeals` lands stock, saved
food, concepts and links in one transaction. This spec extends the same
guarantee to the two client-side creation paths that don't.

**Decision (owner, in chat):** the twin is automatic. The alternative — making
the builder search the kitchen and minting the twin on pick — keeps the catalog
smaller but changes more surfaces; rejected.

## 2. The rule

Whenever a `food_inventory` row is created, a `saved_foods` row for the same
product must exist by the time the creation flow finishes — created if missing,
adopted if already there.

**Adopt, don't duplicate.** Before creating:
1. Same `barcode` (when the item has one) → that saved food is the twin.
   `saved_foods` is unique on (user, barcode), so creating would fail anyway.
2. Else same normalized name (trim, case-insensitive) → that is the twin.
3. Else create: `name`, `brand`, `barcode`, `serving_size`, `calories`,
   `protein`, `carbs`, `fats`, `sugars`, `fiber_g` copied from what the add
   flow collected. `sodium_mg` null — inventory doesn't record it.
   `is_favorite` false.

**Link both to the same concepts, in the same call.** The add paths already
invoke `inventory-intelligence` with the new inventory id; it accepts
`savedFoodIds` in the same request. Pass the twin's id alongside, so both
halves get linked to the same concept in one round trip and the twin is
immediately resolvable against stock — a twin without links is exactly the
orphan state this removes.

**The twin outlives the stock.** Running out, discarding, or deleting the
inventory item never deletes the saved food: logs point at it and meals are
built from it. No cascade, no cleanup job.

**Nutrition duplication is acceptable by design.** Meals price themselves from
the inventory row when one resolves; the saved food's numbers are the fallback
for when nothing is in stock. Drift between the copies is already handled — it
is the substitution machinery's normal case.

## 3. Where

| Creation path | Today | Change |
| --- | --- | --- |
| `EditFoodScreen` (add by hand / from scan preview) | inventory row only, then intelligence with `inventoryIds` | find-or-create twin after the row commits; add its id to the same intelligence call |
| `BulkCaptureModal` | same shape | same change |
| `preparedMeals` delivery function | already atomic, already makes the twin | none |

One helper owns find-or-create (`ensureSavedFoodTwin` in
`savedFoodsService`), so the two call sites cannot disagree on the dedup rules.
Twin creation is **best-effort**: a failure logs and never fails the inventory
add — the item on the shelf is the primary fact, and the backfill (below) is
the safety net for any row that slips through.

## 4. Backfill

A one-time script (scratchpad, service role — same idiom as the Sweet Sorghum
repair, not a migration) over existing rows:

1. For every inventory item with no twin by barcode or normalized name: create
   the saved food per §2.
2. For every twin (new or adopted) lacking concept links: copy the inventory
   row's links — insert a `saved_food_id` link to each concept the inventory
   row is linked to. Items whose inventory row has no links go through
   `inventory-intelligence` instead.
3. Print a before/after count of orphans; expect 23 → 0.

## 5. Out of scope

- Searching `food_inventory` directly from the builder or log sheet.
- Any sync of edits between the copies after creation (substitution machinery
  already covers the meaningful case).
- Retiring or hiding never-used saved foods; the library's archiving owns that.

## 6. Risks

- **Name-based adoption can mis-pair** ("Instant Oatmeal" the product vs. a
  hand-typed "instant oatmeal" log food). Accepted: a wrong adoption still
  points at the same real-world food in practice, and barcode wins when
  present.
- **Catalog growth**: every stocked product becomes a saved food. Accepted in
  chat; archiving is the relief valve.
- The intelligence function links by name matching; a twin and its inventory
  row could conceivably land on different concepts if called separately. The
  single-call requirement in §2 exists to prevent this.
