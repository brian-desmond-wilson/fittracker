# Exercise Detail Page v2 — Design Spec

**Date:** 2026-09-11
**Status:** Implemented and device-verified 2026-09-11 (plan: docs/superpowers/plans/2026-09-11-exercise-detail-page-v2.md). Walked on FitTracker-walk3: meta row with Scored by; history block Trend and Sessions views with the saved preference; skill footer and Re-rate (row overwritten, state replayed); See all → Track list scoped with Show all; never-logged row hides history; muscle chip → Exercises tab with the removable chip; sibling collapse; Demo Video card and Find a demo; Captured From strip and the Posts | Creators screen; Add to today across none, pending (disabled), completed (second session) and rested (confirm sheet, Cancel and Add). Not walked: the in-progress-session append and the offline failure path (covered by unit tests and review).
**Surface:** Training › Daily mode › Exercises tab › exercise page (`mobile/src/components/training/item-detail/TrainingItemDetailScreen.tsx`, route `mobile/app/(tabs)/training/exercise/[id].tsx`)
**Visual reference:** Approved mockup (https://claude.ai/code/artifact/8571ffb9-8a99-4d35-8e77-542b6005d956), frames 1 "Page v2", 2 "History block", 3 "Captured From". The mock is the decision record; deviations are proposed in chat, never shipped.
**Companion spec:** `docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md` fills the description, demo video and image this page renders. This spec assumes every row eventually has all three and only renders them.

## 1. Problem

The page describes the exercise well and says nothing about the person reading it. The database holds 890 logged instances across 113 exercises, 23 skill ratings and 27 scaling links, and the page shows none of it. Every page is a dead end: there is no way to act on the exercise you are looking at. Sections silently vanish when data is missing (204 rows have no description, 262 no video), muscle and equipment chips look tappable and are not, hierarchies with ten siblings become a wall, and the Captured From list prints the same handle four times with nothing to tell the posts apart.

## 2. Goals / non-goals

**Goals**
- Show the reader's own history for the exercise: last done, best set, session count, trend, and a dated session list.
- Show their skill note and let them re-rate from the page.
- Say how the exercise is scored next to category, goal and skill.
- Offer one primary action at the end of the scroll: add the exercise to today's session.
- Make muscle, equipment and creator chips navigate to the Exercises tab filtered to that value.
- Collapse long sibling lists.
- Surface easier and harder alternatives from the scaling links table.
- Rebuild Captured From so many posts from many creators read cleanly: a thumbnail strip on the page, a full screen behind it.
- Render the demo video as an inline preview card rather than a button.

**Non-goals**
- No ad-hoc set logging from this page. Sets are recorded in a live session only (decision 1).
- No in-app creator page. The handle navigates to a filtered Exercises tab (decision 6).
- No population of scaling links; the section renders what exists and hides otherwise.
- No changes to the hero, the edit wizard, or the Exercises list cards.
- No changes to how descriptions, videos or images are produced; that is the companion spec.

## 3. Decisions (user-approved 2026-09-11)

1. **Primary action is "Add to today."** Appends the exercise to today's session as a main-block item, then navigates to Today. Chosen over an ad-hoc "Log now" sheet.
2. **History block shows both a trend view and a sessions view**, switched by a segmented toggle "Trend | Sessions" in the section header. Chosen over a swipe pager and over stacking both.
3. **Full page order** as mocked: hero → meta row (Category, Goal, Skill, **Scored by**) → Your history → Description → Also Known As → muscles → equipment → hierarchy → Scale It → Demo Video → Captured From → Add to today.
4. **Skill note lives inside the history block** as its footer line with a Re-rate link, not as its own section.
5. **Captured From on the page is a horizontal post strip** ("Option B"). Its header counts, "6 posts · 3 creators", are tappable and open a full screen with a "Posts | Creators" toggle; Creators is the grouped-by-creator layout ("Option A"). The label tapped picks the starting tab.
6. **Creator handle taps open the Exercises tab filtered to that creator**, with a small external-link icon beside the handle opening their Instagram profile. A creator page is a later spec; when it exists the handle retargets to it.
7. **History numbers come from one scoped query plus a pure module**, not from the user-wide set fetch and not from a database view.
8. **"Find a demo"** lives on this page (Demo Video section) and opens a YouTube search for the exercise name. It belongs to the companion spec's override story but renders here.

## 4. Experience

Mock frames (https://claude.ai/code/artifact/8571ffb9-8a99-4d35-8e77-542b6005d956): 1 Page v2 (full order with nine numbered notes), 2 History block (Trend and Sessions views, segmented toggle), 3 Captured From (full screen with Posts | Creators; the strip is on frame 1).

### 4.1 Meta row

Four columns: Category, Goal, Skill, Scored by. Scored by lists the exercise's scoring type names in their display order joined by " · " ("Reps · Load"). Every row has at least one scoring type, so the column always renders.

### 4.2 Your history

Hidden entirely when the reader has never logged a working set for this exercise. Otherwise a section titled "Your history" with a segmented toggle in the header.

**Trend view.** A card with three stats and a bar chart.
- *Last done*: relative day phrase for the most recent session containing a working set ("3 days ago", "Yesterday", "Today", or the date past 30 days).
- *Best set*: the best set ever, formatted "50 lb × 12"; when every set is unweighted, "12 reps".
- *Sessions*: count of distinct sessions with a working set.
- *Trend bars*: one bar per session for the last eight sessions, oldest left, height proportional to that session's top set relative to the tallest; the best-ever session's bar is highlighted. Caption "Top set, last 8 sessions" and a direction label: "trending up" when the latest top set beats the median of the earlier bars, "trending down" when below, "holding steady" otherwise. Fewer than three sessions: bars render, direction label is omitted.

**Sessions view.** The same card as a list, newest first, at most four rows: date, "· " and the session's display name, then the top set on the right with a green "PR" badge when that set was a record at the time. Each row opens that session in Track (`/(tabs)/track/gym-sessions/[id]`). Below the card in both views: "See all N sessions ›" which opens the same Track session list filtered to this exercise.

**Skill note footer.** Inside the card, under either view: "You rated this **just right** on 8 Sep" and a "Re-rate" link. Hidden when the reader has never rated the exercise. Re-rate opens the existing rating sheet in single-movement mode; saving updates the note in place.

**Best set rule.** Heaviest weight wins; ties broken by reps; when every set is unweighted, most reps wins. Warm-up sets are ignored everywhere in this section.

### 4.3 Description, Also Known As

Unchanged in layout. Description now renders for every row once the companion pipeline has run; the section still hides when the text is empty.

### 4.4 Muscles, equipment, creator: tappable chips

Every muscle chip (primary and secondary), every equipment tile and every creator handle is a button. Tapping opens the Exercises tab with that single value applied *on top of* the reader's saved filters, showing the normal removable chip so it can be cleared. The tab's persisted filters are updated exactly as if the reader had applied the value in the filter sheet (Spec §7).

### 4.5 Hierarchy

The current row plus up to four siblings; past that a "See all N ›" row expands the list in place. The core row and any ancestors above the current row always show. Order and styling unchanged.

### 4.6 Scale It

Two columns, "Easier" and "Harder", each a stack of rows naming the linked exercise. Easier lists regressions, Harder lists progressions, both in the table's display order. A row tap navigates to that exercise's page. The section is hidden when the exercise has no links of either kind; a single empty column is hidden and the other fills the width. Lateral alternatives are not shown.

### 4.7 Demo Video

A preview card (thumbnail placeholder, play glyph, source label such as "YouTube" or "Instagram") that opens the URL. Below it, a text link "Find a demo ›" that opens a YouTube search for the exercise's name (`https://www.youtube.com/results?search_query=<name> exercise`). The link renders whether or not a video is set, so a poor default can always be replaced through the edit wizard.

### 4.8 Captured From

**On the page.** Section header "Captured From" with the count line "N posts · M creators" to its right; each count is a tap target. Below, a horizontal strip of post cards: thumbnail with the creator's avatar badged bottom-left, then the creator handle, the FitTracker workout name in green (or "Exercise demo" when the post was captured as a single exercise), and the capture date. Cards are ordered newest capture first. Tap targets on a card: thumbnail opens the original post; workout name opens that captured workout (`/(tabs)/training/captured-workout/[id]`); handle behaves per §4.4. The strip fades at the right edge to signal more.

**Full screen.** Route `mobile/app/(tabs)/training/exercise-sources/[id].tsx`, title "Captured From", with a "Posts | Creators" segmented toggle. Query param `tab=posts|creators` picks the starting tab: "N posts" opens Posts, "M creators" opens Creators.
- *Posts*: flat list, newest first, one row per post: thumbnail, workout name or "Exercise demo", "Workout · captured 19 Aug" or "Captured 6 Sep", creator handle with avatar.
- *Creators*: grouped. Creator header (avatar, handle, "4 posts"), then that creator's post rows. Creators ordered by their most recent post; posts within a creator newest first.
Same tap targets as the strip.

### 4.9 Add to today

The last thing in the scroll, per the end-of-scroll rule: a full-width primary button "Add to today" with the caption "Goes into today's session as a main-block movement". Behaviour by today's state:
- *Pending session exists (suggested or accepted, not yet started)*: append one main-block item, navigate to Today, toast "Added to today".
- *Session in progress*: append the item to the live session's remaining list, navigate to Today.
- *No session yet*: create a `user_pick` session for today containing just this item, then navigate.
- *Today completed*: append a second `user_pick` session for today (the existing "append to day" path), then navigate.
- *Today rested*: a confirmation sheet "Today is a rest day. Un-rest and add this?" with Cancel / Add. Add un-rests then follows the "no session yet" path.
- *Exercise already in today's pending or live session*: the button reads "In today's session" and is disabled.

## 5. Data model and rules

**History source.** Working sets for this exercise and this user: `set_instances` joined through `exercise_instances` to `workout_instances` and `workout_sessions`, excluding `is_warmup`. Fields per set: session id, session date, session display name, weight, reps. Session display name reuses the presentation rule in `mobile/src/lib/sessionPresentation.ts`.

**Session count** = distinct sessions with at least one working set. **Top set per session** and **best set ever** use the best-set rule in §4.2. **PR badge** on a Sessions row means that session's top set was a record at the time, computed by the existing `recordsBySession` logic in `mobile/src/lib/personalRecords.ts` over this exercise's sets only.

**Skill note.** The most recent `movement_ratings` row for this user and exercise gives the rating and, through its `generated_sessions` row, the date. Re-rate overwrites that row (unique on session + exercise) and then recomputes `exercise_skill_state` by replaying all of this exercise's rating rows in date order through the pure machine in `mobile/src/lib/dailySkill.ts`, so counters cannot drift. The note is hidden when no rating row exists.

**Scored by** = `exercise_scoring_types` → `scoring_types.name`, ordered by `display_order`.

**Scale It** = `movement_scaling_links` where `from_exercise_id` is this row: `scaling_type = 'regression'` → Easier, `'progression'` → Harder, ordered by `display_order`.

**Captured From.** `source_exercises` → `captured_sources` (reviewed, this user) with `thumbnail_url`, `poster_handle`, `platform`, `source_url`, `captured_at`; the creator's avatar from `creators` by (platform, handle); the workout from `captured_workouts` by `source_id` (null when the post was a single-exercise capture). A source with more than one workout shows the first by creation. Existing collapse-by-post dedupe stays.

**Add to today** writes one `generated_session_items` row: `section = 'main'`, `item_order` = last + 1, `target_sets`/`target_reps` null, `reason = 'Added from the exercise page'`. Session creation and append follow the shapes already used by captured-workout adoption in `mobile/src/lib/supabase/daily.ts`.

## 6. Architecture

Pure logic in `src/lib`, pixels in components.

**New**

| File | Responsibility |
|---|---|
| `mobile/src/lib/exerciseHistory.ts` | Pure: from a list of working sets, compute last done, best set, session count, top-set-per-session, eight-session trend and direction, sessions list rows with PR flags. Best-set rule lives here. |
| `mobile/src/lib/supabase/exerciseHistory.ts` | The one scoped query for a user's working sets of one exercise; returns the input shape for the pure module. |
| `mobile/src/lib/capturedFromModel.ts` | Pure: from source rows (+ avatar, + workout), build the strip cards, the Posts list, the Creators groups, and the "N posts · M creators" counts, with the ordering rules of §4.8. |
| `mobile/src/lib/addToTodayPlan.ts` | Pure: from today's session state (none / pending / in progress / completed / rested, and whether the exercise is already present) decide which of the §4.9 branches applies and what label the button shows. |
| `mobile/src/lib/supabase/addToToday.ts` | Executes a plan: append item, create user_pick session, append second session, un-rest then create. |
| `mobile/src/lib/skillReplay.ts` | Pure: replay an exercise's rating rows through `applyRating` to a final state. |
| `mobile/src/components/training/item-detail/HistoryBlock.tsx` | Section with the segmented toggle, Trend card, Sessions card, skill footer. |
| `mobile/src/components/training/item-detail/ScaleItSection.tsx` | Easier / Harder columns. |
| `mobile/src/components/training/item-detail/CapturedFromStrip.tsx` | The on-page horizontal strip and count header. |
| `mobile/src/components/training/item-detail/CapturedFromScreen.tsx` + `mobile/app/(tabs)/training/exercise-sources/[id].tsx` | The full screen with Posts | Creators. |
| `mobile/src/components/training/item-detail/AddToTodayButton.tsx` | Button, caption, disabled state, rest-day confirmation sheet (uses `ui/BottomSheet`). |
| `mobile/src/components/training/item-detail/DemoVideoCard.tsx` | Preview card and "Find a demo" link. |

**Changed**

| Was | Becomes | Change |
|---|---|---|
| `TrainingItemDetailScreen.tsx` renders every section inline (1,093 lines) | Composes the section components above | Select gains scoring types; hierarchy gains the collapse; chips become buttons; sections reordered per decision 3. |
| `fetchExerciseSources` in `mobile/src/lib/supabase/capture.ts` returns handle + URL + thumbnail | Also returns the creator avatar URL and the captured workout id + name | One select with two more joins. |
| `fetchMovementProgressions` / `fetchMovementRegressions` in `mobile/src/lib/supabase/crossfit.ts` have no callers | Called by ScaleItSection | No change to the functions. |
| `saveMovementRatings` in `daily.ts` increments state from the prior row | Unchanged for session-end batches; the page's Re-rate calls a new `rerateMovement(sessionId, exerciseId, rating)` that overwrites the row and replays | Keeps the session-end path byte-identical. |
| `MovementRatingSheet.tsx` takes a list of movements for a session | Accepts a single movement and an `onSave` override | Same sheet, one item. |
| `mobile/app/(tabs)/training/index.tsx` accepts `shareUrl` | Also accepts `exerciseFilter` (JSON of a partial `ExerciseFilters`) | Consumed and cleared exactly like `shareUrl`; sets Daily mode and the Exercises tab. |
| `CatalogTab.tsx` loads saved prefs on mount | Merges an `initialFilters` prop over the loaded prefs and saves the result | Never clobbers the load: the merge happens after prefs resolve. |

## 7. State and persistence

- The Trend | Sessions choice is saved per user in the existing prefs store (`mobile/src/lib/filterPrefsStore.ts` factory), key `training.exercise.historyView.v1:${userId}`. Default Trend.
- Chip navigation writes through the Exercises tab's normal "applied change saves" path, so the filter survives leaving the tab.
- Everything else is derived on open. The history query runs once per page open; Add to today re-reads today's state immediately before writing.

## 8. Error handling

- Every new block fails closed: a failed history, sources, scaling or scoring fetch hides that block and logs; the page still renders.
- Add to today: failure shows an inline error under the button and leaves today untouched; the button re-enables.
- Re-rate: failure keeps the old note and toasts.
- Chip navigation with a value the filter model cannot represent (unknown muscle name) falls back to opening the tab with no extra filter.
- A missing avatar shows the initial-letter placeholder already used in the creator picker; a missing thumbnail shows a neutral tile.

## 9. Testing

Unit tests, pure modules:
- `exerciseHistory`: best-set rule (weighted, unweighted, ties), last-done phrasing, session count, trend bars and direction with 1, 2, 3, 8 and 20 sessions, PR flags.
- `capturedFromModel`: ordering, grouping, counts, "Exercise demo" fallback, duplicate-post collapse.
- `addToTodayPlan`: one case per §4.9 branch plus "already present".
- `skillReplay`: replay equals incremental for the promotion and demotion paths.

Device walk on FitTracker-walk3: Alternating Dumbbell Snatch (history present, one creator), Squat (six posts, three creators, ten siblings), a never-logged row (history hidden), Add to today across pending, completed and rested days.

## 10. Out of scope

Creator page; ad-hoc logging; scaling-link authoring; per-set history editing; any change to the Track records screens beyond accepting an exercise filter on the session list.
