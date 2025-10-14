import { useEffect, useState, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import {
  requestPermissions,
  getNotificationSettings,
  scheduleEventNotification,
  scheduleRecurringNotifications,
  cancelEventNotifications,
  rescheduleAllNotifications,
  NotificationSettings,
} from '../services/notificationService';
import { ScheduleEvent } from '../types/schedule';

export function useNotifications() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [hasPermission, setHasPermission] = useState(false);
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  // Load settings and request permissions on mount
  useEffect(() => {
    async function initialize() {
      const granted = await requestPermissions();
      setHasPermission(granted);

      const loadedSettings = await getNotificationSettings();
      setSettings(loadedSettings);
    }

    initialize();
  }, []);

  // Set up notification listeners
  useEffect(() => {
    // Listener for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification received:', notification);
    });

    // Listener for when user interacts with notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(
      async (response) => {
        const { actionIdentifier, notification } = response;
        const eventId = notification.request.content.data?.eventId;

        if (!eventId) return;

        try {
          if (actionIdentifier === 'MARK_COMPLETE') {
            // Mark event as completed
            await supabase
              .from('schedule_events')
              .update({ status: 'completed' })
              .eq('id', eventId);
          } else if (actionIdentifier === 'SNOOZE') {
            // Reschedule notification for 5 minutes later
            const snoozeDate = new Date();
            snoozeDate.setMinutes(snoozeDate.getMinutes() + 5);

            await Notifications.scheduleNotificationAsync({
              content: notification.request.content,
              trigger: {
                date: snoozeDate,
              },
            });
          }
        } catch (error) {
          console.error('Error handling notification action:', error);
        }
      }
    );

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  // Schedule notification for an event
  const scheduleNotification = useCallback(
    async (event: ScheduleEvent, date: Date) => {
      if (!settings || !hasPermission) return;

      if (event.is_recurring) {
        await scheduleRecurringNotifications(event, settings);
      } else {
        await scheduleEventNotification(event, date, settings);
      }
    },
    [settings, hasPermission]
  );

  // Cancel notifications for an event
  const cancelNotification = useCallback(async (eventId: string) => {
    await cancelEventNotifications(eventId);
  }, []);

  // Reschedule all notifications
  const rescheduleAll = useCallback(
    async (events: ScheduleEvent[], selectedDate: Date) => {
      if (!settings || !hasPermission) return;
      await rescheduleAllNotifications(events, selectedDate);
    },
    [settings, hasPermission]
  );

  // Update settings and reschedule
  const updateSettings = useCallback(
    async (newSettings: NotificationSettings, events: ScheduleEvent[], selectedDate: Date) => {
      setSettings(newSettings);
      await rescheduleAllNotifications(events, selectedDate);
    },
    []
  );

  return {
    settings,
    hasPermission,
    scheduleNotification,
    cancelNotification,
    rescheduleAll,
    updateSettings,
  };
}
