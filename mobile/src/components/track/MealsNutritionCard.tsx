import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import {
  MacroTotals,
  MacroGoals,
  MacroKey,
  totalForMacro,
  goalForMacro,
} from "@/src/lib/mealMacros";
import { MacroRing } from "./MacroRing";
import { MacroBar } from "./MacroBar";
import { MacroPercentageBar } from "./MacroPercentageBar";

interface MealsNutritionCardProps {
  label: string;
  totals: MacroTotals;
  goals: MacroGoals;
}

const TIER_C: MacroKey[] = ["fats", "saturatedFat", "sugars", "fiber"];

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

      {/* Tier C: fats / sugars / fiber — the SAME meter as tier B, at half
          weight (A2). It used to be bare text, which made three tiers read as
          three different kinds of fact rather than one ranked set; fiber in
          particular had a goal and no way to show progress against it (A3),
          while sodium — no more important — got a full bar. The per-macro
          lookup is the shared one now: the inline ladder here silently paired
          every key it did not name with fiber's number, which a fourth macro
          would have turned into a wrong figure rather than a wrong label. */}
      <View style={styles.tierC}>
        {TIER_C.map((m) => (
          <MacroBar
            key={m}
            macro={m}
            compact
            value={totalForMacro(totals, m)}
            goal={goalForMacro(goals, m)}
          />
        ))}
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
  // Separated by a rule rather than by a change of encoding: the tier below
  // is the same meter at half weight, so the divider is what says "these
  // matter less" without the bars having to become something else.
  tierC: {
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
