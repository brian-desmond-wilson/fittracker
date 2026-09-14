// mobile/src/components/training/workout-detail/AddToDayButton.tsx
// "Add to a day" (spec 2026-09-13 §4.10): the outlined second action under
// Start. Opens a sheet — Today, Tomorrow, Pick a date… — then reads that
// day, plans, asks when the plan says to, and adopts the workout for the
// date without starting it. The date picker comes up as a sheet, never
// inline (WhenSheet's rule). Today hands a toast to the Today tab and
// navigates there; any other day confirms in place under the button.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { CalendarPlus } from "lucide-react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { handOffToast } from "@/src/components/ui/pendingToast";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { getLocalDateString, parseLocalDate, addDays } from "@/src/lib/dates";
import { formatShortDate } from "@/src/lib/exerciseHistory";
import { planAddToDay, ADD_TO_DAY_LABEL } from "@/src/lib/addWorkoutToDayPlan";
import type { AddToDayPlan } from "@/src/lib/addWorkoutToDayPlan";
import { readDayState, executeAddToDay } from "@/src/lib/supabase/addWorkoutToDay";

interface AddToDayButtonProps {
  userId: string;
  workoutId: string;
  workoutName: string;
  /** Fired after a successful write for TODAY; the page navigates to Today. */
  onAddedToday: () => void;
}

type Sheet =
  | { kind: "closed" }
  | { kind: "choose" }
  | { kind: "date" }
  | { kind: "confirm"; date: string; label: string; plan: AddToDayPlan };

/** "Today", "Tomorrow", else the short date ("14 Sep"). */
function labelFor(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === getLocalDateString(addDays(parseLocalDate(today), 1))) return "Tomorrow";
  return formatShortDate(date, today);
}

export function AddToDayButton({ userId, workoutId, workoutName, onAddedToday }: AddToDayButtonProps) {
  const [sheet, setSheet] = useState<Sheet>({ kind: "closed" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // iOS spins in place and reports every turn; Android returns once, on Set.
  const [pickerDraft, setPickerDraft] = useState<Date>(() => new Date());

  const close = () => setSheet({ kind: "closed" });

  const run = async (date: string, today: string, label: string, plan: AddToDayPlan) => {
    setBusy(true);
    const result = await executeAddToDay({ userId, workoutId, date, today, dayLabel: label, plan });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    if (label === "Today") {
      handOffToast({ title: "Added to today", detail: `${workoutName} is today's session.` });
      onAddedToday();
      return;
    }
    setDone(`Added to ${label}`);
  };

  /** `today` is sampled once per tap by the caller — the app's no-two-clocks rule. */
  const choose = async (date: string, today: string) => {
    const label = labelFor(date, today);
    setBusy(true);
    setError(null);
    setDone(null);
    let plan: AddToDayPlan;
    try {
      plan = planAddToDay(await readDayState(userId, workoutId, date), label);
    } catch (e) {
      console.error("AddToDayButton read failed:", e);
      setBusy(false);
      close();
      setError("Couldn't read that day. Check your connection and try again.");
      return;
    }
    setBusy(false);
    if (plan.action === "disabled") {
      close();
      setError(plan.label);
      return;
    }
    if (plan.confirm) {
      setSheet({ kind: "confirm", date, label, plan });
      return;
    }
    close();
    await run(date, today, label, plan);
  };

  const onPress = () => {
    if (busy) return;
    setError(null);
    setDone(null);
    setSheet({ kind: "choose" });
  };

  const today = getLocalDateString();
  const tomorrow = getLocalDateString(addDays(parseLocalDate(today), 1));

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, busy && styles.buttonBusy]}
        onPress={onPress}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={ADD_TO_DAY_LABEL}
        accessibilityState={{ busy }}
      >
        {busy
          ? <ActivityIndicator size="small" color={colors.brand} />
          : (
            <>
              <CalendarPlus size={18} color={colors.brand} />
              <Text style={styles.buttonText}>{ADD_TO_DAY_LABEL}</Text>
            </>
          )}
      </TouchableOpacity>
      {done && <Text style={styles.done}>{done}</Text>}
      {error && <Text style={styles.error}>{error}</Text>}

      {/* Which day */}
      <BottomSheet visible={sheet.kind === "choose"} onClose={close} closeLabel="Cancel adding to a day">
        <Text style={styles.sheetTitle}>Add {workoutName} to…</Text>
        {[
          { label: "Today", date: today },
          { label: "Tomorrow", date: tomorrow },
        ].map((o) => (
          <TouchableOpacity key={o.label} style={styles.option} onPress={() => choose(o.date, today)}
            accessibilityRole="button" accessibilityLabel={o.label}>
            <Text style={styles.optionText}>{o.label}</Text>
            <Text style={styles.optionSub}>{formatShortDate(o.date, today)}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity
          style={[styles.option, styles.optionLast]}
          onPress={() => {
            setPickerDraft(addDays(parseLocalDate(today), 2));
            setSheet({ kind: "date" });
          }}
          accessibilityRole="button"
          accessibilityLabel="Pick a date"
        >
          <Text style={styles.optionText}>Pick a date…</Text>
        </TouchableOpacity>
      </BottomSheet>

      {/* Which date — a sheet on iOS, the platform dialog on Android */}
      {sheet.kind === "date" && Platform.OS !== "ios" && (
        <DateTimePicker
          value={pickerDraft}
          mode="date"
          display="default"
          minimumDate={parseLocalDate(today)}
          onChange={(_e, picked) => {
            close();
            if (picked) choose(getLocalDateString(picked), today);
          }}
        />
      )}
      {Platform.OS === "ios" && (
        <BottomSheet visible={sheet.kind === "date"} onClose={close} closeLabel="Cancel picking a date" style={styles.pickerSheet}>
          <View style={styles.pickerHead}>
            <Text style={styles.sheetTitle}>Which day?</Text>
            <TouchableOpacity
              onPress={() => { close(); choose(getLocalDateString(pickerDraft), today); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={styles.doneLink}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={pickerDraft}
            mode="date"
            display="spinner"
            minimumDate={parseLocalDate(today)}
            onChange={(_e, picked) => { if (picked) setPickerDraft(picked); }}
            textColor={colors.text}
          />
        </BottomSheet>
      )}

      {/* The plan wants a word first */}
      <BottomSheet visible={sheet.kind === "confirm"} onClose={close} closeLabel="Cancel">
        {sheet.kind === "confirm" && (
          <>
            <Text style={styles.sheetTitle}>{sheet.plan.confirm!.title}</Text>
            <Text style={styles.sheetBody}>{sheet.plan.confirm!.body}</Text>
            <View style={styles.sheetActions}>
              <TouchableOpacity style={styles.sheetCancel} onPress={close} accessibilityRole="button">
                <Text style={styles.sheetCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sheetGo}
                accessibilityRole="button"
                onPress={() => {
                  const { date, label, plan } = sheet;
                  close();
                  run(date, today, label, plan);
                }}
              >
                <Text style={styles.sheetGoText}>{sheet.plan.confirm!.go}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md },
  button: {
    height: 52, borderRadius: radii.control, borderWidth: 1, borderColor: colors.brand,
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center",
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: colors.brand, ...typography.button },
  done: { fontSize: 13, color: colors.brand, textAlign: "center", marginTop: spacing.sm, fontWeight: "600" },
  error: { fontSize: 13, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  sheetBody: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  option: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  optionLast: { borderBottomWidth: 0, marginBottom: spacing.md },
  optionText: { fontSize: 16, fontWeight: "600", color: colors.text },
  optionSub: { fontSize: 13, color: colors.textMuted },
  pickerSheet: { paddingHorizontal: spacing.screenGutter, paddingTop: spacing.screenGutter, gap: spacing.md },
  pickerHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  doneLink: { ...typography.buttonSm, color: colors.brand, fontWeight: "700" },
  sheetActions: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sheetCancel: {
    flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  sheetCancelText: { color: colors.text, ...typography.button },
  sheetGo: { flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  sheetGoText: { color: colors.onBrand, ...typography.button },
});
