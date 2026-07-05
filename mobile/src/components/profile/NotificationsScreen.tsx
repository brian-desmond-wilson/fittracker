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
import { ChevronLeft, Plus, Trash2, BellRing } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/src/lib/supabase";
import {
  syncWaterReminders,
  sendTestWaterReminder,
} from "@/src/services/waterReminderService";
import {
  syncMealReminders,
  sendTestMealReminder,
} from "@/src/services/mealReminderService";
import { MealType } from "@/src/types/track";

const MEAL_TYPE_OPTIONS: MealType[] = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
];

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

  // Meal reminders (parallel state to water)
  const [mealEnabled, setMealEnabled] = useState(false);
  const [mealTimes, setMealTimes] = useState<string[]>([]);
  const [mealTypes, setMealTypes] = useState<MealType[]>([]);
  const [mealSaving, setMealSaving] = useState(false);
  const [mealPicker, setMealPicker] = useState<
    | {
        mode: "add" | "edit";
        index: number | null;
        value: Date;
        mealType: MealType;
      }
    | null
  >(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select(
            "water_reminders_enabled, water_reminder_times, meal_reminders_enabled, meal_reminder_times, meal_reminder_types"
          )
          .eq("id", user.id)
          .single();
        if (data) {
          setEnabled(!!data.water_reminders_enabled);
          setTimes(
            Array.isArray(data.water_reminder_times) && data.water_reminder_times.length > 0
              ? sortTimes(data.water_reminder_times)
              : ["08:00", "12:00", "16:00", "20:00"]
          );
          setMealEnabled(!!data.meal_reminders_enabled);
          const loadedTimes: string[] =
            Array.isArray(data.meal_reminder_times) && data.meal_reminder_times.length > 0
              ? data.meal_reminder_times
              : ["08:00", "12:00", "18:00"];
          const loadedTypes: MealType[] =
            Array.isArray(data.meal_reminder_types) && data.meal_reminder_types.length > 0
              ? (data.meal_reminder_types as MealType[])
              : (["breakfast", "lunch", "dinner"] as MealType[]);
          // Sort times together with their types
          const paired = loadedTimes.map((t, i) => ({
            time: t,
            type: loadedTypes[i] ?? "snack",
          }));
          paired.sort((a, b) => a.time.localeCompare(b.time));
          setMealTimes(paired.map((p) => p.time));
          setMealTypes(paired.map((p) => p.type));
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

  const persistMeals = async (
    nextEnabled: boolean,
    nextTimes: string[],
    nextTypes: MealType[],
  ) => {
    try {
      setMealSaving(true);
      // Sort time+type pairs together so DB order matches UI order
      const paired = nextTimes.map((t, i) => ({
        time: t,
        type: nextTypes[i] ?? "snack",
      }));
      paired.sort((a, b) => a.time.localeCompare(b.time));
      const sortedTimes = paired.map((p) => p.time);
      const sortedTypes = paired.map((p) => p.type);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          meal_reminders_enabled: nextEnabled,
          meal_reminder_times: sortedTimes,
          meal_reminder_types: sortedTypes,
        })
        .eq("id", user.id);
      if (error) throw error;
      const result = await syncMealReminders(nextEnabled, sortedTimes, sortedTypes);
      if (!result.ok && result.permissionDenied) {
        Alert.alert(
          "Notifications Disabled",
          "Enable notifications for FitTracker in Settings to receive meal reminders.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Open Settings", onPress: () => Linking.openSettings() },
          ]
        );
        await supabase
          .from("profiles")
          .update({ meal_reminders_enabled: false })
          .eq("id", user.id);
        setMealEnabled(false);
        return;
      }
      setMealEnabled(nextEnabled);
      setMealTimes(sortedTimes);
      setMealTypes(sortedTypes);
    } catch (error) {
      console.error("Saving meal reminder settings failed:", error);
      Alert.alert("Error", "Failed to save meal reminder settings");
    } finally {
      setMealSaving(false);
    }
  };

  const handleMealToggle = (value: boolean) =>
    persistMeals(value, mealTimes, mealTypes);

  const handleMealAddTime = () => {
    const d = new Date();
    d.setHours(15, 0, 0, 0);
    setMealPicker({ mode: "add", index: null, value: d, mealType: "snack" });
  };

  const handleMealEditTime = (i: number) => {
    setMealPicker({
      mode: "edit",
      index: i,
      value: dateFromHhmm(mealTimes[i]),
      mealType: mealTypes[i] ?? "snack",
    });
  };

  const handleMealRemoveTime = (i: number) => {
    if (mealTimes.length <= 1) {
      Alert.alert(
        "At least one time required",
        "Disable meal reminders to remove the last time."
      );
      return;
    }
    persistMeals(
      mealEnabled,
      mealTimes.filter((_, idx) => idx !== i),
      mealTypes.filter((_, idx) => idx !== i),
    );
  };

  const onMealPickerChange = (_event: any, picked?: Date) => {
    if (!mealPicker) return;
    if (!picked) {
      setMealPicker(null);
      return;
    }
    if (Platform.OS === "android") {
      const hhmm = hhmmFromDate(picked);
      const isAdd = mealPicker.mode === "add";
      const nextTimes = isAdd
        ? [...mealTimes, hhmm]
        : mealTimes.map((t, i) => (i === mealPicker.index ? hhmm : t));
      const nextTypes = isAdd
        ? [...mealTypes, mealPicker.mealType]
        : mealTypes;
      setMealPicker(null);
      persistMeals(mealEnabled, nextTimes, nextTypes);
      return;
    }
    setMealPicker({ ...mealPicker, value: picked });
  };

  const commitMealPicker = () => {
    if (!mealPicker) return;
    const hhmm = hhmmFromDate(mealPicker.value);
    const isAdd = mealPicker.mode === "add";
    const nextTimes = isAdd
      ? [...mealTimes, hhmm]
      : mealTimes.map((t, i) => (i === mealPicker.index ? hhmm : t));
    const nextTypes = isAdd
      ? [...mealTypes, mealPicker.mealType]
      : mealTypes.map((t, i) =>
          i === mealPicker.index ? mealPicker.mealType : t,
        );
    setMealPicker(null);
    persistMeals(mealEnabled, nextTimes, nextTypes);
  };

  const handleMealTestReminder = async () => {
    const result = await sendTestMealReminder();
    if (result.ok) {
      Alert.alert(
        "Test sent",
        "A test reminder should appear in about a second. If you don't see it, check your system notification settings."
      );
    } else if (result.permissionDenied) {
      Alert.alert(
        "Notifications Disabled",
        "Enable notifications for FitTracker in Settings to receive meal reminders.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
    } else {
      Alert.alert("Error", "Failed to send test reminder");
    }
  };

  const handleTestReminder = async () => {
    const result = await sendTestWaterReminder();
    if (result.ok) {
      Alert.alert(
        "Test sent",
        "A test reminder should appear in about a second. If you don't see it, check your system notification settings."
      );
    } else if (result.permissionDenied) {
      Alert.alert(
        "Notifications Disabled",
        "Enable notifications for FitTracker in Settings to receive water reminders.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Open Settings", onPress: () => Linking.openSettings() },
        ]
      );
    } else {
      Alert.alert("Error", "Failed to send test reminder");
    }
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
                  <TouchableOpacity
                    onPress={handleTestReminder}
                    style={styles.testButton}
                    activeOpacity={0.7}
                  >
                    <BellRing size={16} color="#3B82F6" />
                    <Text style={styles.testButtonText}>Send Test Reminder</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Meal Reminders */}
          {!loading && (
            <View style={[styles.card, { marginTop: 16 }]}>
              <View style={styles.cardHeaderRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Meal Reminders</Text>
                  <Text style={styles.cardSubtitle}>
                    Daily prompts at your usual meal times. Each reminder is
                    tagged with its meal type.
                  </Text>
                </View>
                <Switch
                  value={mealEnabled}
                  onValueChange={handleMealToggle}
                  trackColor={{ false: "#374151", true: "#F97316" }}
                  thumbColor="#FFFFFF"
                  disabled={mealSaving}
                />
              </View>

              {mealEnabled && (
                <View style={styles.timesSection}>
                  {mealTimes.map((t, i) => (
                    <View key={`${t}-${i}`} style={styles.timeRow}>
                      <TouchableOpacity
                        onPress={() => handleMealEditTime(i)}
                        style={[styles.timeButton, { flexDirection: "row" }]}
                        disabled={mealSaving}
                      >
                        <Text style={styles.timeButtonText}>
                          {formatTimeLabel(t)}
                        </Text>
                        <Text style={styles.mealTypeBadgeInline}>
                          {mealTypes[i] ?? "snack"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => handleMealRemoveTime(i)}
                        style={styles.removeButton}
                        disabled={mealSaving || mealTimes.length <= 1}
                      >
                        <Trash2 size={18} color="#9CA3AF" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {mealTimes.length < 12 && (
                    <TouchableOpacity
                      onPress={handleMealAddTime}
                      style={styles.addTimeButton}
                      disabled={mealSaving}
                    >
                      <Plus size={18} color="#F97316" />
                      <Text style={[styles.addTimeText, { color: "#F97316" }]}>
                        Add Meal Time
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={handleMealTestReminder}
                    style={styles.testButton}
                    activeOpacity={0.7}
                  >
                    <BellRing size={16} color="#F97316" />
                    <Text style={[styles.testButtonText, { color: "#F97316" }]}>
                      Send Test Meal Reminder
                    </Text>
                  </TouchableOpacity>
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

        {/* Meal reminder picker (with meal-type chips) */}
        {Platform.OS === "ios" ? (
          <Modal
            visible={mealPicker !== null}
            transparent
            animationType="fade"
            onRequestClose={() => setMealPicker(null)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>
                  {mealPicker?.mode === "add" ? "New Meal Reminder" : "Edit Meal Reminder"}
                </Text>
                <View style={styles.mealTypeChipsRow}>
                  {MEAL_TYPE_OPTIONS.map((mt) => {
                    const active = mealPicker?.mealType === mt;
                    return (
                      <TouchableOpacity
                        key={mt}
                        onPress={() =>
                          setMealPicker(
                            mealPicker
                              ? { ...mealPicker, mealType: mt }
                              : mealPicker,
                          )
                        }
                        style={[
                          styles.mealTypeChip,
                          active && styles.mealTypeChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.mealTypeChipText,
                            active && styles.mealTypeChipTextActive,
                          ]}
                        >
                          {mt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {mealPicker && (
                  <DateTimePicker
                    value={mealPicker.value}
                    mode="time"
                    display="spinner"
                    onChange={onMealPickerChange}
                    textColor="#FFFFFF"
                  />
                )}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonSecondary]}
                    onPress={() => setMealPicker(null)}
                  >
                    <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.modalButtonPrimary]}
                    onPress={commitMealPicker}
                  >
                    <Text style={styles.modalButtonPrimaryText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        ) : (
          mealPicker !== null && (
            <DateTimePicker
              value={mealPicker.value}
              mode="time"
              display="default"
              onChange={onMealPickerChange}
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
  testButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    backgroundColor: "#1F2937",
  },
  testButtonText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "600",
  },
  mealTypeBadgeInline: {
    marginLeft: 10,
    fontSize: 11,
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    fontWeight: "600",
  },
  mealTypeChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  mealTypeChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
  },
  mealTypeChipActive: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  mealTypeChipText: {
    fontSize: 12,
    color: "#D1D5DB",
    fontWeight: "600",
    textTransform: "capitalize",
  },
  mealTypeChipTextActive: {
    color: "#FFFFFF",
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
