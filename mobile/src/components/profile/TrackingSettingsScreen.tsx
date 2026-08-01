// mobile/src/components/profile/TrackingSettingsScreen.tsx
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "@/src/lib/supabase";
import {
  dateFromHhmm,
  formatTimeLabel,
  hhmmAscending,
  hhmmFromDate,
} from "@/src/lib/timeFields";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card, Screen, SectionHeader } from "@/src/components/ui";

interface TrackingSettingsScreenProps {
  userId: string;
  initialData: {
    breakfast_time: string; // "HH:MM"
    lunch_time: string;
    dinner_time: string;
    water_window_start: string;
    water_window_end: string;
    water_display_unit: "oz" | "L";
    water_only_counts: boolean;
  };
  onClose: () => void;
  onSave: () => void;
}

type PickerTarget = "breakfast" | "lunch" | "dinner" | "start" | "end";

const PICKER_TITLES: Record<PickerTarget, string> = {
  breakfast: "Breakfast Time",
  lunch: "Lunch Time",
  dinner: "Dinner Time",
  start: "Window Start",
  end: "Window End",
};

// Narrowed to the string-valued time fields only — typing this as
// `keyof initialData` would admit the boolean `water_only_counts` and break
// the computed-key string assignment in applyPicker.
type TimeFieldKey =
  | "breakfast_time"
  | "lunch_time"
  | "dinner_time"
  | "water_window_start"
  | "water_window_end";

const PICKER_FIELDS: Record<PickerTarget, TimeFieldKey> = {
  breakfast: "breakfast_time",
  lunch: "lunch_time",
  dinner: "dinner_time",
  start: "water_window_start",
  end: "water_window_end",
};

export function TrackingSettingsScreen({
  userId,
  initialData,
  onClose,
  onSave,
}: TrackingSettingsScreenProps) {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerTarget, setPickerTarget] = useState<PickerTarget | null>(null);

  const pickerValue = (t: PickerTarget): string => formData[PICKER_FIELDS[t]] as string;

  const applyPicker = (t: PickerTarget, hhmm: string) =>
    setFormData((prev) => ({ ...prev, [PICKER_FIELDS[t]]: hhmm }));

  const handleSave = async () => {
    setError(null);
    if (!hhmmAscending(formData.breakfast_time, formData.lunch_time, formData.dinner_time)) {
      setError("Meal times must be in order: breakfast, then lunch, then dinner.");
      return;
    }
    if (!hhmmAscending(formData.water_window_start, formData.water_window_end)) {
      setError("Water window end must be after its start.");
      return;
    }
    try {
      setSaving(true);
      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          breakfast_time: formData.breakfast_time,
          lunch_time: formData.lunch_time,
          dinner_time: formData.dinner_time,
          water_window_start: formData.water_window_start,
          water_window_end: formData.water_window_end,
          water_display_unit: formData.water_display_unit,
          water_only_counts: formData.water_only_counts,
        })
        .eq("id", userId);
      if (dbError) throw dbError;
      onSave();
      onClose();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const timeField = (label: string, target: PickerTarget) => (
    <View style={styles.halfField}>
      <Text style={styles.subLabel}>{label}</Text>
      <TouchableOpacity
        style={styles.input}
        onPress={() => setPickerTarget(target)}
        disabled={saving}
        accessibilityRole="button"
        accessibilityLabel={`${PICKER_TITLES[target]}: ${formatTimeLabel(pickerValue(target))}`}
      >
        <Text style={styles.timeButtonText}>{formatTimeLabel(pickerValue(target))}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen variant="detail" title="Tracking Settings" onBack={onClose} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader title="Meal Times" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.fieldHelp}>
              When you typically eat. The pace coach uses these to suggest catch-up
              amounts by your next meal.
            </Text>
            <View style={styles.row}>
              {timeField("Breakfast", "breakfast")}
              {timeField("Lunch", "lunch")}
            </View>
            <View style={styles.row}>
              {timeField("Dinner", "dinner")}
              <View style={styles.halfField} />
            </View>
          </Card>

          <SectionHeader title="Water" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.label}>Pace Window</Text>
            <Text style={styles.fieldHelp}>
              Hours we use to compute your hydration pace each day.
            </Text>
            <View style={styles.row}>
              {timeField("Start", "start")}
              {timeField("End", "end")}
            </View>

            <View style={styles.labelRow}>
              <Text style={styles.labelInline}>Display Water In</Text>
              <View style={styles.segmentTrack}>
                {(["oz", "L"] as const).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.segment,
                      formData.water_display_unit === unit && styles.segmentActive,
                    ]}
                    onPress={() => setFormData({ ...formData, water_display_unit: unit })}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Display water in ${unit}`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        formData.water_display_unit === unit && styles.segmentTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <Text style={styles.fieldHelp}>
              Where you see water amounts on the Water Intake screen.
            </Text>

            <View style={styles.switchRow}>
              <View style={styles.flex}>
                {/* Rule 19: a label beside a control in a row is row copy, not
                    a section label. */}
                <Text style={styles.switchLabel}>Only Water Counts</Text>
                <Text style={styles.fieldHelp}>
                  When on, coffee/tea/juice/other don't count toward your daily goal
                  or streaks. They still show up in History.
                </Text>
              </View>
              <Switch
                value={formData.water_only_counts}
                onValueChange={(v) => setFormData({ ...formData, water_only_counts: v })}
                trackColor={{ false: colors.surface2, true: colors.brand }}
                thumbColor={colors.onBrand}
                disabled={saving}
              />
            </View>
          </Card>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Save Changes" onPress={handleSave} loading={saving} fluid />
        </ScrollView>
      </KeyboardAvoidingView>

      {Platform.OS === "ios" ? (
        <Modal
          visible={pickerTarget !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerTarget(null)}
        >
          <View style={styles.backdrop}>
            <Card variant="panel" style={styles.sheetCard}>
              <Text style={styles.sheetTitle}>
                {pickerTarget ? PICKER_TITLES[pickerTarget] : ""}
              </Text>
              <DateTimePicker
                value={dateFromHhmm(pickerTarget ? pickerValue(pickerTarget) : "08:00")}
                mode="time"
                display="spinner"
                onChange={(_e, picked) => {
                  if (picked && pickerTarget) applyPicker(pickerTarget, hhmmFromDate(picked));
                }}
                textColor={colors.text}
              />
              <Button label="Done" onPress={() => setPickerTarget(null)} fluid />
            </Card>
          </View>
        </Modal>
      ) : (
        pickerTarget !== null && (
          <DateTimePicker
            value={dateFromHhmm(pickerValue(pickerTarget))}
            mode="time"
            display="default"
            onChange={(_e, picked) => {
              const target = pickerTarget;
              setPickerTarget(null);
              if (picked && target) applyPicker(target, hhmmFromDate(picked));
            }}
          />
        )
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: { marginBottom: spacing.sm },
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  labelInline: { ...typography.section, marginTop: 0, marginBottom: 0 },
  subLabel: { ...typography.caption, marginBottom: spacing.xs },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see STYLE_GUIDE §6
    color: colors.text,
  },
  timeButtonText: { fontSize: 16, color: colors.text }, // matches input text size
  row: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.sm },
  halfField: { flex: 1 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: 2,
    gap: 2,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.control - 2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.buttonSm, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  switchRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  switchLabel: { ...typography.body, color: colors.text, fontWeight: "600" },
  fieldHelp: { ...typography.caption, marginBottom: spacing.sm },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheetCard: { width: "100%", maxHeight: "100%", gap: spacing.md },
  sheetTitle: { ...typography.titleBar, color: colors.text, textAlign: "center" },
});
