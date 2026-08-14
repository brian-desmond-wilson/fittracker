// mobile/src/components/ui/WhenSheet.tsx
//
// When you ate it: the slot, and the clock.
//
// **No inline date or time pickers, anywhere in this app.** A spinner that
// unfolds inside a form shoves everything below it down the page, and on a
// sheet it fights the sheet's own scroll and drag — you reach for a number and
// dismiss the thing instead. It comes up from the bottom, over everything, and
// leaves when you are done, which is what a picker does on this platform.
//
// Android's picker is already a modal dialog of its own, so wrapping it would
// mean two layers of chrome for one decision: there, the component renders the
// platform's dialog directly and this sheet's frame never appears.
import React, { useState } from "react";
import { Modal, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { MEAL_TYPE_LABELS } from "@/src/types/meal-library";
import type { MealType } from "@/src/types/track";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

interface WhenSheetProps {
  visible: boolean;
  /** The time being edited. Only its clock is changed — never its date. */
  loggedAt: Date;
  onLoggedAtChange: (next: Date) => void;
  /** Omit to offer the clock alone. */
  mealType?: MealType;
  onMealTypeChange?: (next: MealType) => void;
  /** Named so the sheet can say what it is dating — "today", "Mon 11 Aug". */
  dayLabel?: string;
  onClose: () => void;
}

export function WhenSheet({
  visible, loggedAt, onLoggedAtChange, mealType, onMealTypeChange, dayLabel, onClose,
}: WhenSheetProps) {
  // iOS spins in place and reports every turn; Android returns once, on Set.
  const [draft, setDraft] = useState(loggedAt);
  const shown = Platform.OS === "ios" ? draft : loggedAt;

  if (!visible) return null;

  const commit = (picked: Date | undefined) => {
    if (!picked) return;
    // Only the clock: the DAY belongs to whatever raised this — the viewed
    // date on the log sheet, the day stepper on the meal page — and a picker
    // that carried its own date would silently overrule it.
    const next = new Date(loggedAt);
    next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    return next;
  };

  if (Platform.OS !== "ios") {
    // The platform dialog IS the sheet here. A slot picker has no place in it,
    // so on Android the caller's own control keeps that job.
    return (
      <DateTimePicker
        value={loggedAt}
        mode="time"
        display="default"
        onChange={(_e, picked) => {
          const next = commit(picked);
          if (next) onLoggedAtChange(next);
          onClose();
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.scrim}>
        {/* Tapping the dimmed area is the gesture people try first. */}
        <TouchableOpacity
          style={s.scrimFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <View style={s.sheet}>
          <View style={s.head}>
            <Text style={s.title}>
              {mealType ? "When did you eat it?" : "What time?"}
              {dayLabel ? ` · ${dayLabel}` : ""}
            </Text>
            <TouchableOpacity
              onPress={() => { onLoggedAtChange(shown); onClose(); }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Done"
            >
              <Text style={s.done}>Done</Text>
            </TouchableOpacity>
          </View>

          {mealType && onMealTypeChange && (
            <View style={s.segTrack}>
              {MEAL_TYPES.map((t) => {
                const active = mealType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => onMealTypeChange(t)}
                    style={[s.segment, active && s.segmentActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={MEAL_TYPE_LABELS[t]}
                  >
                    <Text
                      style={[s.segmentText, active && s.segmentTextActive]}
                      numberOfLines={1}
                    >
                      {MEAL_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <DateTimePicker
            value={shown}
            mode="time"
            display="spinner"
            onChange={(_e, picked) => {
              const next = commit(picked);
              if (next) setDraft(next);
            }}
            textColor={colors.text}
          />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  scrimFill: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    padding: spacing.screenGutter,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  title: { ...typography.titleBar, color: colors.text, flexShrink: 1 },
  done: { ...typography.buttonSm, color: colors.brand, fontWeight: "700" },

  segTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: spacing.xs,
    gap: spacing.xs / 2,
  },
  segment: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.sm, borderRadius: radii.control,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.caption, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand, fontWeight: "700" },
});
