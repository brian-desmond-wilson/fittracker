import * as Notifications from "expo-notifications";
import { requestPermissions } from "./notificationService";

const WATER_REMINDER_TYPE = "water-reminder";

/**
 * Cancel every previously-scheduled water reminder. Other notification
 * types (event reminders, etc.) are untouched.
 */
export async function cancelAllWaterReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.content.data?.type === WATER_REMINDER_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (error) {
    console.error("cancelAllWaterReminders:", error);
  }
}

/**
 * Schedule a recurring daily water reminder at the given local time.
 */
async function scheduleOne(hhmm: string): Promise<string | null> {
  const [hour, minute] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (isNaN(hour) || isNaN(minute)) return null;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Hydration check 💧",
        body: "Time for some water. Log what you drink to keep your streak.",
        data: { type: WATER_REMINDER_TYPE, time: hhmm },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
    return id;
  } catch (error) {
    console.error(`Failed to schedule water reminder at ${hhmm}:`, error);
    return null;
  }
}

/**
 * Fire a one-off "water reminder" ~1 second from now to validate that
 * notifications render correctly on this device. Returns false if the
 * permission prompt was denied.
 */
export async function sendTestWaterReminder(): Promise<{
  ok: boolean;
  permissionDenied?: boolean;
}> {
  const granted = await requestPermissions();
  if (!granted) return { ok: false, permissionDenied: true };
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Hydration check (test) 💧",
        body: "If you can see this, scheduled reminders should work too.",
        data: { type: WATER_REMINDER_TYPE, test: true },
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
    console.error("Failed to schedule test reminder:", error);
    return { ok: false };
  }
}

/**
 * Cancel any existing water reminders, then schedule a new set if enabled.
 * Requests permission before scheduling — returns false if denied.
 */
export async function syncWaterReminders(
  enabled: boolean,
  times: string[],
): Promise<{ ok: boolean; permissionDenied?: boolean }> {
  if (!enabled || times.length === 0) {
    await cancelAllWaterReminders();
    return { ok: true };
  }

  const granted = await requestPermissions();
  if (!granted) {
    await cancelAllWaterReminders();
    return { ok: false, permissionDenied: true };
  }

  await cancelAllWaterReminders();
  for (const t of times) {
    await scheduleOne(t);
  }
  return { ok: true };
}
