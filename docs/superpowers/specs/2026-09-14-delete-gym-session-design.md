# Delete a Completed Gym Session — Design Spec

**Date:** 2026-09-14
**Status:** Approved in brainstorm; awaiting written-spec review
**Screen:** Track › Gym Sessions (the history list and a session's detail)

## 1. Problem

A gym session, once logged, cannot be removed from inside the app — the session-detail screen has only a back button and the history list has no swipe action. A mistaken or test log stays forever, counting toward streaks, weekly goals, PRs, and the recommender's rotation. During the session-score device walk I had to delete a test session directly from the production database because no UI could.

## 2. Goals / non-goals

**Goals**
- Delete a completed gym session from two places: swipe-left on a history row, and a trash control in the session-detail header.
- A confirm before it happens; the delete is complete (no orphaned score, debrief, rating, instance, or set rows) and, for a captured-workout session, forgotten by the recommender.
- Every Track aggregate self-corrects on the next reload.

**Non-goals**
- Bulk / multi-select delete.
- Undo, trash, or archive — the delete is immediate and permanent (the confirm says so).
- Any change to how sessions are created, or to program/manual session creation.
- Deleting an *in-progress* session (this is about completed history; an in-progress live session is left via its own "Done for today").

## 3. Decisions (user-approved 2026-09-14)

1. **Placement:** both — swipe-to-delete on the list rows AND a trash button in the detail header.
2. **Recommender memory:** forget it fully — a captured-workout session's `captured_workout_usage` rows are deleted too, so its "done N times / last done" resets and it is eligible to be recommended again.

## 4. Experience

### 4.1 History list (`GymSessionsScreen` rows)

Each `SessionRow` is wrapped in a right-swipe `Swipeable` (the `SwipeableCatalogCard` pattern) revealing a red Delete panel (`ui/SwipeDeleteAction`, `radius` matching the row's card radius, accessibility label "Delete {session title}"). Releasing the swipe fires the confirm (§4.3). On confirmed delete the list reloads (its existing focus `load()`), the row drops, and the header aggregates recompute. Cancel closes the swipe. Only the History view rows swipe; Stats and Calendar are unaffected.

### 4.2 Session detail (`SessionDetailScreen` header)

The header gains a right-aligned `Trash2` button (24pt, `colors.foreground`) opposite the back control (`justifyContent: "space-between"`). Tapping it fires the confirm. On confirmed delete the screen calls `onClose()` — back to the list, which reloads on focus. (The screen already renders "That session is no longer here." for a missing session, so a stale deep link is covered.) The trash is shown only once a session has loaded.

### 4.3 The confirm

`Alert.alert` (the app's destructive-action pattern), destructive style:
- Title: **"Delete this session?"**
- Body: **"This removes {title} from your history for good — its score, notes, and sets. This can't be undone."** (title from `sessionTitle(session)`.)
- Buttons: **Cancel** (cancel style; on the list, closes the swipe) and **Delete** (destructive).

On a failed delete: an `Alert.alert("Couldn't delete it", "Something went wrong. Try again.")`; the session stays. On the list, the swipe is closed either way.

## 5. Data model and rules

A gym session in the UI is a `workout_sessions` row on a `workout_instance`. Deleting it fully means clearing everything that hangs off both the instance and, when present, the `generated_session` that points at the instance.

### 5.1 Surface the two ids

`HistorySession` gains:
```ts
  /** The instance this session hangs off — deleting it cascades the session,
   *  its exercises and sets. Always present. */
  workoutInstanceId: string | null;
  /** The generated (daily) session that points at the instance, when the
   *  session came from the daily loop; null for program and manual logs.
   *  Deleting it clears the score, debrief, ratings and block rows. */
  generatedSessionId: string | null;
```
Both already ride the `fetchGymSessions` / `fetchWorkoutSession` join (`workout_instance.id`, `workout_instance.generated_session`); the generated-session select gains `id`. `toSession` maps `instance?.id` and `instance?.generated_session`'s id (via the existing `first<any>` helper) onto the two fields.

### 5.2 The delete, in order (`deleteGymSession`)

FK rules that shape the order (from the live baseline): `workout_sessions`, `exercise_instances`, `set_instances` all CASCADE off `workout_instances`; `generated_session_blocks/items`, `session_debriefs`, `movement_ratings`, `session_scores` all CASCADE off `generated_sessions`; but `generated_sessions.workout_instance_id` is SET NULL (so deleting the instance orphans the generated session rather than removing it), and both `captured_workout_usage.session_id` and `session_adjustments.session_id` are SET NULL (so those rows survive a generated-session delete rather than cascading). Therefore:

1. **If `generatedSessionId`:** `delete from captured_workout_usage where session_id = generatedSessionId` — first, while the link still exists (a generated-session delete would null it). This is the "forget it fully" step; it is a no-op for program/manual sessions.
2. **If `generatedSessionId`:** `delete from session_adjustments where session_id = generatedSessionId` — the other SET-NULL table; also removed while the link exists, so no adjustment row is left orphaned. A no-op for program/manual sessions.
3. **If `generatedSessionId`:** `delete from generated_sessions where id = generatedSessionId` — cascades blocks, items, debriefs, ratings, and the score.
4. **If `workoutInstanceId`:** `delete from workout_instances where id = workoutInstanceId` — cascades the workout_session(s), exercise_instances, and set_instances.

A session always has an instance; the generated-session steps are skipped when it is null. RLS scopes every delete to the signed-in user, so a stray id cannot touch another user's rows. The SET-NULL tables (1, 2) must precede the generated-session delete (3); the instance delete (4) is independent of order.

### 5.3 What recomputes (nothing to fix)

All Track aggregates read the reloaded `sessions` array or `fetchSetFacts`, so streak, weekly-goal count, week rail, balance, PRs, and volume self-correct. `fetchWorkoutCompletions` counts `generated_sessions` (removed in step 2), and the split/rotation lookback reads completed generated sessions (also removed), so both drop the session correctly. The usage ledger (step 1) is the one that would otherwise survive; deleting it is the approved behaviour.

## 6. Architecture

| File | Change |
|---|---|
| `mobile/src/lib/gymSessionDelete.ts` (new) | Pure `gymSessionDeletePlan(session): DeleteOp[]` — from a session's two ids, the ordered list of `{ table, column, id }` deletes (usage → generated_session → instance), skipping the generated-session ops when its id is null. |
| `mobile/src/lib/__tests__/gymSessionDelete.test.ts` (new) | Every origin: daily served-whole (all three ops), program (instance only), manual (instance only), and the ordering (usage before generated_session). |
| `mobile/src/lib/supabase/gymSessions.ts` | `SELECT` generated-session gains `id`; `HistorySession` (in `types/gymSessions.ts`) gains the two id fields; `toSession` fills them; new `deleteGymSession(session): Promise<{ ok: true } | { ok: false; message: string }>` runs the plan's deletes in order via `supabase`, returning failure on the first error. |
| `mobile/src/types/gymSessions.ts` | `HistorySession` gains `workoutInstanceId`, `generatedSessionId`. |
| `mobile/src/components/track/gym-sessions/SessionDetailScreen.tsx` | Header gains a right `Trash2` button (shown when a session is loaded) → confirm → `deleteGymSession` → `onClose()` on success. |
| `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx` | History rows wrapped in `Swipeable` + `SwipeDeleteAction` → confirm → `deleteGymSession` → `load()` (reload). Follows `SwipeableCatalogCard`'s ref/close/confirm shape. |

Reused as-is: `SwipeDeleteAction`, `Alert.alert`, `sessionTitle`, the `Swipeable` (`react-native-gesture-handler`) usage from `SwipeableCatalogCard`, the `supabase` client.

## 7. State and persistence

Delete is a set of writes; nothing is cached. Both entry points reload from the source after a successful delete (the list re-fetches on focus and via `load()`; the detail navigates back to the freshly-loading list).

## 8. Error handling

- A delete step fails → `deleteGymSession` returns `{ ok: false, message }` at the first error; the session is left as-is (partial cascade is bounded — a failed generated-session delete leaves the instance untouched and vice versa, and a retry converges since every delete is idempotent by id). The UI shows "Couldn't delete it."
- A session already deleted elsewhere: the deletes match zero rows and succeed; the reload shows it gone. The detail screen's "no longer here" state covers a stale open.
- No signed-in user: `deleteGymSession` returns `{ ok: false }` and the UI shows the same alert (RLS would refuse anyway).

## 9. Testing

`gymSessionDelete.test.ts`: a daily served-whole session (ids both set) → three ops in order usage, generated_sessions, workout_instances; a program session (generatedSessionId null) → one op, workout_instances; a manual session (both the same shape) → instance only; a session with no instance id → empty plan (guarded). Assert the exact `{ table, column, id }` tuples and their order.

Device pass on the "iPhone 17 Pro (FitTracker)" sim: create a throwaway session (start + log a set + finish a served-whole workout, no score), then (a) delete it from the detail header → lands back on the list, row gone, and the workout page shows "You haven't done this one yet" again and its usage reset; (b) create another, delete it via list swipe → row drops, streak/goal counts drop; confirm Cancel leaves it. Verify a program or manual session (no generated_session) deletes with the instance-only path. Confirm no orphan rows via `supabase db query --linked` (session_scores / session_debriefs / captured_workout_usage for the deleted ids all zero).

## 10. Out of scope / follow-ons

- Bulk delete / multi-select.
- Undo or a trash bin.
- Deleting an in-progress session from the UI.
