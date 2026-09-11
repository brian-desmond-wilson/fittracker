// mobile/src/components/training/item-detail/AddToTodayButton.tsx
// Spec §4.9: the last thing in the scroll. Reads today's state to pick its
// label, re-reads on the tap (spec §7), confirms un-rest in a bottom sheet,
// shows failure inline under the button and leaves today untouched (spec
// §8). On success it hands a toast to the Today tab and tells the page to
// navigate there.
import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { handOffToast } from "@/src/components/ui/pendingToast";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { getLocalDateString } from "@/src/lib/dates";
import {
  planAddToToday, ADD_TO_TODAY_CAPTION, ADD_TO_TODAY_LABEL, ADDED_TOAST_TITLE,
} from "@/src/lib/addToTodayPlan";
import type { AddToTodayPlan } from "@/src/lib/addToTodayPlan";
import { executeAddToToday, readTodayState } from "@/src/lib/supabase/addToToday";

interface AddToTodayButtonProps {
  userId: string;
  exerciseId: string;
  exerciseName: string;
  /** Fired after a successful write; the page navigates to Today. */
  onAdded: () => void;
}

export function AddToTodayButton({ userId, exerciseId, exerciseName, onAdded }: AddToTodayButtonProps) {
  const [plan, setPlan] = useState<AddToTodayPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const readPlan = useCallback(async (): Promise<AddToTodayPlan> => {
    const state = await readTodayState(userId, exerciseId, getLocalDateString());
    const next = planAddToToday(state);
    setPlan(next);
    return next;
  }, [userId, exerciseId]);

  useEffect(() => {
    let alive = true;
    readPlan().catch((e) => {
      console.error("AddToTodayButton read failed:", e);
      // Fail open to the plain label: the tap re-reads before writing.
      if (alive) setPlan({ action: "create", label: ADD_TO_TODAY_LABEL });
    });
    return () => { alive = false; };
  }, [readPlan]);

  const run = async (chosen: AddToTodayPlan) => {
    setBusy(true);
    setError(null);
    const result = await executeAddToToday({
      userId, exerciseId, date: getLocalDateString(), plan: chosen,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    handOffToast({ title: ADDED_TOAST_TITLE, detail: `${exerciseName} is in today's main block.` });
    onAdded();
  };

  const onPress = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    let fresh: AddToTodayPlan;
    try {
      fresh = await readPlan(); // spec §7: re-read immediately before writing
    } catch (e) {
      console.error("AddToTodayButton re-read failed:", e);
      setBusy(false);
      setError("Couldn't read today. Check your connection and try again.");
      return;
    }
    if (fresh.action === "disabled") { setBusy(false); return; }
    if (fresh.action === "confirmUnrest") {
      setBusy(false);
      setConfirmVisible(true);
      return;
    }
    await run(fresh);
  };

  const disabled = plan === null || plan.action === "disabled" || busy;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={[styles.button, disabled && styles.buttonDisabled]}
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={plan?.label ?? ADD_TO_TODAY_LABEL}
        accessibilityState={{ disabled, busy }}
      >
        {busy
          ? <ActivityIndicator size="small" color={colors.onBrand} />
          : <Text style={styles.buttonText}>{plan?.label ?? ADD_TO_TODAY_LABEL}</Text>}
      </TouchableOpacity>
      <Text style={styles.caption}>{ADD_TO_TODAY_CAPTION}</Text>
      {error && <Text style={styles.error}>{error}</Text>}

      <BottomSheet visible={confirmVisible} onClose={() => setConfirmVisible(false)} closeLabel="Cancel adding to today">
        <Text style={styles.sheetTitle}>Today is a rest day. Un-rest and add this?</Text>
        <Text style={styles.sheetBody}>
          The rest day is cleared and a session with {exerciseName} is set up for today.
        </Text>
        <View style={styles.sheetActions}>
          <TouchableOpacity style={styles.sheetCancel} onPress={() => setConfirmVisible(false)} accessibilityRole="button">
            <Text style={styles.sheetCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sheetAdd} accessibilityRole="button"
            onPress={() => {
              setConfirmVisible(false);
              run({ action: "confirmUnrest", label: ADD_TO_TODAY_LABEL });
            }}>
            <Text style={styles.sheetAddText}>Add</Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  button: {
    height: 52, borderRadius: radii.control, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: colors.onBrand, ...typography.button },
  caption: { ...typography.caption, textAlign: "center", marginTop: spacing.sm },
  error: { fontSize: 13, color: colors.danger, textAlign: "center", marginTop: spacing.sm },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, marginBottom: spacing.sm },
  sheetBody: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  sheetActions: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  sheetCancel: {
    flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  sheetCancelText: { color: colors.text, ...typography.button },
  sheetAdd: { flex: 1, height: 48, borderRadius: radii.control, alignItems: "center", justifyContent: "center", backgroundColor: colors.brand },
  sheetAddText: { color: colors.onBrand, ...typography.button },
});
