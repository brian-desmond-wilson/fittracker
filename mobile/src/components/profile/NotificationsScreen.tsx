import { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  ScrollView,
  Switch,
  Alert,
  Linking,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { ChevronLeft, Plus, Trash2 } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/src/lib/supabase";
import { syncWaterReminders } from "@/src/services/waterReminderService";

interface NotificationsScreenProps {
  onClose: () => void;
}

function formatTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  if (isNaN(h)) return hhmm;
  const ampm = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

function hhmmFromDate(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dateFromHhmm(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map((s) => parseInt(s, 10));
  const d = new Date();
  d.setHours(h, m || 0, 0, 0);
  return d;
}

function sortTimes(times: string[]): string[] {
  return [...times].sort();
}

export function NotificationsScreen({ onClose }: NotificationsScreenProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [times, setTimes] = useState<string[]>([]);
  const [picker, setPicker] = useState<{ mode: "add" | "edit"; index: number | null; value: Date } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("water_reminders_enabled, water_reminder_times")
          .eq("id", user.id)
          .single();
        if (data) {
          setEnabled(!!data.water_reminders_enabled);
          setTimes(
            Array.isArray(data.water_reminder_times) && data.water_reminder_times.length > 0
              ? sortTimes(data.water_reminder_times)
              : ["08:00", "12:00", "16:00", "20:00"]
          );
        }
      } catch (error) {
        console.error("Loading reminder settings failed:", error);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (nextEnabled: boolean, nextTimes: string[]) => {
    try {
      setSaving(true);
      const sorted = sortTimes(nextTimes);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          water_reminders_enabled: nextEnabled,
          water_reminder_times: sorted,
        })
        .eq("id", user.id);
      if (error) throw error;
      const result = await syncWaterReminders(nextEnabled, sorted);
      if (!result.ok && result.permissionDenied) {
        Alert.alert(
          "Notifications Disabled",
          "Enable notifications for FitTracker in Settings to receive water reminders.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        // Roll back the enabled flag in DB if perms denied
        await supabase
          .from("profiles")
          .update({ water_reminders_enabled: false })
          .eq("id", user.id);
        setEnabled(false);
        return;
      }
      setEnabled(nextEnabled);
      setTimes(sorted);
    } catch (error) {
      console.error("Saving reminder settings failed:", error);
      Alert.alert("Error", "Failed to save reminder settings");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (value: boolean) => {
    persist(value, times);
  };

  const handleAddTime = () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    setPicker({ mode: "add", index: null, value: d });
  };

  const handleEditTime = (i: number) => {
    setPicker({ mode: "edit", index: i, value: dateFromHhmm(times[i]) });
  };

  const handleRemoveTime = (i: number) => {
    if (times.length <= 1) {
      Alert.alert("At least one time required", "Disable reminders to remove the last time.");
      return;
    }
    const next = times.filter((_, idx) => idx !== i);
    persist(enabled, next);
  };

  const onPickerChange = (_event: any, picked?: Date) => {
    if (!picker) return;
    if (!picked) {
      setPicker(null);
      return;
    }
    if (Platform.OS === "android") {
      const hhmm = hhmmFromDate(picked);
      const next =
        picker.mode === "add"
          ? [...times, hhmm]
          : times.map((t, i) => (i === picker.index ? hhmm : t));
      setPicker(null);
      // De-dupe identical times
      persist(enabled, Array.from(new Set(next)));
      return;
    }
    // iOS: live-update the picker draft; commit when Done is pressed
    setPicker({ ...picker, value: picked });
  };

  const commitPicker = () => {
    if (!picker) return;
    const hhmm = hhmmFromDate(picker.value);
    const next =
      picker.mode === "add"
        ? [...times, hhmm]
        : times.map((t, i) => (i === picker.index ? hhmm : t));
    setPicker(null);
    persist(enabled, Array.from(new Set(next)));
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Profile</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={styles.pageTitle}>Notifications</Text>
          <Text style={styles.pageSubtitle}>
            Manage your notification preferences
          </Text>

          {loading ? (
            <ActivityIndicator color="#22C55E" style={{ marginTop: 24 }} />
          ) : (
            <View style={styles.card}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Water Reminders</Text>
                  <Text style={styles.cardSubtitle}>
                    Daily prompts at the times you choose.
                  </Text>
                </View>
                <Switch
                  value={enabled}
                  onValueChange={handleToggle}
                  trackColor={{ false: "#374151", true: "#3B82F6" }}
                  thumbColor="#FFFFFF"
                  disabled={saving}
                />
              </View>

              {enabled && (
                <View style={styles.timesSection}>
                  {times.map((t, i) => (
                    <View key={`${t}-${i}`} style={styles.timeRow}>
                      <TouchableOpacity
                        onPress={() => handleEditTime(i)}
                        style={styles.timeButton}
                        disabled={saving}
                      >
                        <Text style={styles.timeButtonText}>{formatTimeLabel(t)}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleRemoveTime(i)}
                        style={styles.removeButton}
                        disabled={saving || times.length <= 1}
                      >
                        <Trash2 size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {times.length < 12 && (
                    <TouchableOpacity
                      onPress={handleAddTime}
                      style={styles.addTimeButton}
                      disabled={saving}
                    >
                      <Plus size={18} color="#22C55E" />
                      <Text style={styles.addTimeText}>Add Reminder Time</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Time picker modal */}
        {Platform.OS === "ios" ? (
          <Modal
            visible={picker !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setPicker(null)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  {picker?.mode === "add" ? "New Reminder" : "Edit Reminder"}
                </Text>
                {picker && (
                  <DateTimePicker
                    value={picker.value}
                    mode="time"
                    display="spinner"
                    onChange={onPickerChange}
                    textColor="#FFFFFF"
                  />
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={() => setPicker(null)}
                  >
                    <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonPrimary]}
                    onPress={commitPicker}
                  >
                    <Text style={styles.modalButtonPrimaryText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          picker !== null && (
            <DateTimePicker
              value={picker.value}
              mode="time"
              display="default"
              onChange={onPickerChange}
            />
          )
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  contentInner: {
    padding: 16,
    paddingBottom: 60,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    color: "#9CA3AF",
    marginBottom: 24,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#9CA3AF",
    marginTop: 4,
  },
  timesSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#1F2937",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 8,
  },
  timeButton: {
    flex: 1,
    backgroundColor: "#1F2937",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  timeButtonText: {
    fontSize: 16,
    color: "#FFFFFF",
  },
  removeButton: {
    padding: 8,
  },
  addTimeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    marginTop: 4,
  },
  addTimeText: {
    color: "#22C55E",
    fontSize: 15,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    gap: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
    textAlign: "center",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonPrimary: {
    backgroundColor: "#3B82F6",
  },
  modalButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  modalButtonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalButtonSecondaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
