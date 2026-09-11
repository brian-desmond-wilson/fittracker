// mobile/src/components/training/daily/filterSheet/FilterPills.tsx
// Multi-select pills. `dashed` marks a state rather than a value (Workouts'
// "Untagged").
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";

export function FilterPill({ label, on, dashed, onPress }: {
  label: string; on: boolean; dashed?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={[styles.pill, dashed && styles.pillDashed, on && styles.pillOn]} onPress={onPress}
      accessibilityRole="button" accessibilityState={{ selected: on }}>
      <Text style={[styles.pillText, on && styles.pillTextOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function FilterPillRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.pills}>{children}</View>;
}

/** Add or remove one value in a list-valued axis. */
export function toggleIn<T extends string>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

const styles = StyleSheet.create({
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  pill: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  pillOn: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.3) },
  pillDashed: { borderStyle: "dashed", borderColor: colors.textFaint },
  pillText: { fontSize: 13, color: colors.textMuted },
  pillTextOn: { color: colors.brand, fontWeight: "600" },
});
