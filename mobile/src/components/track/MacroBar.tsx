import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors } from "@/src/lib/colors";
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
    marginBottom: 10,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.foreground,
  },
  value: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  track: {
    height: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden",
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
