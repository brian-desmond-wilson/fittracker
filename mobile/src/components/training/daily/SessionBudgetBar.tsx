// The day's time story in one strip: how the five blocks spend the minutes
// the user said they had, and what's left over. Approved mockup A is the
// decision record for the block hues (tokens colors.blocks).
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing } from "@/src/theme/tokens";
import { plannedBlockMinutes, BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import type { StoredBlock } from "@/src/types/dailyBlocks";

interface SessionBudgetBarProps {
  blocks: StoredBlock[];
  minutesAvailable: number;
}

export function SessionBudgetBar({ blocks, minutesAvailable }: SessionBudgetBarProps) {
  const planned = plannedBlockMinutes(blocks);
  if (planned <= 0) return null;
  const spare = minutesAvailable - planned;
  // A complete day that runs long is composed on purpose (the durations are
  // the creators'); the bar says so instead of pretending it fits.
  const runsLong = spare < 0;
  const total = Math.max(planned, minutesAvailable);

  return (
    <View style={styles.wrap}>
      <View style={styles.labels}>
        <Text style={styles.label}>
          ≈{planned} of {minutesAvailable} min planned
        </Text>
        <Text style={[styles.label, runsLong && styles.long]}>
          {runsLong ? `runs ${-spare} min long` : spare > 0 ? `${spare} min spare` : "on the nose"}
        </Text>
      </View>
      <View style={styles.bar}>
        {blocks.filter((b) => !b.dismissed).map((b) => (
          <View
            key={b.id}
            style={{ flex: b.minutes / total, backgroundColor: colors.blocks[b.block] }}
          />
        ))}
        {spare > 0 && (
          <View style={{ flex: spare / total, backgroundColor: colors.surface2 }} />
        )}
      </View>
      <Text style={styles.legend} numberOfLines={1}>
        {blocks
          .filter((b) => !b.dismissed)
          .map((b) => BLOCK_TITLES[b.block].toLowerCase())
          .join(" · ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.md, gap: 4 },
  labels: { flexDirection: "row", justifyContent: "space-between" },
  label: { fontSize: 11, color: colors.textFaint, letterSpacing: 0.3 },
  long: { color: colors.warning },
  bar: {
    flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden",
    backgroundColor: colors.surface2,
  },
  legend: { fontSize: 11, color: colors.textFaint, letterSpacing: 0.3 },
});
