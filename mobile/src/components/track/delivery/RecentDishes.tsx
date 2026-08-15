// The dishes this vendor has sent before.
//
// A subscription rotates a fixed menu, so most of a box is dishes that have
// arrived before — typing them out again, twice a week, is the cost this
// removes. A stepper per dish, and the number it shows is read back off the
// meal rows below rather than held here, so editing a row's Qty by hand moves
// its stepper too.
//
// Collapsed to six, because a vendor with thirty dishes on file would push the
// meal rows off the screen and the six most recent are the ones a repeat order
// is made of.
import React, { useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { RecentDish } from "@/src/lib/preparedMealDelivery";
import type { MealType } from "@/src/types/track";

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

const COLLAPSED = 6;

interface RecentDishesProps {
  dishes: RecentDish[];
  /** Folded dish name → how many are in the delivery, from the meal rows. */
  counts: Record<string, number>;
  onAdd: (dish: RecentDish) => void;
  onRemove: (dish: RecentDish) => void;
}

export function RecentDishes({ dishes, counts, onAdd, onRemove }: RecentDishesProps) {
  const [expanded, setExpanded] = useState(false);
  if (dishes.length === 0) return null;

  const shown = expanded ? dishes : dishes.slice(0, COLLAPSED);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Ordered before</Text>

      {shown.map((dish) => {
        const count = counts[dish.slug] ?? 0;
        const detail = [
          SLOT_LABELS[dish.slot],
          dish.calories != null ? `${Math.round(dish.calories)} kcal` : null,
        ].filter(Boolean).join(" · ");

        return (
          <View key={dish.slug} style={[styles.row, count > 0 && styles.rowActive]}>
            {/* The photo from the dish's last delivery — recognition is the
                whole reason this list exists, and a picture recognises faster
                than a name. Text-only when history has none. */}
            {dish.imageUrl != null && (
              <Image source={{ uri: dish.imageUrl }} style={styles.photo} resizeMode="cover" />
            )}
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={2}>{dish.name}</Text>
              <Text style={styles.detail}>{detail}</Text>
            </View>

            <View style={styles.stepper}>
              <TouchableOpacity
                style={[styles.step, count === 0 && styles.stepIdle]}
                onPress={() => onRemove(dish)}
                disabled={count === 0}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`One fewer ${dish.name}`}
              >
                <Minus
                  size={icons.sm}
                  color={count === 0 ? colors.textFaint : colors.text}
                  strokeWidth={icons.strokeWidth}
                />
              </TouchableOpacity>

              {/* Fixed width so the row does not jog sideways as the count
                  crosses from one digit to two. */}
              <Text style={[styles.count, count > 0 && styles.countActive]}>{count}</Text>

              <TouchableOpacity
                style={styles.step}
                onPress={() => onAdd(dish)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`One more ${dish.name}`}
              >
                <Plus size={icons.sm} color={colors.text} strokeWidth={icons.strokeWidth} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      {dishes.length > COLLAPSED && (
        <TouchableOpacity
          onPress={() => setExpanded((v) => !v)}
          accessibilityRole="button"
          style={styles.more}
        >
          <Text style={styles.moreText}>
            {expanded ? "Show fewer" : `Show all ${dishes.length}`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.section, color: colors.textMuted },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingLeft: spacing.md, paddingRight: spacing.sm, paddingVertical: spacing.sm,
  },
  // Enough to find the ones you have already added at a glance, without the
  // row becoming a second kind of thing.
  rowActive: { borderColor: colors.brand },
  photo: {
    width: 32, height: 32, borderRadius: radii.control,
    backgroundColor: colors.surface,
  },
  text: { flex: 1, gap: 2 },
  name: { ...typography.body, color: colors.text },
  detail: { ...typography.caption, color: colors.textFaint },
  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  step: {
    width: 32, height: 32, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  stepIdle: { opacity: 0.4 },
  count: { ...typography.body, color: colors.textMuted, minWidth: 20, textAlign: "center" },
  countActive: { color: colors.text, fontWeight: "600" },
  more: { paddingVertical: spacing.xs },
  moreText: { ...typography.caption, color: colors.brand, fontWeight: "600" },
});
