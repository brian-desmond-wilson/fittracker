import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, spacing } from "@/src/theme/tokens";
import {
  MacroKey,
  macroLabel,
  macroUnit,
  formatMacroValue,
  macroProgress,
  macroColor,
} from "@/src/lib/mealMacros";

interface MacroRingProps {
  macro: MacroKey;
  value: number;
  goal: number | null;
  size?: number;
  strokeWidth?: number;
}

export function MacroRing({
  macro,
  value,
  goal,
  size = 110,
  strokeWidth = 10,
}: MacroRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = macroProgress(value, goal);
  const dashOffset = circumference * (1 - ratio);
  const color = macroColor(value, goal, macro);
  const unit = macroUnit(macro);
  const valueLabel = formatMacroValue(value, macro);
  const goalLabel = goal != null ? formatMacroValue(goal, macro) : null;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          // Unfilled meter groove — `surface2`, per the standing rule.
          stroke={colors.surface2}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.centerLabel}>
        <Text style={[styles.value, { color }]}>{valueLabel}</Text>
        {goalLabel ? (
          <Text style={styles.goalText}>
            of {goalLabel}{unit}
          </Text>
        ) : (
          <Text style={styles.goalText}>{unit || "kcal"}</Text>
        )}
        <Text style={styles.macroLabelText}>{macroLabel(macro)}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  centerLabel: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  // Sizes are held deliberately: this block is centred inside a 110pt ring and
  // there is no type token between `rowTitle` (16) and `titleRoot` (28), nor
  // any below `caption` (12). Same call Task 7 recorded for `MealsHomeCard`'s
  // ring sub-captions. Only the banned `"bold"` is converged, to `"700"`.
  value: {
    fontSize: 20,
    fontWeight: "700",
    lineHeight: 22,
  },
  goalText: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  macroLabelText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
