// One meal in the box: a name, a slot, and the three numbers off the lid.
//
// Lifted out of the delivery screen when it gained a camera of its own. The
// screen owns the box — vendor, date, which rows exist — and this owns a row,
// which is as much as fits in one head at once.
//
// The slot control wraps rather than shrinks. Five segments across a phone
// leave about 60pt each, which truncates "Breakfast" on the narrower handsets;
// a minimum width and a wrapping track give three and two instead, at a size
// that stays readable.
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Camera, Trash2 } from "lucide-react-native";
import { Card } from "@/src/components/ui";
import { sanitizeDecimal, sanitizeInteger } from "@/src/lib/numericInput";
import { DELIVERY_SLOTS, type PreparedMealDraft } from "@/src/lib/preparedMealDelivery";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { MealType } from "@/src/types/track";

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

interface DeliveryMealRowProps {
  draft: PreparedMealDraft;
  /** 1-based, for the heading and the accessibility labels. */
  index: number;
  onPatch: (changes: Partial<PreparedMealDraft>) => void;
  onRemove: () => void;
  /** Photograph this lid and fill this row. */
  onScan: () => void;
  scanning: boolean;
}

export function DeliveryMealRow({
  draft, index, onPatch, onRemove, onScan, scanning,
}: DeliveryMealRowProps) {
  return (
    <Card variant="panel" style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.rowIndex}>Meal {index}</Text>
        <View style={styles.headActions}>
          {/* Fills this row only, and without a confirmation: the blast
              radius is the one row the owner is looking at. */}
          <TouchableOpacity
            onPress={onScan}
            disabled={scanning}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Photograph the label for meal ${index}`}
          >
            <Camera
              size={icons.sm}
              color={scanning ? colors.brand : colors.textMuted}
              strokeWidth={icons.strokeWidth}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onRemove}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Remove meal ${index}`}
          >
            <Trash2 size={icons.sm} color={colors.danger} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
        </View>
      </View>

      <TextInput
        style={styles.nameInput}
        placeholder={scanning ? "Reading the label…" : "Meal name"}
        placeholderTextColor={colors.textFaint}
        value={draft.name}
        onChangeText={(t) => onPatch({ name: t })}
        multiline
      />

      <View style={styles.segTrack}>
        {DELIVERY_SLOTS.map((slot) => {
          const active = draft.slot === slot;
          return (
            <TouchableOpacity
              key={slot}
              style={[styles.segItem, active && styles.segItemActive]}
              onPress={() => onPatch({ slot })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segText, active && styles.segTextActive]} numberOfLines={1}>
                {SLOT_LABELS[slot]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Six fields do not fit across a phone in one line, so the row wraps
          into two of three rather than shrinking every input past reading
          width. */}
      <View style={styles.macroRow}>
        {([
          ["Cal", draft.calories, (t: string) => onPatch({ calories: sanitizeInteger(t) })],
          ["Protein", draft.protein, (t: string) => onPatch({ protein: sanitizeDecimal(t) })],
          ["Fiber", draft.fiber, (t: string) => onPatch({ fiber: sanitizeDecimal(t) })],
          ["Sat fat", draft.saturatedFat, (t: string) => onPatch({ saturatedFat: sanitizeDecimal(t) })],
          // Milligrams, and the label has to fit a sixth of the row — "Sodium"
          // alone would read as grams beside five gram fields.
          ["Na mg", draft.sodium, (t: string) => onPatch({ sodium: sanitizeInteger(t) })],
          ["Qty", draft.quantity, (t: string) => onPatch({ quantity: sanitizeInteger(t) })],
        ] as const).map(([label, value, onChange]) => (
          <View key={label} style={styles.macroField}>
            <Text style={styles.macroLabel}>{label}</Text>
            <TextInput
              style={styles.macroInput}
              placeholder={label === "Qty" ? "1" : "—"}
              placeholderTextColor={colors.textFaint}
              value={value}
              onChangeText={onChange}
              keyboardType={
                label === "Cal" || label === "Qty" || label === "Na mg"
                  ? "number-pad"
                  : "decimal-pad"
              }
              accessibilityLabel={`${label} for meal ${index}`}
            />
          </View>
        ))}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headActions: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  rowIndex: { ...typography.caption, color: colors.textFaint },
  nameInput: {
    ...typography.body, color: colors.text,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    minHeight: 44,
  },
  segTrack: {
    flexDirection: "row", flexWrap: "wrap", gap: spacing.xs,
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.xs,
  },
  // grow to share whatever the row has left, but never below the width that
  // fits the longest label — that is what makes the fifth segment wrap.
  segItem: {
    flexGrow: 1, minWidth: 90,
    alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
  },
  segItemActive: { backgroundColor: colors.brand },
  segText: { ...typography.caption, color: colors.textMuted },
  segTextActive: { color: colors.onBrand, fontWeight: "600" },
  macroRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  // Three to a line: a third of the width minus its share of two gaps, and
  // free to grow into the slack a shorter line leaves.
  macroField: { flexBasis: "30%", flexGrow: 1, gap: spacing.xs },
  macroLabel: { ...typography.caption, color: colors.textFaint },
  macroInput: {
    ...typography.body, color: colors.text, textAlign: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingVertical: spacing.sm,
  },
});
