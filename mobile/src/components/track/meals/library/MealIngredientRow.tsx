// One ingredient, and what it is doing to you today.
//
// The page used to list ingredient names and then, at the foot of the card,
// three separate blocks: what's missing, what can't be checked, and what is
// about to turn. A reader had to match a name in one list against a name in
// another to learn anything about a row. Each row now carries its own verdict,
// and the repair sits under the row that names the problem.
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { ChevronRight } from "lucide-react-native";
import type { MealIngredient } from "@/src/lib/mealLibraryView";

interface MealIngredientRowProps {
  ingredient: MealIngredient;
  /** Open this ingredient's product in Food Inventory. Absent when nothing in
   *  the kitchen resolves it — there is no page to open. */
  onOpenProduct?: (inventoryId: string) => void;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** Deliberately not a `Badge`: these four are a closed set with their own
 *  vocabulary, and "3d left" needs a number in it. */
function stateChip(ingredient: MealIngredient): { label: string; style: object; textStyle: object } {
  const { kind, daysLeft } = ingredient.state;
  switch (kind) {
    case "expiring":
      return {
        label: daysLeft === 0 ? "today" : `${daysLeft}d left`,
        style: s.chipWarn, textStyle: s.chipWarnText,
      };
    case "missing":
      return { label: "Missing", style: s.chipDanger, textStyle: s.chipDangerText };
    case "unlinked":
      return { label: "Not linked", style: s.chipMuted, textStyle: s.chipMutedText };
    case "in_stock":
    default:
      return { label: "In stock", style: s.chipOk, textStyle: s.chipOkText };
  }
}

function MealIngredientRowInner({ ingredient, onOpenProduct }: MealIngredientRowProps) {
  const { item, state } = ingredient;
  const food = item.savedFood;
  const chip = stateChip(ingredient);
  const calories = Math.round((food.calories ?? 0) * item.servings);
  const openable = state.inventoryId !== null && onOpenProduct !== undefined;

  const body = (
    <>
      <View style={s.thumb}>
        {food.image_primary_url ? (
          <Image source={{ uri: food.image_primary_url }} style={s.thumbImage} resizeMode="cover" />
        ) : (
          <Text style={s.thumbText}>{initials(food.name)}</Text>
        )}
      </View>
      <View style={s.body}>
        <Text style={s.name} numberOfLines={1}>
          {food.name}{item.small_pieces_ok ? " ✂︎" : ""}
        </Text>
        <Text style={s.sub}>×{item.servings} · {calories} cal</Text>
      </View>
      <View style={[s.chip, chip.style]}>
        <Text style={[s.chipText, chip.textStyle]}>{chip.label}</Text>
      </View>
      {openable && (
        <ChevronRight size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
      )}
    </>
  );

  if (!openable) return <View style={s.row}>{body}</View>;

  return (
    <TouchableOpacity
      style={s.row}
      onPress={() => onOpenProduct!(state.inventoryId!)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${food.name}, ${chip.label}. Open in Food Inventory`}
    >
      {body}
    </TouchableOpacity>
  );
}

export const MealIngredientRow = React.memo(MealIngredientRowInner);

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  thumb: {
    width: 40, height: 40, borderRadius: radii.control,
    backgroundColor: colors.imageWell,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbText: { ...typography.caption, fontWeight: "700", color: colors.textFaint },
  body: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...typography.body, color: colors.text },
  sub: { ...typography.caption, color: colors.textFaint },
  chip: {
    borderRadius: radii.pill, borderWidth: 1,
    paddingHorizontal: spacing.sm, paddingVertical: 3,
  },
  chipText: { ...typography.caption, fontWeight: "600" },
  chipOk: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.4) },
  chipOkText: { color: colors.brand },
  chipWarn: { backgroundColor: tint(colors.warning), borderColor: tint(colors.warning, 0.4) },
  chipWarnText: { color: colors.warning },
  chipDanger: { backgroundColor: tint(colors.danger), borderColor: tint(colors.danger, 0.4) },
  chipDangerText: { color: colors.danger },
  chipMuted: { backgroundColor: colors.surface2, borderColor: colors.border },
  chipMutedText: { color: colors.textMuted },
});
