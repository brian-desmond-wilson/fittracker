import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";
import { MealPaceState } from "@/src/lib/mealPace";

interface MealsPaceLinesProps {
  caloriePace: MealPaceState | null;
  proteinPace: MealPaceState | null;
}

/**
 * Renders up to two pace lines (Calories + Protein) under the rings.
 * Returns null when there's nothing actionable to show (both lines are
 * in before/after window or both don't have goals set).
 */
export function MealsPaceLines({ caloriePace, proteinPace }: MealsPaceLinesProps) {
  const calLine = renderLine("Calories", caloriePace, "cal");
  const proLine = renderLine("Protein", proteinPace, "g");
  if (!calLine && !proLine) return null;
  return (
    <View style={styles.wrap}>
      {calLine}
      {proLine}
    </View>
  );
}

function renderLine(
  label: string,
  pace: MealPaceState | null,
  unit: string,
): React.ReactNode {
  if (!pace) return null;
  switch (pace.status) {
    case "before_window":
    case "after_window":
      return null;
    case "goal_hit":
      return (
        <Text key={label} style={[styles.line, styles.good]}>
          {label}: goal hit ✓
        </Text>
      );
    case "on_pace":
      return (
        <Text key={label} style={[styles.line, styles.neutral]}>
          {label}: on pace · keep it up
        </Text>
      );
    case "ahead":
      return (
        <Text key={label} style={[styles.line, styles.good]}>
          {label}: {pace.delta ?? 0}{unit} ahead of pace
        </Text>
      );
    case "behind":
      return (
        <Text key={label} style={[styles.line, styles.behind]}>
          {label}: {pace.delta ?? 0}{unit} behind · eat {pace.catchUpAmount ?? 0}
          {unit} by {pace.catchUpLabel}
        </Text>
      );
  }
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  line: {
    fontSize: 12,
    marginVertical: 2,
    textAlign: "center",
  },
  neutral: {
    color: "#3B82F6",
    fontWeight: "600",
  },
  good: {
    color: "#22C55E",
    fontWeight: "600",
  },
  behind: {
    color: "#F59E0B",
    fontWeight: "600",
  },
});
