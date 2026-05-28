import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";
import {
  MacroTotals,
  MacroGoals,
  formatMacroValue,
  MacroKey,
} from "@/src/lib/mealMacros";
import { MacroRing } from "./MacroRing";
import { MacroBar } from "./MacroBar";

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
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: "rgba(249, 115, 22, 0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.3)",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 16,
  },
  ringsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  barsBlock: {
    marginBottom: 6,
  },
  compactRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
  },
  compactCell: {
    flex: 1,
    alignItems: "center",
  },
  compactValue: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.foreground,
  },
  compactGoal: {
    fontSize: 11,
    fontWeight: "400",
    color: colors.mutedForeground,
  },
  compactLabel: {
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
