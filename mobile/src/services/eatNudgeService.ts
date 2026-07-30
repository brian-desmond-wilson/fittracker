// mobile/src/services/eatNudgeService.ts
// "eat-nudge" local-notification family (Nutrition OS Phase 3, spec §8.1).
// Pace-aware: the DECISION comes from recommendEatNext (pure); this service
// only schedules/cancels it. Strict cancel-and-resync — at most ONE pending
// nudge exists, budgeted against the shared 64-slot iOS cap. That budget is
// a spec invariant (§8.1, §5.6), which is why this module is stricter about
// re-entrancy and cancel-failure handling than its siblings — see the two
// comments below.
//
// Mirrors mobile/src/services/mealReminderService.ts: same family-tag shape
// (`data: { type: … }`), same cancel-by-enumeration loop, same permission-gate
// flow via `requestPermissions`, same try/catch + console.error idiom. Not
// unit-tested for the same reason mealReminderService/waterReminderService
// aren't: this module imports expo-notifications, which fails to load under
// this repo's `testEnvironment: node` Jest config (jest.config.js) — the
// `roots`/`testMatch` settings alone don't exclude it (a test file placed
// here would be matched and run); it's the failed native-module import that
// makes it untestable, not the Jest scoping.
import * as Notifications from "expo-notifications";
import { requestPermissions } from "./notificationService";
import { nudgeFireDate, type EatNextNudge } from "@/src/lib/eatNext";

const EAT_NUDGE_TYPE = "eat-nudge";

/**
 * Every exported mutation is serialized through this queue so overlapping
 * calls can never interleave. This matters specifically because of the
 * ≤1-pending invariant: `syncEatNudge`'s body is cancel → permission-check →
 * schedule, with a real `await` (native-module round trip) at each arrow.
 * Two overlapping calls — reachable in practice, since spec §8.1 defines two
 * resync points (Home card after every load, MealsScreen after every
 * meal-log write) — can each observe "0 pending" from their own cancel step
 * and then both schedule, leaving 2 pending. A module-level promise chain is
 * the minimal fix: each queued operation awaits the previous one's
 * completion (success OR failure) before running, so at any instant at most
 * one cancel-then-maybe-schedule sequence is in flight. `mealReminderService`
 * has the identical structural race and does NOT do this. That is not an
 * oversight to copy here: `syncWaterReminders`/`syncMealReminders` are only
 * ever invoked from persist handlers already gated by a `saving`/`mealSaving`
 * flag that disables the triggering control, so an overlapping call there
 * requires defeating a UI guard first. This family's callers are automatic —
 * every Home-card load, every meal-log write, no gesture in between — so
 * there is no equivalent guard to lean on. Read the other direction: if
 * either sibling ever grows an automatic (gesture-free) resync point, that
 * is the moment it needs this same queue.
 */
let queue: Promise<void> = Promise.resolve();

function serialize<T>(op: () => Promise<T>): Promise<T> {
  // Same handler for both outcomes: run `op` regardless of how the PREVIOUS
  // queued operation settled, so one failure can't wedge every call after
  // it. (`queue` is also re-normalized below to a promise that never
  // rejects, so in today's code the rejection branch is a defensive
  // no-op rather than a reachable path — kept because that invariant lives
  // three lines away and is exactly the kind of thing a future edit here
  // could break without this being the redundant-looking guard against it.)
  const run = queue.then(op, op);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Unserialized core of `cancelAllEatNudges`. Only ever called directly by
 *  `syncEatNudgeCore` below (never via the exported, queue-wrapped
 *  `cancelAllEatNudges`) — routing an already-queued operation back through
 *  `serialize` would enqueue behind itself and deadlock. Returns whether the
 *  cancel actually completed, so a caller can decide not to schedule on top
 *  of an unknown pending state. */
async function cancelAllEatNudgesCore(): Promise<boolean> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.content.data?.type === EAT_NUDGE_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
    return true;
  } catch (error) {
    console.error("cancelAllEatNudges:", error);
    return false;
  }
}

/** Cancel this family only; other families (water-reminder, meal-reminder,
 *  weight_reminder, event_reminder — and the SNOOZE re-schedule at
 *  `useNotifications.ts:61`, which copies whatever `data` the original
 *  notification carried, so it inherits and is swept by that original
 *  family's tag) untouched. Returns `false` if the underlying
 *  expo-notifications calls threw, so a caller with a stricter invariant
 *  (see `syncEatNudge`) can refuse to proceed rather than risk scheduling on
 *  top of an unknown pending state. */
export function cancelAllEatNudges(): Promise<boolean> {
  return serialize(cancelAllEatNudgesCore);
}

async function syncEatNudgeCore(
  decision: EatNextNudge | null,
  sourceDay: Date,
): Promise<void> {
  const cancelled = await cancelAllEatNudgesCore();
  if (!decision) return;
  // Cancel failed: whatever's actually pending is unknown, so scheduling on
  // top of it risks the 2-pending outcome this whole module exists to
  // prevent. Bail rather than guess — the next resync (Home card's next
  // load, or MealsScreen's next write) gets another chance.
  if (!cancelled) return;
  // Unguarded await: a rejection here propagates to this op's caller (and,
  // via `serialize`, is swallowed into the queue's own normalization so the
  // NEXT queued op still runs) rather than being caught locally.
  // `syncMealReminders` has the identical shape — not treated as a gap.
  const granted = await requestPermissions();
  if (!granted) return;

  // `nudgeFireDate` (eatNext.ts) resolves `fireAtMinutes` against `sourceDay`
  // — the caller-supplied day the decision was computed on — returning
  // `null` for either an already-past instant or a `sourceDay` that isn't
  // `now`'s local calendar day (a stale decision: see the Task 6 execution
  // amendment for the full trace of how that can happen and why it's
  // required, not optional, here). No local Date arithmetic in this file
  // duplicates that contract.
  const fireDate = nudgeFireDate(decision.fireAtMinutes, sourceDay, new Date());
  if (!fireDate) return;

  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: decision.title,
        body: decision.body,
        data: { type: EAT_NUDGE_TYPE },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
  } catch (error) {
    console.error("syncEatNudge schedule failed:", error);
  }
}

/**
 * Reconcile pending state with the engine's decision: null → cancel only;
 * otherwise cancel-then-schedule one DATE-trigger one-shot at
 * `decision.fireAtMinutes` on `sourceDay`.
 *
 * `sourceDay` is REQUIRED, deliberately — pass the `computedAt` that
 * `useEatNext` returns alongside the `result` this `decision` came from, not
 * `new Date()`. `EatNextNudge.fireAtMinutes` (eatNext.ts) is documented as
 * minutes since local midnight on the SAME local day as the `nowMinutes`
 * that produced it, and an optional parameter here would let a future
 * caller quietly default to "today" at call time — which is exactly how the
 * cross-midnight bug this signature exists to close would reappear (decision
 * computed shortly before local midnight, `syncEatNudge` invoked shortly
 * after; see the Task 6 execution amendment). Never call this with a
 * `result`/`computedAt` pair that didn't come from the same `useEatNext`
 * snapshot.
 *
 * Does not surface permission-denial to the caller (stays `Promise<void>`):
 * this runs on every background resync (Home card load, MealsScreen
 * meal-log write), with no user gesture to attach an alert to. Permission
 * denial is instead surfaced at the toggle gesture itself — see
 * `handleEatNudgesToggle` in `NotificationsScreen.tsx`.
 */
export function syncEatNudge(
  decision: EatNextNudge | null,
  sourceDay: Date,
): Promise<void> {
  return serialize(() => syncEatNudgeCore(decision, sourceDay));
}

/**
 * One-off test fire (Notifications screen), mirroring the other families.
 * Deliberately OUTSIDE the `serialize` queue: for the ~1s life of its
 * TIME_INTERVAL trigger, there can transiently be two `eat-nudge`-tagged
 * pendings (this test one plus a real one, if any), and a resync landing in
 * that window would cancel the test before it fires. Accepted rather than
 * queued because the user is inside the Notifications modal when they tap
 * this button, where neither of this family's two resync points (Home-card
 * load, MealsScreen meal-log write) is active — so the overlap this could
 * theoretically cause has no real trigger.
 */
export async function sendTestEatNudge(): Promise<{
  ok: boolean;
  permissionDenied?: boolean;
}> {
  const granted = await requestPermissions();
  if (!granted) return { ok: false, permissionDenied: true };
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Eat something (test)",
        body: "If you can see this, pace nudges will work too.",
        data: { type: EAT_NUDGE_TYPE, test: true },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        repeats: false,
      },
    });
    return { ok: true };
  } catch (error) {
    console.error("sendTestEatNudge:", error);
    return { ok: false };
  }
}
