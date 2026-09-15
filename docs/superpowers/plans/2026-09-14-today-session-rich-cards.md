# Today Session — Rich, Reorderable Exercise Cards

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.

**Goal:** Make the Today tab's per-block exercise rows look like the captured-Exercises card and let the user hold-to-reorder within a block and swipe to remove from today.

**Decisions (Brian, 2026-09-14):** all blocks; keep the prescription (sets × reps · rest) on the card; reorder within a block only; hold to reorder + swipe to remove.

**Repo rules:** paths relative to `mobile/` unless `docs/`. Do NOT commit unless Brian asks. `npx tsc --noEmit`, `npx eslint <files>`, `npx jest <path>` from `mobile/`. Raw hex only in `src/theme/tokens.ts`.

**Landmarks (from exploration):**
- Today tree: `src/components/training/daily/TodayTab.tsx` (ScrollView, maps blocks to `BlockCard`); the row lives in `src/components/training/daily/BlockCard.tsx` (`itemRows`, ~lines 164–191).
- Session data: `useDailySession` hook → `src/lib/supabase/daily.ts` `queryDaySession`/`mapDaySession` (~448–525). Types in `src/types/daily.ts` (`SessionItem` ~104–112, `StoredSession` items ~141). `BlockCardItem` in `BlockCard.tsx` (~16–23).
- Facts the rich card needs come from `catalogCardFacts(CatalogEntry)` (`src/lib/catalogCardFacts.ts`, `CatalogEntry` in `src/types/capture.ts`). The muscles/equipment/skill join pattern already exists in `daily.ts` `fetchCandidateData` (~323–405).
- Order: `generated_session_items.item_order` ↔ `SessionItem.itemOrder`; session-wide sequence ordered by section (`SECTION_RANK`). `renumberSessionItems(sessionId)` helper (~964–1002).
- Drag reference: `src/components/track/meals/library/MealBuilder.tsx` — `DraggableFlatList` + `ScaleDecorator` + per-row `Swipeable`, `onLongPress={drag}`, `onDragEnd`. `react-native-draggable-flatlist@^4.0.3` is installed.
- The Today row is a plain `TouchableOpacity` (tap = open exercise) — no existing gesture to conflict with.

---

### Task 1: Load per-exercise facts into the session query (data layer)

**Files:** `src/lib/supabase/daily.ts`, `src/types/daily.ts`, and a new pure mapper `src/lib/sessionItemFacts.ts` (+ test).

- [ ] **Step 1 — extend the fetch.** In `queryDaySession` (and any sibling that builds `StoredSession.items`), widen the `exercise:exercises(...)` sub-select to also pull what the card needs: `image_url`, `skill_level`, `tier`, plus the muscle-regions join (`exercise_muscle_regions(is_primary, muscle_region:muscle_regions(name))`), the equipment join, and scoring types — mirror the exact joins `fetchCandidateData` already uses (copy its select fragments so column/table names match). If the joins are heavy, fetch them in one batched query keyed by the page's `exercise_id`s and merge in `mapDaySession`.

- [ ] **Step 2 — extend the types.** Add the loaded fields to `SessionItem` (or a `SessionItemCard` extension carried on `StoredSession.items`): `imageUrl: string | null`, `skillLevel: string | null`, `tier: number | null`, `muscles: {name; isPrimary}[]`, `equipmentTypes: string[]`, `scoringTypes: string[]`. Keep the prescription fields.

- [ ] **Step 3 (TDD) — pure mapper `sessionItemFacts.ts`.** A function `sessionItemToCatalogEntry(item): CatalogEntry` (or `catalogFactsFromSessionItem`) that shapes a session item into the `CatalogEntry` fields `catalogCardFacts` reads, so the card can reuse `catalogCardFacts` unchanged. Test: primary/secondary split passthrough, tier badge, empty muscles/equipment, missing image. Run `npx jest src/lib/__tests__/sessionItemFacts.test.ts`.

- [ ] **Step 4** — `npx tsc --noEmit`; confirm the Today session still loads (no runtime shape break). Checkpoint.

---

### Task 2: Presentational card body shared by both surfaces

**Files:** `src/components/training/daily/ExerciseCardContent.tsx` (new); refactor `SwipeableCatalogCard.tsx` to use it.

- [ ] **Step 1** — extract the visual body of `SwipeableCatalogCard` (thumbnail full-bleed + placeholder, name row with overlaid tier/core badge, skill+equipment rail, muscle row, score chips) into a presentational `ExerciseCardContent` that takes `facts` (from `catalogCardFacts`) + `name` + `imageUrl` + optional `prescription?: string` (extra line under the score row) and optional `rightSlot` (drag handle / chevron). Keep every style/behaviour identical.

- [ ] **Step 2** — `SwipeableCatalogCard` renders `ExerciseCardContent` (no prescription) inside its existing `Swipeable`; verify the captured-Exercises tab is visually unchanged (device). `tsc`, `eslint`. Checkpoint.

---

### Task 3: `SessionExerciseCard` — the Today row, draggable + swipe-to-remove

**Files:** `src/components/training/daily/SessionExerciseCard.tsx` (new).

- [ ] **Step 1** — build `SessionExerciseCard` using `ExerciseCardContent` with the prescription line (`sets × reps · rest`, formatted from the item; fall back to `reason` if no prescription). Wrap in `ScaleDecorator` + `Swipeable` (reuse `SwipeDeleteAction`) mirroring `MealBuilder`. Props: the session item (with facts), `onOpen`, `onRemove`, `drag`, `isActive`. Tap → `onOpen(exerciseId)`; long-press → `drag`; swipe-left → confirm + `onRemove`. Hint text "hold to reorder · swipe to remove" per block (once).

- [ ] **Step 2** — `tsc`, `eslint`. Checkpoint.

---

### Task 4: Reorder + remove wiring and persistence

**Files:** `BlockCard.tsx`, `TodayTab.tsx`, `src/lib/supabase/daily.ts`, `src/hooks/useDailySession.ts`.

- [ ] **Step 1 (TDD) — within-block reorder math.** Pure helper `reorderWithinBlock(items, section, fromIndex, toIndex): {id, itemOrder}[]` that returns the new session-wide `item_order` sequence after moving one item inside its section, preserving `SECTION_RANK` ordering across the whole session (same invariant as `renumberSessionItems`). Test the boundary cases (first/last in block, single-item block, block not first). `npx jest`.

- [ ] **Step 2 — persist.** Add `persistItemOrder(sessionId, ordered)` and `removeSessionItem(sessionId, itemId)` to `daily.ts` (delete the `generated_session_items` row; then renumber). Expose both through `useDailySession` (optimistic local update, then write + `refetch`).

- [ ] **Step 3 — BlockCard.** Replace `itemRows` `.map` with a per-block `DraggableFlatList` of `SessionExerciseCard` (`scrollEnabled={false}`, `activationDistance` tuned) so it nests inside `TodayTab`'s ScrollView without stealing scroll. `onDragEnd` → compute with `reorderWithinBlock` → hook's persist. Keep the block header/time.

- [ ] **Step 4 — device walk (walk3).** Restyled cards in every block; hold-drag reorders within a block and sticks after refetch; can't cross blocks; swipe removes from today (and the count/session updates); tap still opens the exercise; the served-whole and pre-block fallback paths still render. Screenshot each block. `tsc`, `eslint`, full `npx jest`. Checkpoint.

---

### Notes / risks
- Nested `DraggableFlatList` in a `ScrollView`: keep `scrollEnabled={false}` on the inner lists and let the outer ScrollView scroll; watch the VirtualizedList-nesting warning (MealBuilder made the draggable the page scroller — here we keep the ScrollView and small per-block lists).
- The rich card is tall; a full session gets long — expected, matches the ask.
- Don't restyle the "served whole workout" list or the pre-block fallback unless trivial; those aren't per-block exercise rows.
