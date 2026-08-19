// One meal, as one line.
//
// The form's job is reviewing a box, and a box is eight meals — at a card per
// meal the eighth was three screens down. This row carries what a review
// glances at (picture, name, slot, calories, how many) and hands everything
// else to the editor sheet it opens.
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronRight, ImageIcon } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { PreparedMealDraft } from "@/src/lib/preparedMealDelivery";
import type { MealType } from "@/src/types/track";

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
  beverage: "Beverage",
};

interface MealRowCompactProps {
  draft: PreparedMealDraft;
  /** 1-based, for the placeholder and accessibility. */
  index: number;
  onOpen: () => void;
}

export function MealRowCompact({ draft, index, onOpen }: MealRowCompactProps) {
  const named = draft.name.trim() !== "";
  const qty = Number(draft.quantity);
  const detail = [
    SLOT_LABELS[draft.slot],
    draft.calories.trim() !== "" ? `${draft.calories} kcal` : null,
  ].filter(Boolean).join(" · ");

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={named ? `Edit ${draft.name.trim()}` : `Fill in meal ${index}`}
    >
      <View style={styles.thumb}>
        {draft.imageUrl ? (
          <Image source={{ uri: draft.imageUrl }} style={styles.thumbImage} resizeMode="cover" />
        ) : (
          <ImageIcon size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
        )}
      </View>

      <View style={styles.text}>
        <Text
          style={[styles.name, !named && styles.namePlaceholder]}
          numberOfLines={1}
        >
          {named ? draft.name.trim() : `Meal ${index} — tap to fill in`}
        </Text>
        {named && <Text style={styles.detail}>{detail}</Text>}
      </View>

      {named && Number.isFinite(qty) && qty > 0 && (
        <Text style={styles.qty}>×{qty}</Text>
      )}
      <ChevronRight size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.row,
    paddingVertical: spacing.sm + 2, paddingLeft: spacing.sm + 2, paddingRight: spacing.md,
  },
  thumb: {
    width: 44, height: 44, borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
    overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
  text: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.body, fontWeight: "600", color: colors.text },
  namePlaceholder: { color: colors.textFaint, fontWeight: "400" },
  detail: { ...typography.caption, color: colors.textMuted },
  qty: { ...typography.caption, fontWeight: "700", color: colors.textMuted },
});
