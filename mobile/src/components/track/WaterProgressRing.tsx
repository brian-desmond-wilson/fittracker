import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { formatVolume, formatGoal, WaterUnit } from "@/src/lib/waterUnits";

interface WaterProgressRingProps {
  size?: number;
  strokeWidth?: number;
  current: number;
  goal: number;
  unit?: WaterUnit;
}

export function WaterProgressRing({
  size = 180,
  strokeWidth = 14,
  current,
  goal,
  unit = "oz",
}: WaterProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = goal > 0 ? Math.min(current / goal, 1) : 0;
  const dashOffset = circumference * (1 - ratio);
  const isComplete = current >= goal && goal > 0;

  const currentLabel = formatVolume(current, unit);
  const [currentNum, currentUnit] = currentLabel.split(" ");

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        {/*
          The unfilled groove is `surface2`, not a tinted water blue: a track
          is a bounding element and the FILL is what carries the identity.
        */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.surface2}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {/* The ring fill is one of the three sanctioned surviving blues. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isComplete ? colors.success : colors.accents.water}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.centerLabel}>
        <Text style={[styles.amount, isComplete && styles.amountComplete]}>
          {currentNum}
        </Text>
        <Text style={styles.unit}>{currentUnit}</Text>
        <Text style={styles.goalText}>of {formatGoal(goal, unit)}</Text>
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
  // A HERO value — the single dominant number this card is built around — so
  // it takes `typography.titleRoot`, not the stat-cell token. The old 36/bold
  // headline also carried a `lineHeight: 40` and a `-2` nudge on the unit
  // below it; both existed only to manage that headline's metrics and go
  // with it, since 28 needs neither.
  amount: {
    ...typography.titleRoot,
    color: colors.text,
  },
  amountComplete: {
    color: colors.success,
  },
  unit: {
    ...typography.body,
    color: colors.textMuted,
  },
  goalText: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
});
