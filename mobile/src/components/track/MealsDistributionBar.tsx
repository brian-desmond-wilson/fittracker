import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";
import { MealLog, MealType } from "@/src/types/track";

const ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

const COLORS: Record<MealType, string> = {
  breakfast: "#F59E0B",
  lunch: "#10B981",
  dinner: "#3B82F6",
  snack: "#8B5CF6",
  dessert: "#EC4899",
};

const LABELS: Record<MealType, string> = {
  breakfast: "B",
  lunch: "L",
  dinner: "D",
  snack: "S",
  dessert: "Ds",
};

interface MealsDistributionBarProps {
  meals: MealLog[];
}

/**
 * Single-line stacked bar showing how today's calories are distributed
 * across meal types. Hidden when there are no calories logged.
 */
export function MealsDistributionBar({ meals }: MealsDistributionBarProps) {
  const byType: Record<MealType, number> = {
    breakfast: 0,
    lunch: 0,
    dinner: 0,
    snack: 0,
    dessert: 0,
  };
  for (const m of meals) {
    byType[m.meal_type] += m.calories ?? 0;
  }
  const total = ORDER.reduce((s, t) => s + byType[t], 0);
  if (total <= 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Calories by meal</Text>
        <Text style={styles.totalText}>{Math.round(total)} cal</Text>
      </View>
      <View style={styles.bar}>
        {ORDER.map((t) => {
          const v = byType[t];
          if (v <= 0) return null;
          return (
            <View
              key={t}
              style={{ flex: v, backgroundColor: COLORS[t], height: 8 }}
            />
          );
        })}
      </View>
      <View style={styles.legendRow}>
        {ORDER.map((t) => {
          const v = byType[t];
          if (v <= 0) return null;
          return (
            <View key={t} style={styles.legendItem}>
              <View style={[styles.swatch, { backgroundColor: COLORS[t] }]} />
              <Text style={styles.legendText}>
                {LABELS[t]} {Math.round(v)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  title: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  totalText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.foreground,
  },
  bar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.foreground,
  },
});
