import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";
import { MealsSeriesEntry } from "@/src/lib/mealStats";
import { MealsCalorieChart } from "./MealsCalorieChart";
import { MealsMacroChart } from "./MealsMacroChart";

interface MealsInsightsCardProps {
  // Streaks
  calorieStreak: number;
  calorieBestStreak: number;
  proteinStreak: number;
  proteinBestStreak: number;
  // Rolling
  avgCalsPerDay: number;
  daysHit: number;
  daysInWindow: number;
  // Chart
  series14: MealsSeriesEntry[];
  calorieGoal: number;
}

export function MealsInsightsCard({
  calorieStreak,
  calorieBestStreak,
  proteinStreak,
  proteinBestStreak,
  avgCalsPerDay,
  daysHit,
  daysInWindow,
  series14,
  calorieGoal,
}: MealsInsightsCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>Insights · Last 7 days</Text>

      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{calorieStreak}</Text>
          <Text style={styles.statLabel}>Cal streak</Text>
          <Text style={styles.statSub}>best {calorieBestStreak}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{proteinStreak}</Text>
          <Text style={styles.statLabel}>Protein streak</Text>
          <Text style={styles.statSub}>best {proteinBestStreak}</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{Math.round(avgCalsPerDay)}</Text>
          <Text style={styles.statLabel}>Avg cal/day</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>
            {daysHit}
            <Text style={styles.statValueSub}>/{daysInWindow}</Text>
          </Text>
          <Text style={styles.statLabel}>Cal hit</Text>
        </View>
      </View>

      <Text style={styles.chartLabel}>Last 14 days · Calories</Text>
      <MealsCalorieChart series={series14} referenceGoalCal={calorieGoal} />

      <Text style={[styles.chartLabel, { marginTop: 12 }]}>
        Last 14 days · Macro split
      </Text>
      <MealsMacroChart series={series14} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
  },
  statValueSub: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.mutedForeground,
  },
  statLabel: {
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 2,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statSub: {
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 1,
  },
  chartLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 6,
  },
});
