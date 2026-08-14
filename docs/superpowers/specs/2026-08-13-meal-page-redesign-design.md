# Meal page redesign

**Date:** 2026-08-13
**Status:** implemented 2026-08-13. Two rules the spec left open were settled in
the build: a portion scales what you *ate* and never the stock decrement (half a
smoothie still opens the whole container), and an ingredient row calls out its
expiry within 3 days — the shelves' rescue horizon — rather than the 7-day
"expiring soon" one, which would flag half a fridge.
**Mockups:** https://claude.ai/code/artifact/59aed8a8-476d-434c-912a-ebbac47b7150
**Scope:** the meal page (`Track › Meal Library › meal`), and — added after the
meal page shipped — the Edit page behind it (§4).

---

## 1. Why

The meal page works and reads like a form. It opens on a name in a card, buries
the picture entirely, states the score breakdown before the score, spreads the
ingredient's three possible problems across three separate blocks at the bottom,
and offers a logging slot picker that looks like a categorisation control.

The redesign makes it a page about one meal: a photograph, the four facts that
decide the tap, its ingredients as real rows with real state, and then the
reference material.

One behaviour changes underneath the page rather than on it: a meal may now be
filed under several categories.

---

## 2. Data model changes

### 2.1 Categories become multi-valued

A meal today holds exactly one `category` from
`breakfast | lunch | dinner | snack | shake | emergency`. It drives three things:
the library's shelves and category tabs, the counts on those tabs, and — most
consequentially — which meals the recommender considers in the current eating
window. A meal you would happily eat for lunch or dinner is invisible to the
7pm suggestion.

**Decision.** A meal holds one or more categories, from a set that gains
`dessert`:

    breakfast · lunch · dinner · snack · dessert · shake     (freely combinable)
    emergency                                                (exclusive)

`emergency` may only be held **alone**. It is deliberately excluded from ordinary
suggestions, and "this is an emergency meal and also a breakfast" has no defined
meaning for the recommender. The UI enforces this: selecting Emergency Calories
clears the others, and selecting any other clears Emergency.

At least one category is required — a meal with none would appear on no shelf.

**Migration.** New table (`meal_categories`: `meal_id`, `category`, primary key
on the pair) rather than an array column, so the CHECK constraint per row and
the foreign key are both expressible and a category can be indexed. Backfill one
row per existing meal from its current `category`. The old column stays for one
release as the primary (see 2.2) and is not read anywhere else.

**Consumers to update:**

| Consumer | Change |
| --- | --- |
| Library shelves | A meal appears on the shelf of every category it holds. |
| Category tabs | See 2.2. |
| Library filter | Filtering by a category matches a meal holding it. |
| Recommender window filter | A meal is eligible if **any** of its categories matches the window's. This is the point of the whole change. |
| `CATEGORY_DEFAULT_MEAL_TYPE` | Derives a logging slot from a category. With several, use the primary. |
| Builder | Writes several categories. Shipped a day later than the rest; in between, saving an edit refiled a two-shelf meal onto one (§4). |

### 2.2 Tab counts and the primary category

**Decision:** a meal is counted in **every** category it holds. The tabs read as
"meals filed here" and no longer sum to the library total; that arithmetic was
never load-bearing, and a shelf that under-reports its own contents is worse.

A **primary** category is still stored — the first one picked — because two things
need a single answer: the default logging slot, and any future place that has
room for one label. It is not shown as a separate control; the first chip
selected becomes primary, and the rail marks it. Backfilled meals take their
existing single category as primary. Deselecting the primary while others remain
promotes the next-selected one; deselecting the last is refused, per 2.1.

### 2.3 Archive becomes a stored state

Archiving is computed today (`shouldRetire`: complete portion, out of stock, idle
long enough). There is no way to archive a meal by hand and no way to bring one
back.

**Decision:** add a stored `archived_at` (nullable timestamp). A meal is archived
if `archived_at` is set **or** the retirement rule says so. Setting it pins a meal
to the archive; clearing it un-archives and hands the meal back to the automatic
rule. The page's Archive button toggles it.

---

## 3. The page

Top to bottom. Section numbers are the mockup's reading order, not a sequence.

### 3.1 Header

Matches the Food Inventory product page exactly: a 24pt chevron and the word
**Back** at 17pt in `text`, with **Edit** as a ghost brand button on the right.
The page loses the "Library" label and the bottom Edit button is kept anyway —
see 3.7.

### 3.2 Hero

A large photograph of the meal (initials fallback, as the shelf cards use), with:

- **Score pill** top-left, the shelves' treatment.
- **Flip control** top-right, the product page's dark disc, same icon, same
  corner on both faces.
- **Title, favourite star, macros, source** over a bottom scrim. The star is the
  only control in the hero; everything else there is a statement.
- Macros line: calories · protein · fiber · prep minutes. Source line: vendor
  name and `complete portion` / role tag when present.

### 3.3 Status line

One line under the hero, and the page's only summary: stock verdict
(*Ready to make* / *Missing 2* / nothing to check for an eaten-out meal), the
freshness urgency when an ingredient is within 3 days, and history
(`31× · last Tuesday`, absent until eaten).

### 3.4 Categories

A horizontally scrolling rail of chips that **never wraps**, multi-selectable,
writing straight through (no save step). Emergency Calories behaves per 2.1. The
primary is marked. Editing here is the exception to "the Edit page owns editing":
it is one tap and it changes where the meal is found.

### 3.5 Ingredients

One row per ingredient: thumbnail from the linked kitchen product (initials
fallback), name, quantity and calories, and exactly one state chip:

| State | Chip | Row action |
| --- | --- | --- |
| In stock | `In stock`, brand | — |
| Expiring within 3 days | `3d left`, warning | — |
| Missing | `Missing`, danger | Add to shopping list |
| Not linked to anything | `Not linked`, muted | Link an ingredient |

The repair sits under the row that names the problem, replacing the three
summary blocks at the foot of today's page. Tapping a row opens that product in
Food Inventory; back returns to the meal.

The `✂︎ cut small — EoE-safe` marker stays, on the row it belongs to.

### 3.6 Brian Score

Collapsed by default to one line: `Brian Score 88/100` plus the
**Brian Approved** badge when earned. Expanding reveals the five component bars
and the renormalisation note. Cost states plainly that it is not scored yet.
`Contains a food rated "never"` and `Taste unknown` stay, at the collapsed level —
they are verdicts, not audit.

### 3.7 Log

- **Portion**: ½ / 1 / 1½ / 2, defaulting to 1, scaling the calories and macros
  written.
- **Day**: defaults to today, changeable.
- **Slot**: single-select chips (Breakfast, Lunch, Dinner, Snack, Dessert),
  defaulting to the primary category's slot.
- **Button** names what it will write: *Log 400 cal to breakfast*, updating with
  the portion and slot.
- On success: the shared undo toast, four seconds, naming what landed where,
  with Undo removing the rows and refunding the stock — the same component and
  behaviour the shelves use. This replaces the alert.

### 3.8 Actions

**Edit · Archive · Delete** in a row. Edit duplicates the header action
deliberately: the header is for someone who arrived to change something, the
footer for someone who read the page and then decided. Archive per 2.3. Delete
stays destructive-red and confirmed.

---

## 4. The Edit page

Approved from its own mockups (https://claude.ai/code/artifact/3d9deb05-567f-4a3e-85e9-c35ccef7435d)
and built the same day.

- **Categories as a set**, fixing a live data-loss path: the form wrote one
  category, so saving any edit refiled a two-shelf meal onto one.
- **A meal owns its photograph** (`meals.image_primary_url`), with the borrowed
  ingredient picture as the fallback everywhere a face is chosen. Clearing it
  falls back rather than blanking.
- **Three properties get controls at last**: source kind, vendor name, and
  complete-portion. They existed on every meal and survived an edit only
  because the save passed them through.
- **The ingredient list is the page** — a draggable list whose header and footer
  are the rest of the form, because order decides the meal's face and a
  ScrollView cannot hold a draggable list.
- Rows carry what the meal page shows (thumbnail, calories, stock, days left),
  remove by swipe rather than a bare ✕ twelve points from ＋, and an unlinked
  ingredient states its consequence with the fix beside it.
- **Search finishes the job**: scan a barcode, or create the food inline through
  the existing food form — the old dead end cost you the whole edit.
- Prep time becomes presets plus Other; role and taste say what they do; taste
  reads as speech; notes get a field.
- Save moves to the header, the live score follows you down the page with a
  delta from where the meal started, and leaving dirty asks first.

## 5. Out of scope

- Cost scoring.
- Any change to how the recommender ranks; only its eligibility filter changes.

## 6. Risks

- **The category migration touches the recommender.** Its window filter is the
  most load-bearing read of `category` in the app. It needs its own tests before
  the column is switched.
- **The database is not rebuildable from the repo.** The migration must be
  additive and backfilled in place.
- **Counting a meal twice** is visible in the library tabs on day one. Accepted
  in 2.2; worth watching whether the numbers read as broken.
