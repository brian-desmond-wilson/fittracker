import React from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "@/src/lib/colors";
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
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="rgba(59, 130, 246, 0.15)"
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={isComplete ? "#22C55E" : "#3B82F6"}
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
  amount: {
    fontSize: 36,
    fontWeight: "bold",
    color: "#3B82F6",
    lineHeight: 40,
  },
  amountComplete: {
    color: "#22C55E",
  },
  unit: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginTop: -2,
  },
  goalText: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginTop: 4,
  },
});
