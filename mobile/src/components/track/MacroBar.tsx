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
}

export function MacroBar({ macro, value, goal }: MacroBarProps) {
  const ratio = macroProgress(value, goal);
  const color = macroColor(value, goal, macro);
  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{macroLabel(macro)}</Text>
        <Text style={styles.value}>
          {formatMacroProgress(value, goal, macro)}
        </Text>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
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
});
