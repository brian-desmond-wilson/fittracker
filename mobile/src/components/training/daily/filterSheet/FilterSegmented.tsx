// mobile/src/components/training/daily/filterSheet/FilterSegmented.tsx
// Single-choice control for a small closed set (Intensity, History, Picture).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";

export function FilterSegmented<T extends string>({ options, value, onPick }: {
  options: { value: T; label: string }[]; value: T; onPick: (v: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <TouchableOpacity key={o.value} style={[styles.segItem, on && styles.segItemOn]}
            onPress={() => onPick(o.value)}
            accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <Text style={[styles.segText, on && styles.segTextOn]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: "row", marginHorizontal: spacing.screenGutter,
    backgroundColor: colors.surface2, borderRadius: radii.control, padding: spacing.xs,
  },
  segItem: { flex: 1, alignItems: "center", paddingVertical: spacing.sm, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 13, color: colors.textMuted },
  segTextOn: { color: colors.onBrand, fontWeight: "600" },
});
