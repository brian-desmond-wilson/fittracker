import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

/**
 * Debug utility to check notification status
 */
export async function debugNotifications() {
  console.log('=== Notification Debug Info ===');

  // Check if running on physical device
  const isDevice = Device.isDevice;
  console.log('Is Physical Device:', isDevice);
  if (!isDevice) {
    console.log('⚠️ Notifications only work on physical devices, not simulators!');
  }

  // Check permissions
  const { status } = await Notifications.getPermissionsAsync();
  console.log('Permission Status:', status);

  // Get all scheduled notifications
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  console.log('Total Scheduled Notifications:', scheduled.length);

  if (scheduled.length > 0) {
    console.log('\nScheduled Notifications:');
    scheduled.forEach((notification, index) => {
      const trigger = notification.trigger as any;
      const triggerDate = trigger.type === 'date' ? new Date(trigger.value) : 'Unknown';
      console.log(`\n${index + 1}. ${notification.content.title}`);
      console.log(`   ID: ${notification.identifier}`);
      console.log(`   Trigger: ${triggerDate}`);
      console.log(`   Event ID: ${notification.content.data?.eventId}`);
      console.log(`   Body: ${notification.content.body}`);
    });
  } else {
    console.log('⚠️ No notifications are currently scheduled!');
  }

  console.log('\n=== End Debug Info ===');

  return {
    isDevice,
    permissionStatus: status,
    scheduledCount: scheduled.length,
    scheduledNotifications: scheduled,
  };
}
