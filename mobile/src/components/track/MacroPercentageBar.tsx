import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";
import { MacroTotals } from "@/src/lib/mealMacros";
import { computeMacroSplit } from "@/src/lib/mealStats";

interface MacroPercentageBarProps {
  totals: MacroTotals;
}

/**
 * Single-line stacked bar showing today's calorie split across the three
 * energy macros (protein/carbs/fats). Numbers are % of calories, not %
 * of grams.
 */
export function MacroPercentageBar({ totals }: MacroPercentageBarProps) {
  const split = computeMacroSplit(totals);
  const any = split.protein + split.carbs + split.fats > 0;

  if (!any) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <View style={[styles.seg, { flex: split.protein, backgroundColor: "#22C55E" }]} />
        <View style={[styles.seg, { flex: split.carbs, backgroundColor: "#F59E0B" }]} />
        <View style={[styles.seg, { flex: split.fats, backgroundColor: "#3B82F6" }]} />
      </View>
      <Text style={styles.label}>
        <Text style={{ color: "#22C55E" }}>P {Math.round(split.protein * 100)}%</Text>
        <Text style={styles.divider}> · </Text>
        <Text style={{ color: "#F59E0B" }}>C {Math.round(split.carbs * 100)}%</Text>
        <Text style={styles.divider}> · </Text>
        <Text style={{ color: "#3B82F6" }}>F {Math.round(split.fats * 100)}%</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 8,
    marginBottom: 10,
  },
  bar: {
    flexDirection: "row",
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  seg: {
    height: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
    marginTop: 6,
  },
  divider: {
    color: colors.mutedForeground,
  },
});
