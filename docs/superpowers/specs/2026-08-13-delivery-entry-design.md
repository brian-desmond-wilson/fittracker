# New Delivery: recents, recognition, and one row per dish

**Date:** 2026-08-13
**Status:** Approved, not yet implemented
**Branch:** meal-library (or a fresh branch off it)

## The problem

The New Delivery screen was built to make a box of eight prepared meals
enterable in one pass. It succeeded at that, but it treats every delivery as
if it were the first one. The vendor tiles sit in whatever order the
preferences screen happened to give them. The dishes — which repeat, because
a subscription rotates a fixed menu — must be typed from scratch every time.
The whole box can be photographed, but a single lid cannot. And each save
mints a brand-new inventory row for a dish, so a menu that comes around every
three weeks accumulates a graveyard of empty rows for the same smoothie.

Five changes, in the order they appear on the screen.

## 1. Vendor tiles ordered by how much you actually use them

Tiles sort by the number of distinct deliveries received from that vendor,
descending, with the most recent delivery breaking ties. Vendors never
ordered from trail the ranked ones, keeping their existing `display_order`
among themselves.

The counts come from the view described under "Data" below. The single-vendor
preselect already in the screen stays as it is.

## 2. Recent dishes from the selected vendor

Selecting a vendor reveals a list of dishes previously delivered by that
vendor, most recently delivered first. Each row shows the dish name, its slot,
and its last known calories, with a stepper on the right.

Tapping **+** on a recent dish adds a meal row to the list below, prefilled
with that dish's name, slot, and last known macros — an ordinary, fully
editable row, indistinguishable from one typed by hand. Tapping **+** again
increments that row's quantity. **−** decrements, and removing the last one
removes the row. The stepper's displayed number always mirrors the quantity
of its corresponding row, including when that quantity is edited directly in
the row's Qty field.

Correspondence between a stepper and a row is by folded dish name (the same
`slugify` fold the save function uses), so a row typed by hand that happens to
match a recent dish adopts that stepper rather than producing a second one.

This deliberately does not introduce a second kind of meal in the payload.
Steppers are a fast way to create rows; validation and the save path are
untouched.

## 3. Photograph one lid, not just the whole box

The whole-box scan keeps its current behavior, including the
replace-with-confirmation prompt when rows are already filled.

Each meal row additionally gets a small camera control. It photographs a
single lid and fills **only that row** — name, slot, and the three numbers —
leaving every other row alone. No confirmation prompt: the blast radius is one
row the owner is looking at.

This calls the existing `delivery-menu` edge function with a flag requesting
single-dish mode, where the prompt asks for the one dish whose panel fills the
frame and the response is capped at one meal. Sharing the function keeps the
transcription doctrine — printed figures only, nulls where illegible, never
inferred — in one place.

The function's slot vocabulary gains `dessert` (see below).

## 4. Dessert becomes a delivery slot

`DELIVERY_SLOTS` gains `dessert`, making the segmented control five wide:
Breakfast, Lunch, Dinner, Snack, Dessert. `MealType` already includes it, the
save function already accepts it, and the label map already has it — the
constant was the only thing excluding it, on a since-retired assumption that
nobody subscribes to dessert.

Five segments in the width of four means the segment labels get smaller. If
they truncate at the narrowest supported width, the control wraps to two rows
rather than shrinking text below caption size.

The edge function's `SLOTS` set gains `dessert` so a menu that labels a dish
that way is transcribed rather than nulled.

## 5. Deduplication: restock the empty row, never relabel live food

Today's rule is "always insert a new inventory row", because last week's
leftover portion of a dish carries an earlier use-by date and merging would
hide old food behind a fresh date.

The new rule, decided over two alternatives (always merge; merge keeping the
earlier date):

> When saving a dish, look for an existing inventory row for the same dish
> and the same vendor whose stock is zero **or** whose expiration date has
> passed. If one is found, restock it: set its quantity to the delivered
> quantity, set its expiration to the new use-by date, and refresh its macros.
> Otherwise insert a new row, exactly as today.

A row with live, unexpired stock is never touched, so a dish delivered twice
in one week produces two rows with two honest dates — which is correct.

**Expired rows with leftover quantity:** the restock *sets* the quantity to
the delivered count rather than adding to it. An expired portion has been
thrown out; carrying its count forward under a fresh date would inflate the
fridge with food that is not there.

If more than one row qualifies, the most recently expired one is restocked and
the others are left alone — they are already invisible to the loop, and
sweeping them up is a separate concern from entering a delivery.

Matching is on the same `prepared_meal_slug` fold the per-dish concept uses,
plus vendor, so "Almond Dream Smoothie" from Thistle finds itself and does not
collide with a differently-sourced dish of the same name.

The location, category, subcategory, concept, saved-food, and meal writes are
idempotent on a restock: the existing links are found and reused, and the
location row's quantity is set to match the restocked quantity.

## Data

One migration, containing:

**A view** over delivery-created inventory rows (those with
`is_scheduled_supply` true and a `preferred_vendor_id`), exposing per vendor:
distinct delivery count and last delivery date, for tile ordering; and per
vendor per dish: name, slug, latest slot, latest calories/protein/fiber, and
last delivered date, for the recents list. Slot comes from the `meals` row
each delivered dish creates, joined by slug.

The view answers both questions in one read, which is why it is one view: the
screen loads it once when it mounts, and the recents list is a filter over
already-fetched rows rather than a second round trip when a vendor is tapped.

**A replacement `create_prepared_meal_delivery`** carrying the restock rule.
Same signature, same all-or-nothing guarantee, same return value (the count of
dishes written).

No new tables. Delivery history is already recoverable from inventory, so a
first-class deliveries table would be a schema change and a backfill that
nothing else currently needs.

## Testing

Pure functions with unit tests, alongside the existing
`preparedMealDelivery.test.ts`:

- stepper ↔ row correspondence: add, increment, decrement to zero, direct Qty
  edit reflected in the stepper, hand-typed name adopting a stepper
- vendor tile ordering: by count, tie-broken by recency, never-ordered
  vendors trailing in `display_order`
- prefill from a recent dish, including nulls where a macro was never known

The view and the restock rule are verified on-device against the real
database: deliver a dish, eat it to zero, deliver it again, confirm one row
with the new date; then deliver a dish that still has live stock and confirm
two rows.

## Out of scope

- Sweeping up the empty duplicate rows that already exist from past deliveries
- Editing or deleting a past delivery as a unit
- Predicting the box contents before the owner picks a vendor
