import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Switch,
  ScrollView,
} from 'react-native';
import { X, Bell, Check } from 'lucide-react-native';
import {
  getNotificationSettings,
  saveNotificationSettings,
  NotificationSettings as NotificationSettingsType,
} from '../../services/notificationService';

interface NotificationSettingsProps {
  visible: boolean;
  onClose: () => void;
  onSave: (settings: NotificationSettingsType) => void;
}

const REMINDER_OPTIONS = [
  { value: 0, label: 'At event time' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
];

export function NotificationSettings({
  visible,
  onClose,
  onSave,
}: NotificationSettingsProps) {
  const [enabled, setEnabled] = useState(true);
  const [minutesBefore, setMinutesBefore] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (visible) {
      loadSettings();
    }
  }, [visible]);

  async function loadSettings() {
    setLoading(true);
    const settings = await getNotificationSettings();
    setEnabled(settings.enabled);
    setMinutesBefore(settings.minutesBefore);
    setLoading(false);
  }

  async function handleSave() {
    const settings: NotificationSettingsType = {
      enabled,
      minutesBefore,
    };

    await saveNotificationSettings(settings);
    onSave(settings);
    onClose();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <View style={styles.iconContainer}>
              <Bell size={32} color="#22C55E" />
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.title}>Notification Settings</Text>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Enable/Disable Notifications */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Enable Notifications</Text>
                <Text style={styles.settingDescription}>
                  Receive reminders for your scheduled events
                </Text>
              </View>
              <Switch
                value={enabled}
                onValueChange={setEnabled}
                trackColor={{ false: '#374151', true: '#22C55E' }}
                thumbColor="#FFFFFF"
              />
            </View>

            {/* Reminder Time */}
            {enabled && (
              <>
                <Text style={styles.sectionTitle}>Reminder Time</Text>
                <View style={styles.optionsContainer}>
                  {REMINDER_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.optionButton,
                        minutesBefore === option.value &&
                          styles.optionButtonSelected,
                      ]}
                      onPress={() => setMinutesBefore(option.value)}
                    >
                      <Text
                        style={[
                          styles.optionText,
                          minutesBefore === option.value &&
                            styles.optionTextSelected,
                        ]}
                      >
                        {option.label}
                      </Text>
                      {minutesBefore === option.value && (
                        <Check size={16} color="#0A0F1E" />
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}

            {/* Info */}
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Notifications will be scheduled for all your events. You can mark
                events as complete or snooze them directly from the notification.
              </Text>
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={loading}
            >
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 500,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#374151',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButton: {
    padding: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 24,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    gap: 16,
  },
  settingInfo: {
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  optionsContainer: {
    gap: 8,
    marginBottom: 24,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#374151',
  },
  optionButtonSelected: {
    backgroundColor: '#22C55E',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#D1D5DB',
  },
  optionTextSelected: {
    color: '#0A0F1E',
  },
  infoBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoText: {
    fontSize: 14,
    color: '#D1D5DB',
    lineHeight: 20,
  },
  saveButton: {
    backgroundColor: '#22C55E',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0A0F1E',
  },
});
