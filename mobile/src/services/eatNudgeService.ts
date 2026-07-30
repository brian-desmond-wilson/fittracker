// mobile/src/services/eatNudgeService.ts
// "eat-nudge" local-notification family (Nutrition OS Phase 3, spec §8.1).
// Pace-aware: the DECISION comes from recommendEatNext (pure); this service
// only schedules/cancels it. Strict cancel-and-resync — at most ONE pending
// nudge exists, budgeted against the shared 64-slot iOS cap.
//
// Mirrors mobile/src/services/mealReminderService.ts: same family-tag shape
// (`data: { type: … }`), same cancel-by-enumeration loop, same permission-gate
// flow via `requestPermissions`, same try/catch + console.error idiom. Not
// unit-tested for the same reason mealReminderService/waterReminderService
// aren't: this module imports expo-notifications, so it cannot enter this
// repo's `testEnvironment: node`, RN-free Jest scope (jest.config.js
// `roots: ["<rootDir>/src"]` + `testMatch` picks up pure-TS libs only).
import * as Notifications from "expo-notifications";
import { requestPermissions } from "./notificationService";
import type { EatNextNudge } from "@/src/lib/eatNext";

const EAT_NUDGE_TYPE = "eat-nudge";

/** Cancel this family only; other families (water-reminder, meal-reminder,
 *  weight_reminder, event_reminder) untouched. */
export async function cancelAllEatNudges(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.content.data?.type === EAT_NUDGE_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (error) {
    console.error("cancelAllEatNudges:", error);
  }
}

/**
 * Reconcile pending state with the engine's decision: null → cancel only;
 * otherwise cancel-then-schedule one DATE-trigger one-shot for today at
 * fireAtMinutes.
 *
 * Midnight caveat (assessed, not fixed here): `EatNextNudge.fireAtMinutes`
 * is documented (eatNext.ts) as minutes-since-local-midnight on the SAME
 * local day as the `nowMinutes` that produced it, and callers are told to
 * resolve it against THAT day, not a fresh `new Date()` — which is exactly
 * what this function does, on the assumption that syncEatNudge always runs
 * on the same calendar day the decision was computed. The
 * `fireDate.getTime() <= Date.now()` check below only catches "the target
 * time already passed today"; it does NOT detect "today is a different day
 * than the decision's day". If a decision were computed shortly before local
 * midnight and this function ran shortly after, `new Date()` would land on
 * the new day and could reconstruct a fireDate up to ~24h later than
 * intended, silently, with no error. This is not fixable from inside this
 * function without threading the decision's source day through, and it has
 * no reachable call site yet (useEatNext computes `now` and the decision
 * synchronously in one pass, and no Task 6-era caller persists a decision
 * across a background/foreground cycle before calling this). Task 8/10 must
 * call syncEatNudge synchronously off a freshly-computed `result`, not a
 * cached one from a prior day, or this reopens.
 */
export async function syncEatNudge(decision: EatNextNudge | null): Promise<void> {
  await cancelAllEatNudges();
  if (!decision) return;
  const granted = await requestPermissions();
  if (!granted) return;

  const fireDate = new Date();
  fireDate.setHours(
    Math.floor(decision.fireAtMinutes / 60),
    decision.fireAtMinutes % 60,
    0,
    0,
  );
  if (fireDate.getTime() <= Date.now()) return;

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

/** One-off test fire (Notifications screen), mirroring the other families. */
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
