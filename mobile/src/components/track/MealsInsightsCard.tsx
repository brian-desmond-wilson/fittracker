import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Card } from "@/src/components/ui";
import { MealsSeriesEntry } from "@/src/lib/mealStats";
import { MealsCalorieChart } from "./MealsCalorieChart";
import { MealsMacroChart } from "./MealsMacroChart";

/** Two days is the least that can produce a streak, an average worth the
 *  name, or a chart with a shape. Below it the card says so instead. */
const MIN_DAYS_FOR_INSIGHTS = 2;

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
  // A9. With nothing logged yet this card was four zeros over two empty
  // charts — which reads as broken software, not as a young history. Below a
  // couple of days there is genuinely nothing to reflect on, so say what will
  // appear here and when, rather than drawing the shape of an answer around
  // no data.
  const daysWithData = series14.filter((d) => d.calories > 0).length;
  if (daysWithData < MIN_DAYS_FOR_INSIGHTS) {
    return (
      <Card variant="row" style={styles.cardSpacing}>
        <Text style={styles.title}>Insights · Last 7 days</Text>
        <Text style={styles.warmUpBody}>
          {daysWithData === 0
            ? "Nothing logged yet. Streaks, your daily average and the last fortnight's charts appear here once you have logged a couple of days."
            : `One day logged. Streaks and charts appear here from ${MIN_DAYS_FOR_INSIGHTS} days on.`}
        </Text>
      </Card>
    );
  }

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
  warmUpBody: { ...typography.body, color: colors.textMuted },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.lg,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  // Standing stat-cell token (see amendments).
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
