import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";
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
    <View style={styles.card}>
      <Text style={styles.title}>Insights · Last 7 days</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 20,
    marginBottom: 24,
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
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
    textAlign: "center",
  },
  chartLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 6,
  },
});
