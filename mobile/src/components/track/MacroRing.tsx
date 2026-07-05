import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/src/lib/colors";
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
          stroke="rgba(255,255,255,0.08)"
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
  value: {
    fontSize: 20,
    fontWeight: "bold",
    lineHeight: 22,
  },
  goalText: {
    fontSize: 10,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  macroLabelText: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.foreground,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
