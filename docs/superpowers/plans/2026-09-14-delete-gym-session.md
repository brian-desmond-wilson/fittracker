# Delete a Completed Gym Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user delete a completed gym session from both the history list (swipe-left) and the session-detail header (trash), with a confirm; the delete is complete (no orphaned score/debrief/rating/instance/set rows) and, for a captured-workout session, resets the recommender's usage ledger.

**Architecture:** A pure `gymSessionDeletePlan(session)` turns a session's two ids into an ordered list of `{table, column, id}` deletes; a `deleteGymSession` executor runs them via Supabase. `HistorySession` surfaces the workout-instance id and the generated-session id (both already in the fetch join). Two UI entry points call the executor and reload.

**Tech Stack:** Expo / React Native, expo-router, Supabase (untyped client), `react-native-gesture-handler` `Swipeable`, Jest + ts-jest (pure `src/lib` only).

**Spec:** `docs/superpowers/specs/2026-09-14-delete-gym-session-design.md`.

**Deviations from the spec, decided while planning:** none.

**Working directory for every command:** `mobile/` (`cd /Users/brianwilson/code/fittracker/mobile`).

**Commit trailer for every commit:**
```
Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
```

---

## File map

**New**

| File | Responsibility |
|---|---|
| `mobile/src/lib/gymSessionDelete.ts` | Pure `DeleteOp` type + `gymSessionDeletePlan(session)`. |
| `mobile/src/lib/__tests__/gymSessionDelete.test.ts` | Every origin + ordering. |
| `mobile/src/components/track/gym-sessions/SwipeableSessionRow.tsx` | `SessionRow` wrapped in `Swipeable` + `SwipeDeleteAction`, confirm, `onDeleted`. |

**Modified**

| File | Change |
|---|---|
| `mobile/src/types/gymSessions.ts` | `HistorySession` gains `workoutInstanceId`, `generatedSessionId`. |
| `mobile/src/lib/supabase/gymSessions.ts` | `SELECT` generated-session gains `id`; `toSession` fills the two ids; new `deleteGymSession(session)`. |
| `mobile/src/components/track/gym-sessions/SessionDetailScreen.tsx` | Header trash button + confirm + delete + `onClose`. |
| `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx` | History rows use `SwipeableSessionRow`; delete reloads. |

---

### Task 1: Pure delete plan

**Files:**
- Create: `mobile/src/lib/gymSessionDelete.ts`
- Create: `mobile/src/lib/__tests__/gymSessionDelete.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// mobile/src/lib/__tests__/gymSessionDelete.test.ts
import { gymSessionDeletePlan } from "../gymSessionDelete";
import type { DeleteOp } from "../gymSessionDelete";

const op = (table: string, column: string, id: string): DeleteOp => ({ table, column, id });

describe("gymSessionDeletePlan (spec §5.2)", () => {
  it("daily served-whole: usage, then generated_sessions, then workout_instances — in that order", () => {
    expect(gymSessionDeletePlan({ workoutInstanceId: "wi1", generatedSessionId: "gs1" })).toEqual([
      op("captured_workout_usage", "session_id", "gs1"),
      op("generated_sessions", "id", "gs1"),
      op("workout_instances", "id", "wi1"),
    ]);
  });

  it("program / manual (no generated session): just the instance", () => {
    expect(gymSessionDeletePlan({ workoutInstanceId: "wi9", generatedSessionId: null })).toEqual([
      op("workout_instances", "id", "wi9"),
    ]);
  });

  it("no instance id (shouldn't happen): empty plan, nothing to delete", () => {
    expect(gymSessionDeletePlan({ workoutInstanceId: null, generatedSessionId: null })).toEqual([]);
    expect(gymSessionDeletePlan({ workoutInstanceId: null, generatedSessionId: "gsX" })).toEqual([
      op("captured_workout_usage", "session_id", "gsX"),
      op("generated_sessions", "id", "gsX"),
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest src/lib/__tests__/gymSessionDelete.test.ts`
Expected: FAIL — `Cannot find module '../gymSessionDelete'`.

- [ ] **Step 3: Write the module**

```ts
// mobile/src/lib/gymSessionDelete.ts
// What deleting one gym session removes, and in what order. Pure — the
// executor (supabase/gymSessions.ts deleteGymSession) runs these; the pixels
// confirm and reload. Spec 2026-09-14 §5.2.
//
// The order is forced by the FK rules. `captured_workout_usage.session_id`
// is SET NULL on a generated-session delete, so the ledger row must be
// removed FIRST, while the link still points at the session — this is the
// "forget it fully" step, a no-op for program/manual sessions. Then the
// generated session (cascades its blocks, items, debrief, ratings, score),
// then the workout instance (cascades the workout_session, exercises, sets).
// A generated-session delete does NOT remove the instance (the FK the other
// way is SET NULL), so both are deleted explicitly.

export interface DeleteOp {
  table: string;
  column: string;
  id: string;
}

export interface DeletableSession {
  workoutInstanceId: string | null;
  generatedSessionId: string | null;
}

export function gymSessionDeletePlan(session: DeletableSession): DeleteOp[] {
  const ops: DeleteOp[] = [];
  if (session.generatedSessionId) {
    ops.push({ table: "captured_workout_usage", column: "session_id", id: session.generatedSessionId });
    ops.push({ table: "generated_sessions", column: "id", id: session.generatedSessionId });
  }
  if (session.workoutInstanceId) {
    ops.push({ table: "workout_instances", column: "id", id: session.workoutInstanceId });
  }
  return ops;
}
```

- [ ] **Step 4: Run the test**

Run: `npx jest src/lib/__tests__/gymSessionDelete.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/gymSessionDelete.ts src/lib/__tests__/gymSessionDelete.test.ts
git commit -m "feat(track): pure plan for deleting a gym session

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Surface the ids and the delete executor

**Files:**
- Modify: `mobile/src/types/gymSessions.ts` (`HistorySession`)
- Modify: `mobile/src/lib/supabase/gymSessions.ts` (`SELECT`, `toSession`, new `deleteGymSession`)

- [ ] **Step 1: Extend `HistorySession`**

In `mobile/src/types/gymSessions.ts`, inside `HistorySession`, after the `capturedWorkoutHandle` field add:

```ts
  /** The instance this session hangs off — deleting it cascades the session,
   *  its exercises and sets. Always present in practice. */
  workoutInstanceId: string | null;
  /** The generated (daily) session pointing at the instance, when the session
   *  came from the daily loop; null for program and manual logs. Deleting it
   *  clears the score, debrief, ratings and block rows. */
  generatedSessionId: string | null;
```

- [ ] **Step 2: Select the generated-session id and map both ids**

In `mobile/src/lib/supabase/gymSessions.ts`, in the `SELECT` string, change the `generated_session:generated_sessions(` line to include `id`:

```
    generated_session:generated_sessions(
      id, split_day, source, served_captured_workout_id,
```

In `toSession`, the `const instance = first<any>(row.workout_instance);` is already there. After it add:

```ts
  const generated = first<any>(instance?.generated_session);
```

(If `toSession` already has a `generated` local, reuse it — check; `describe()` computes its own. Add this one in `toSession`'s scope.) Then in the returned object, after `capturedWorkoutHandle: described.capturedWorkoutHandle,` (or wherever the described fields are spread) add:

```ts
    workoutInstanceId: instance?.id ?? null,
    generatedSessionId: generated?.id ?? null,
```

- [ ] **Step 3: The executor**

Add to `mobile/src/lib/supabase/gymSessions.ts` (near the other exported functions):

```ts
import { gymSessionDeletePlan } from "../gymSessionDelete";
// ...

export type DeleteSessionResult = { ok: true } | { ok: false; message: string };

/** Delete one gym session and everything that hangs off it — the score,
 *  debrief, ratings, exercises and sets — and, for a captured-workout
 *  session, its usage-ledger rows so the recommender forgets it (spec §5.2).
 *  Runs the plan's deletes in order and stops at the first failure; every
 *  delete is idempotent by id, so a retry converges. RLS scopes each delete
 *  to the signed-in user. */
export async function deleteGymSession(session: {
  workoutInstanceId: string | null;
  generatedSessionId: string | null;
}): Promise<DeleteSessionResult> {
  const ops = gymSessionDeletePlan(session);
  if (ops.length === 0) return { ok: false, message: "Nothing to delete." };
  for (const op of ops) {
    const { error } = await supabase.from(op.table).delete().eq(op.column, op.id);
    if (error) {
      console.error("deleteGymSession failed:", op.table, error.code ?? "", error.message, error.details ?? "");
      return { ok: false, message: "Couldn't delete it. Try again." };
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Reminder: the client is untyped — a wrong column name only surfaces on device / the Task 5 pass. `captured_workout_usage.session_id`, `generated_sessions.id`, `workout_instances.id` are all confirmed against the live baseline.)

- [ ] **Step 5: Commit**

```bash
git add src/types/gymSessions.ts src/lib/supabase/gymSessions.ts
git commit -m "feat(track): surface session ids and add deleteGymSession

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Trash button in the session-detail header

**Files:**
- Modify: `mobile/src/components/track/gym-sessions/SessionDetailScreen.tsx`

- [ ] **Step 1: Imports and delete handler**

Read the file first. Add `Trash2` to the `lucide-react-native` import and `Alert` to the `react-native` import (add whichever is missing). Import the executor and the title helper:

```ts
import { fetchWorkoutSession, deleteGymSession } from "@/src/lib/supabase/gymSessions";
import { sessionTitle } from "@/src/lib/sessionPresentation";
```

Inside the component, after the `session` state, add:

```ts
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = () => {
    if (!session || deleting) return;
    const title = sessionTitle(session);
    Alert.alert(
      "Delete this session?",
      `This removes ${title} from your history for good — its score, notes, and sets. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setDeleting(true);
            const result = await deleteGymSession(session);
            setDeleting(false);
            if (result.ok) {
              onClose();
            } else {
              Alert.alert("Couldn't delete it", "Something went wrong. Try again.");
            }
          },
        },
      ],
    );
  };
```

- [ ] **Step 2: The header button**

Replace the `header` JSX with a right-aligned trash (shown only when a session is loaded):

```tsx
  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} style={styles.back} activeOpacity={0.7}>
        <ChevronLeft size={24} color={colors.foreground} />
        <Text style={styles.backText}>Gym Sessions</Text>
      </TouchableOpacity>
      {session && (
        <TouchableOpacity
          onPress={confirmDelete}
          style={styles.delete}
          disabled={deleting}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Delete this session"
        >
          <Trash2 size={22} color={deleting ? colors.mutedForeground : colors.destructive} />
        </TouchableOpacity>
      )}
    </View>
  );
```

Change the `header` style to space the two apart, and add a `delete` style:

```ts
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8, paddingVertical: 8 },
  delete: { height: 40, justifyContent: "center", paddingHorizontal: 12 },
```

If `colors.destructive` is not a key on the legacy `colors` shim this file imports, use whatever red the file/app uses (check the import; the shim maps `destructive` → `danger`). Report which you used.

- [ ] **Step 3: Typecheck, lint, commit**

Run: `npx tsc --noEmit` → clean. `npx eslint src/components/track/gym-sessions/SessionDetailScreen.tsx` → no new errors.

```bash
git add src/components/track/gym-sessions/SessionDetailScreen.tsx
git commit -m "feat(track): delete a session from its detail header

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Swipe-to-delete on the history list

**Files:**
- Create: `mobile/src/components/track/gym-sessions/SwipeableSessionRow.tsx`
- Modify: `mobile/src/components/track/gym-sessions/GymSessionsScreen.tsx`

- [ ] **Step 1: The swipeable wrapper**

Read `mobile/src/components/training/daily/SwipeableCatalogCard.tsx` for the exact `Swipeable` + `SwipeDeleteAction` + `Alert` shape, and `SessionRow.tsx`'s props. Then:

```tsx
// mobile/src/components/track/gym-sessions/SwipeableSessionRow.tsx
// A history row you can swipe left to delete (spec 2026-09-14 §4.1). The
// row's own tap still opens the session; the swipe reveals the shared red
// Delete panel, confirms, deletes, and asks the list to reload. Mirrors
// training/daily/SwipeableCatalogCard.
import React, { useRef } from "react";
import { Alert } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { SwipeDeleteAction } from "@/src/components/ui/SwipeDeleteAction";
import { SessionRow } from "./SessionRow";
import { deleteGymSession } from "@/src/lib/supabase/gymSessions";
import { sessionTitle } from "@/src/lib/sessionPresentation";
import type { HistorySession } from "@/src/types/gymSessions";

interface SwipeableSessionRowProps {
  session: HistorySession;
  today: string;
  prCount: number;
  showDate?: boolean;
  onPress: () => void;
  /** Reload the list — the header aggregates come from it. */
  onDeleted: () => void;
}

export function SwipeableSessionRow({
  session, today, prCount, showDate, onPress, onDeleted,
}: SwipeableSessionRowProps) {
  const swipeableRef = useRef<Swipeable>(null);
  const close = () => swipeableRef.current?.close();
  const title = sessionTitle(session);

  const handleDelete = () => {
    Alert.alert(
      "Delete this session?",
      `This removes ${title} from your history for good — its score, notes, and sets. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel", onPress: close },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const result = await deleteGymSession(session);
            if (result.ok) {
              onDeleted();
            } else {
              Alert.alert("Couldn't delete it", "Something went wrong. Try again.");
              close();
            }
          },
        },
      ],
    );
  };

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={(progress) => (
        <SwipeDeleteAction
          progress={progress}
          onPress={handleDelete}
          radius={0}
          accessibilityLabel={`Delete ${title}`}
        />
      )}
      overshootRight={false}
      friction={2}
    >
      <SessionRow
        session={session}
        today={today}
        prCount={prCount}
        showDate={showDate}
        onPress={onPress}
      />
    </Swipeable>
  );
}
```

`radius={0}` because `SessionRow`'s row is a flat, borderless-radius list row (`styles.row` has only a bottom border). Confirm `SessionRow` accepts `showDate` (it does — the calendar passes `showDate={false}`); pass it through so the wrapper is drop-in.

- [ ] **Step 2: Use it in the history list**

In `GymSessionsScreen.tsx`, the History `listSessions.map(...)` renders `<SessionRow …/>`. Replace that ONE occurrence (the history list around line 280 — NOT the calendar occurrence around line 392) with:

```tsx
                  <SwipeableSessionRow
                    key={session.id}
                    session={session}
                    today={today}
                    prCount={prCounts.get(session.id) ?? 0}
                    onPress={() => open(session)}
                    onDeleted={load}
                  />
```

Add the import `import { SwipeableSessionRow } from "./SwipeableSessionRow";`. Leave the calendar-view `SessionRow` as a plain row (spec §4.1: only History rows swipe). `load` is the existing `useCallback` reload.

- [ ] **Step 3: Typecheck, lint, tests**

Run: `npx tsc --noEmit` → clean. `npx eslint src/components/track/gym-sessions/SwipeableSessionRow.tsx src/components/track/gym-sessions/GymSessionsScreen.tsx` → no new errors. `npx jest` → all pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/track/gym-sessions/SwipeableSessionRow.tsx src/components/track/gym-sessions/GymSessionsScreen.tsx
git commit -m "feat(track): swipe a history row to delete the session

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Device pass

**Files:** none.

- [ ] **Step 1: Boot**

Reuse the Metro on 8097 (`lsof -nP -iTCP:8097 -sTCP:LISTEN`) or `npx expo start --dev-client --port 8097`. Drive the **"iPhone 17 Pro (FitTracker)"** sim (UDID `3B0EBB05-97BE-4325-91D2-C28FFEA2EF11`). **Coordinate scaling:** the sim tool's tap space is the point size it prints on attach (~402×874); screenshots are ~2.24× larger — multiply screenshot-pixel coords by ~0.44 for x and y before tapping, or bottom buttons silently miss.

- [ ] **Step 2: Walk**

1. Create a throwaway completed session: Training › Flame › Workouts › a served-whole workout › Start › Live › log one set › Finish; Skip the score sheet (or save it — either).
2. Track › Gym Sessions › tap that session › tap the header trash → confirm dialog → Delete → lands back on the list, the row is gone. Confirm the workout's page again reads "You haven't done this one yet."
3. Create another throwaway session. In the history list, swipe its row left → red Delete → Delete → the row drops and the SESSIONS / weekly-goal counts on the header decrease. Swipe another and hit Cancel → the row stays.
4. If a program or manual (non-daily) session is available, delete one and confirm it disappears (instance-only path, no generated session).
5. Verify no orphans with `npx supabase db query --linked` for the deleted generated-session id: `session_scores`, `session_debriefs`, `movement_ratings`, `captured_workout_usage` (by `session_id`) all zero, and `workout_instances` / `workout_sessions` gone.

- [ ] **Step 3: Clean up** any sessions you created for the test (they're throwaways — delete them via the new feature) and report what remains.
