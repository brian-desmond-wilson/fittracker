import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import {
  MacroTotals,
  MacroGoals,
  formatMacroValue,
  MacroKey,
} from "@/src/lib/mealMacros";
import { MacroRing } from "./MacroRing";
import { MacroBar } from "./MacroBar";
import { MacroPercentageBar } from "./MacroPercentageBar";

interface MealsNutritionCardProps {
  label: string;
  totals: MacroTotals;
  goals: MacroGoals;
}

const TIER_C: MacroKey[] = ["fats", "sugars", "fiber"];

export function MealsNutritionCard({
  label,
  totals,
  goals,
}: MealsNutritionCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{label}</Text>

      {/* Tier A: calories + protein as rings */}
      <View style={styles.ringsRow}>
        <MacroRing
          macro="calories"
          value={totals.calories}
          goal={goals.calories}
        />
        <MacroRing
          macro="protein"
          value={totals.protein}
          goal={goals.protein}
        />
      </View>

      {/* Macro % split (calories from P/C/F) */}
      <MacroPercentageBar totals={totals} />

      {/* Tier B: carbs + sodium as bars */}
      <View style={styles.barsBlock}>
        <MacroBar macro="carbs" value={totals.carbs} goal={goals.carbs} />
        <MacroBar
          macro="sodium"
          value={totals.sodium_mg}
          goal={goals.sodium_mg}
        />
      </View>

      {/* Tier C: fats / sugars / fiber compact */}
      <View style={styles.compactRow}>
        {TIER_C.map((m) => {
          const value =
            m === "fats" ? totals.fats : m === "sugars" ? totals.sugars : totals.fiber_g;
          const goal =
            m === "fats" ? goals.fats : m === "sugars" ? goals.sugars : goals.fiber_g;
          return (
            <View key={m} style={styles.compactCell}>
              <Text style={styles.compactValue}>
                {formatMacroValue(value, m)}g
                {goal != null && (
                  <Text style={styles.compactGoal}>
                    {" "}/ {formatMacroValue(goal, m)}g
                  </Text>
                )}
              </Text>
              <Text style={styles.compactLabel}>
                {m === "fats" ? "Fats" : m === "sugars" ? "Sugars" : "Fiber"}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Sanctioned surviving orange: a `tint(accents.meals)` info fill.
  card: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.lg,
    padding: spacing.lg,
    backgroundColor: tint(colors.accents.meals),
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: tint(colors.accents.meals, 0.3),
  },
  title: {
    ...typography.section,
    marginBottom: spacing.lg,
  },
  ringsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: spacing.lg,
  },
  barsBlock: {
    marginBottom: spacing.sm,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  compactCell: {
    flex: 1,
    alignItems: "center",
  },
  // Standing stat-cell token (see amendments).
  compactValue: {
    ...typography.rowTitle,
    fontWeight: "700",
    color: colors.text,
  },
  compactGoal: {
    ...typography.caption,
  },
  compactLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
