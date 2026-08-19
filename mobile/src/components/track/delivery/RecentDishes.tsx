// The dishes this vendor has sent before.
//
// A subscription rotates a fixed menu, so most of a box is dishes that have
// arrived before — typing them out again, twice a week, is the cost this
// removes. A stepper per dish, and the number it shows is read back off the
// meal rows below rather than held here, so editing a row's Qty by hand moves
// its stepper too.
//
// Six rows until you type, because a vendor with forty dishes on file would
// push the meal rows off the screen, and the six most recent are what a repeat
// order is mostly made of. The field is for everything else — it searches this
// vendor's dishes only, since that is the menu the box comes from.
//
// Recognition first, recall second: the list is visible before anything is
// typed, so the common case stays a single tap rather than a spelling test.
import React, { useMemo, useState } from "react";
import {
  Image, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Minus, Plus, Search, X } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import { filterRecentDishes, type RecentDish } from "@/src/lib/preparedMealDelivery";
import type { MealType } from "@/src/types/track";

const SLOT_LABELS: Record<MealType, string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
  beverage: "Beverage",
};

const COLLAPSED = 6;

interface RecentDishesProps {
  dishes: RecentDish[];
  /** Folded dish name → how many are in the delivery, from the meal rows. */
  counts: Record<string, number>;
  /** Names the field's scope, so it is obvious the search is this vendor's
   *  menu rather than everything ever delivered. */
  vendorName: string | null;
  onAdd: (dish: RecentDish) => void;
  onRemove: (dish: RecentDish) => void;
}

export function RecentDishes({
  dishes, counts, vendorName, onAdd, onRemove,
}: RecentDishesProps) {
  const [query, setQuery] = useState("");
  const searching = query.trim() !== "";

  const matches = useMemo(() => filterRecentDishes(dishes, query), [dishes, query]);
  // Untyped, the list is a shortlist of the newest. Typed, it is every match —
  // narrowing is the user's job now, and cutting the results short would hide
  // the dish they are looking for.
  const shown = searching ? matches : matches.slice(0, COLLAPSED);

  if (dishes.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Ordered before</Text>

      <View style={styles.search}>
        <Search size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
        <TextInput
          style={styles.searchInput}
          placeholder={vendorName ? `Search ${vendorName} meals` : "Search past meals"}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          accessibilityLabel="Search meals you have ordered before"
        />
        {searching && (
          <TouchableOpacity
            onPress={() => setQuery("")}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Clear the search"
          >
            <X size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
        )}
      </View>

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

      {searching && matches.length === 0 && (
        <Text style={styles.note}>
          Nothing matches “{query.trim()}”. Add it as a new meal below.
        </Text>
      )}

      {/* Says the shortlist is a shortlist. Without it, six of forty dishes
          looks like all this vendor has ever sent. */}
      {!searching && dishes.length > COLLAPSED && (
        <Text style={styles.note}>
          {dishes.length - COLLAPSED} more — search to find them.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...typography.section, color: colors.textMuted },
  search: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  searchInput: { ...typography.body, color: colors.text, flex: 1, padding: 0, minHeight: 24 },
  note: { ...typography.caption, color: colors.textFaint },
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
});
