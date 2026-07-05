import * as Notifications from "expo-notifications";
import { requestPermissions } from "./notificationService";
import { MealType } from "@/src/types/track";

const MEAL_REMINDER_TYPE = "meal-reminder";

function bodyFor(mealType: MealType): { title: string; body: string } {
  switch (mealType) {
    case "breakfast":
      return { title: "Breakfast 🍳", body: "Time for breakfast. Tap to log it." };
    case "lunch":
      return { title: "Lunch", body: "Time for lunch. Tap to log it." };
    case "dinner":
      return { title: "Dinner", body: "Time for dinner. Tap to log it." };
    case "snack":
      return { title: "Snack", body: "Time for a snack. Tap to log it." };
    case "dessert":
      return { title: "Dessert", body: "Time for dessert. Tap to log it." };
  }
}

/**
 * Cancel previously-scheduled meal reminders, leaving other types
 * (water reminders, event reminders) untouched.
 */
export async function cancelAllMealReminders(): Promise<void> {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.content.data?.type === MEAL_REMINDER_TYPE) {
        await Notifications.cancelScheduledNotificationAsync(n.identifier);
      }
    }
  } catch (error) {
    console.error("cancelAllMealReminders:", error);
  }
}

async function scheduleOne(
  hhmm: string,
  mealType: MealType,
): Promise<string | null> {
  const [hour, minute] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (isNaN(hour) || isNaN(minute)) return null;
  const { title, body } = bodyFor(mealType);
  try {
    return await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: { type: MEAL_REMINDER_TYPE, meal_type: mealType, time: hhmm },
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch (error) {
    console.error(`Failed to schedule meal reminder ${hhmm}/${mealType}:`, error);
    return null;
  }
}

/**
 * Cancel + reschedule meal reminders based on the user's configured
 * times + types. Asks for notification permission if needed.
 */
export async function syncMealReminders(
  enabled: boolean,
  times: string[],
  types: MealType[],
): Promise<{ ok: boolean; permissionDenied?: boolean }> {
  if (!enabled || times.length === 0) {
    await cancelAllMealReminders();
    return { ok: true };
  }
  const granted = await requestPermissions();
  if (!granted) {
    await cancelAllMealReminders();
    return { ok: false, permissionDenied: true };
  }
  await cancelAllMealReminders();
  for (let i = 0; i < times.length; i++) {
    const time = times[i];
    const type = (types[i] ?? "snack") as MealType;
    await scheduleOne(time, type);
  }
  return { ok: true };
}

/**
 * One-off test fire ~1 second from now to validate the notification
 * pipeline (permissions + rendering).
 */
export async function sendTestMealReminder(): Promise<{
  ok: boolean;
  permissionDenied?: boolean;
}> {
  const granted = await requestPermissions();
  if (!granted) return { ok: false, permissionDenied: true };
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Meal reminder (test) 🍽️",
        body: "If you can see this, scheduled meal reminders should work too.",
        data: { type: MEAL_REMINDER_TYPE, test: true },
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
    console.error("Failed to schedule test meal reminder:", error);
    return { ok: false };
  }
}
