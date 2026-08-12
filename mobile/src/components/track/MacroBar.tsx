import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import {
  MacroKey,
  macroLabel,
  macroProgress,
  macroColor,
  formatMacroProgress,
} from "@/src/lib/mealMacros";

interface MacroBarProps {
  macro: MacroKey;
  value: number;
  goal: number | null;
  /**
   * A2/A3: the same bar, quieter. The nutrition card used to encode its three
   * tiers in three DIFFERENT ways — rings, bars, then bare text — so the
   * ranking was invisible and the bottom tier read as a different kind of
   * fact rather than a less important one. `compact` keeps the encoding and
   * changes only the weight, which is what makes a tier look ranked.
   */
  compact?: boolean;
}

export function MacroBar({ macro, value, goal, compact = false }: MacroBarProps) {
  const ratio = macroProgress(value, goal);
  const color = macroColor(value, goal, macro);
  return (
    <View style={compact ? styles.wrapCompact : styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={[styles.label, compact && styles.labelCompact]}>
          {macroLabel(macro)}
        </Text>
        <Text style={styles.value}>
          {formatMacroProgress(value, goal, macro)}
        </Text>
      </View>
      <View style={[styles.track, compact && styles.trackCompact]}>
        <View
          style={[
            styles.fill,
            compact && styles.fillCompact,
            { width: `${ratio * 100}%`, backgroundColor: color },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  wrapCompact: {
    marginBottom: spacing.sm,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  label: {
    ...typography.buttonSm,
    color: colors.text,
  },
  value: {
    ...typography.caption,
  },
  // Unfilled meter groove — `surface2`, per the standing rule. It used to be a
  // translucent white, which composited brown rather than neutral over this
  // card's `tint(accents.meals)` fill.
  track: {
    height: 6,
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: radii.pill,
  },
  // Half the height and a muted label: unmistakably the same meter, one rank
  // down. The value text is already `caption` on both.
  labelCompact: { ...typography.caption, color: colors.textMuted },
  trackCompact: { height: 3 },
  fillCompact: { height: 3 },
});
