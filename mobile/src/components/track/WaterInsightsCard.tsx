import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Card, SectionHeader } from "@/src/components/ui";
import { WaterBarChart } from "./WaterBarChart";
import { DailySeriesEntry } from "@/src/lib/waterStats";
import { WaterUnit, ozToLiters } from "@/src/lib/waterUnits";

interface WaterInsightsCardProps {
  currentStreak: number;
  bestStreak: number;
  avgOzPerDay: number;
  daysHit: number;
  daysInWindow: number;
  chartSeries: DailySeriesEntry[];
  referenceGoalOz: number;
  displayUnit: WaterUnit;
}

export function WaterInsightsCard({
  currentStreak,
  bestStreak,
  avgOzPerDay,
  daysHit,
  daysInWindow,
  chartSeries,
  referenceGoalOz,
  displayUnit,
}: WaterInsightsCardProps) {
  return (
    <Card variant="panel" style={styles.card}>
      <View style={styles.sectionHeader}>
        <SectionHeader title="Insights · Last 7 days" />
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{currentStreak}</Text>
          <Text style={styles.statLabel}>Streak</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{bestStreak}</Text>
          <Text style={styles.statLabel}>Best</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>
            {displayUnit === "oz"
              ? Math.round(avgOzPerDay)
              : ozToLiters(avgOzPerDay).toFixed(2)}
          </Text>
          <Text style={styles.statLabel}>Avg {displayUnit}/day</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>
            {daysHit}
            <Text style={styles.statValueSub}>/{daysInWindow}</Text>
          </Text>
          <Text style={styles.statLabel}>Goal hit</Text>
        </View>
      </View>
      <Text style={styles.chartLabel}>Last 14 days</Text>
      <WaterBarChart series={chartSeries} referenceGoalOz={referenceGoalOz} />
    </Card>
  );
}

const styles = StyleSheet.create({
  // Placement only — `Card variant="panel"` owns surface, radius and padding.
  card: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.xxl,
  },
  // `SectionHeader` takes no style prop; the wrapper owns its spacing.
  sectionHeader: {
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
  // The stat-cell value token.
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
  },
  chartLabel: {
    ...typography.caption,
    marginBottom: spacing.sm,
  },
});
