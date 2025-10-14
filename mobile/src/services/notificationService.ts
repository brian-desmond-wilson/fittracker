import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ScheduleEvent } from '../types/schedule';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

export interface NotificationSettings {
  enabled: boolean;
  minutesBefore: number;
}

// Default notification settings
const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  minutesBefore: 0, // At event start time
};

// Configure notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Request notification permissions from the user
 */
export async function requestPermissions(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Failed to get push token for push notification!');
    return false;
  }

  // For iOS, set notification categories with actions
  if (Platform.OS === 'ios') {
    await Notifications.setNotificationCategoryAsync('event', [
      {
        identifier: 'MARK_COMPLETE',
        buttonTitle: 'Mark Complete',
        options: {
          opensAppToForeground: false,
        },
      },
      {
        identifier: 'SNOOZE',
        buttonTitle: 'Snooze 5 min',
        options: {
          opensAppToForeground: false,
        },
      },
    ]);
  }

  return true;
}

/**
 * Get notification settings from storage
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const settingsJson = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
    if (settingsJson) {
      return JSON.parse(settingsJson);
    }
  } catch (error) {
    console.error('Error loading notification settings:', error);
  }
  return DEFAULT_SETTINGS;
}

/**
 * Save notification settings to storage
 */
export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving notification settings:', error);
  }
}

/**
 * Calculate the trigger date for a notification
 */
function calculateTriggerDate(eventDate: Date, minutesBefore: number): Date {
  const triggerDate = new Date(eventDate);
  triggerDate.setMinutes(triggerDate.getMinutes() - minutesBefore);
  return triggerDate;
}

/**
 * Schedule a notification for a single event
 */
export async function scheduleEventNotification(
  event: ScheduleEvent,
  date: Date,
  settings: NotificationSettings
): Promise<string | null> {
  if (!settings.enabled) {
    console.log(`  Notifications disabled, skipping ${event.title}`);
    return null;
  }

  try {
    const [hours, minutes] = event.start_time.split(':').map(Number);
    const eventDate = new Date(date);
    eventDate.setHours(hours, minutes, 0, 0);

    const now = new Date();
    console.log(`  Event: ${event.title}`);
    console.log(`    Event date/time: ${eventDate.toLocaleString()}`);
    console.log(`    Current time: ${now.toLocaleString()}`);
    console.log(`    Is in past: ${eventDate < now}`);

    // Don't schedule if the event is in the past
    if (eventDate < now) {
      console.log(`    ⚠️ Skipping - event is in the past`);
      return null;
    }

    const triggerDate = calculateTriggerDate(eventDate, settings.minutesBefore);
    console.log(`    Trigger date: ${triggerDate.toLocaleString()} (${settings.minutesBefore} min before)`);

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: event.title,
        body: `${formatTime(event.start_time)} - ${formatTime(event.end_time)}${
          event.category ? ` • ${event.category.name}` : ''
        }`,
        data: {
          eventId: event.id,
          eventDate: date.toISOString(),
          type: 'event_reminder',
        },
        categoryIdentifier: 'event',
        sound: true,
      },
      trigger: {
        date: triggerDate,
      },
    });

    console.log(`    ✅ Scheduled with ID: ${notificationId}`);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling notification:', error);
    return null;
  }
}

/**
 * Schedule notifications for a recurring event (next 30 days)
 */
export async function scheduleRecurringNotifications(
  event: ScheduleEvent,
  settings: NotificationSettings
): Promise<string[]> {
  console.log(`  Scheduling recurring: ${event.title}`);
  console.log(`    is_recurring: ${event.is_recurring}`);
  console.log(`    recurrence_days: ${JSON.stringify(event.recurrence_days)}`);
  console.log(`    enabled: ${settings.enabled}`);

  if (!event.is_recurring || !event.recurrence_days || !settings.enabled) {
    console.log(`    ⚠️ Skipping recurring - missing data or disabled`);
    return [];
  }

  const notificationIds: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log(`    Checking next 30 days for matching days: ${event.recurrence_days.join(', ')}`);

  // Schedule for next 30 days
  for (let i = 0; i < 30; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(checkDate.getDate() + i);

    // Check if this day matches the recurrence pattern
    const dayOfWeek = checkDate.getDay();
    if (event.recurrence_days.includes(dayOfWeek)) {
      console.log(`    Day ${i}: ${checkDate.toLocaleDateString()} matches (day ${dayOfWeek})`);
      const notificationId = await scheduleEventNotification(event, checkDate, settings);
      if (notificationId) {
        notificationIds.push(notificationId);
      }
    }
  }

  console.log(`    Total recurring notifications scheduled: ${notificationIds.length}`);
  return notificationIds;
}

/**
 * Cancel all notifications for a specific event
 */
export async function cancelEventNotifications(eventId: string): Promise<void> {
  try {
    const allNotifications = await Notifications.getAllScheduledNotificationsAsync();
    const eventNotifications = allNotifications.filter(
      (notification) => notification.content.data?.eventId === eventId
    );

    for (const notification of eventNotifications) {
      await Notifications.cancelScheduledNotificationAsync(notification.identifier);
    }
  } catch (error) {
    console.error('Error canceling notifications:', error);
  }
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Error canceling all notifications:', error);
  }
}

/**
 * Reschedule notifications for all events
 */
export async function rescheduleAllNotifications(
  events: ScheduleEvent[],
  selectedDate: Date
): Promise<void> {
  try {
    const settings = await getNotificationSettings();

    console.log('=== Rescheduling Notifications ===');
    console.log('Settings:', settings);
    console.log('Events count:', events.length);

    // Cancel all existing notifications
    await cancelAllNotifications();

    if (!settings.enabled) {
      console.log('Notifications disabled, skipping schedule');
      return;
    }

    // Schedule notifications for each event
    for (const event of events) {
      console.log(`Processing event: ${event.title}, recurring: ${event.is_recurring}, date: ${event.date}`);

      if (event.is_recurring) {
        const ids = await scheduleRecurringNotifications(event, settings);
        console.log(`  Scheduled ${ids.length} recurring notifications`);
      } else if (event.date) {
        const eventDate = new Date(event.date);
        const notificationId = await scheduleEventNotification(event, eventDate, settings);
        console.log(`  Scheduled single notification: ${notificationId}`);
      } else {
        // For events displayed on selectedDate but without explicit date (from filtering)
        const notificationId = await scheduleEventNotification(event, selectedDate, settings);
        console.log(`  Scheduled notification for selected date: ${notificationId}`);
      }
    }

    // Debug: show all scheduled notifications
    const allScheduled = await Notifications.getAllScheduledNotificationsAsync();
    console.log(`Total scheduled notifications: ${allScheduled.length}`);
    allScheduled.forEach((n, i) => {
      const trigger = n.trigger as any;
      console.log(`  ${i + 1}. ${n.content.title} at ${trigger.type === 'date' ? new Date(trigger.value) : 'unknown'}`);
    });
  } catch (error) {
    console.error('Error rescheduling notifications:', error);
  }
}

/**
 * Format time for display
 */
function formatTime(time: string): string {
  const [hours, minutes] = time.split(':');
  const h = parseInt(hours);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayHour = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${displayHour}:${minutes} ${ampm}`;
}

/**
 * Get count of scheduled notifications
 */
export async function getScheduledNotificationCount(): Promise<number> {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications.length;
  } catch (error) {
    console.error('Error getting notification count:', error);
    return 0;
  }
}
