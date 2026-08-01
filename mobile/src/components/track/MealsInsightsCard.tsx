import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Card } from "@/src/components/ui";
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
    <Card variant="row" style={styles.cardSpacing}>
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

      <Text style={[styles.chartLabel, styles.chartLabelSpaced]}>
        Last 14 days · Macro split
      </Text>
      <MealsMacroChart series={series14} />
    </Card>
  );
}

const styles = StyleSheet.create({
  /** Placement the `Card row` primitive can't express. */
  cardSpacing: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.section,
    marginBottom: spacing.md,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    ...typography.rowTitle,
    fontWeight: "700",
    color: colors.text,
  },
  statValueSub: {
    ...typography.body,
    fontWeight: "500",
    color: colors.textMuted,
  },
  statLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  statSub: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  chartLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
  chartLabelSpaced: {
    marginTop: spacing.md,
  },
});
