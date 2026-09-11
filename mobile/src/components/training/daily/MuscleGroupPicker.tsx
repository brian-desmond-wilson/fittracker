// mobile/src/components/training/daily/MuscleGroupPicker.tsx
// Mockup A4: one tile per region over the app's own body figure, grouped,
// with Select all per group. Multi-select. Primary muscles only — said in
// the sub-line so nobody wonders why a triceps-secondary workout is missing.
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { MUSCLE_GROUPS } from "@/src/lib/dailyCoverage";
import { BodyFigure } from "./BodyFigure";

/** Regions the front view cannot show. Everything else is drawn from the front. */
const BACK_ONLY = new Set(["Upper Back", "Lats", "Triceps", "Lower Back", "Glutes", "Hamstrings"]);

interface MuscleGroupPickerProps {
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
}

export function MuscleGroupPicker({ selected, onChange, onBack }: MuscleGroupPickerProps) {
  const insets = useSafeAreaInsets();
  const isOn = (m: string) => selected.includes(m);
  const toggle = (m: string) =>
    onChange(isOn(m) ? selected.filter((x) => x !== m) : [...selected, m]);
  const toggleGroup = (muscles: string[]) => {
    const all = muscles.every(isOn);
    onChange(all
      ? selected.filter((x) => !muscles.includes(x))
      : [...selected, ...muscles.filter((m) => !isOn(m))]);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Back to filters">
          <ChevronLeft size={24} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.title}>Muscle groups</Text>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.sub}>Matches a workout&apos;s primary muscles. Pick as many as you like.</Text>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {MUSCLE_GROUPS.map((g) => {
          const all = g.muscles.every(isOn);
          return (
            <View key={g.title}>
              <View style={styles.sectionRow}>
                <Text style={styles.section}>{g.title}</Text>
                {g.muscles.length > 1 && (
                  <TouchableOpacity onPress={() => toggleGroup(g.muscles)} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                    <Text style={styles.link}>{all ? "Clear" : "Select all"}</Text>
                  </TouchableOpacity>
                )}
              </View>
              <View style={styles.grid}>
                {g.muscles.map((m) => {
                  const on = isOn(m);
                  const full = m === "Full Body";
                  return (
                    <TouchableOpacity key={m} style={[styles.tile, on && styles.tileOn]}
                      onPress={() => toggle(m)}
                      accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                      accessibilityLabel={m}>
                      <BodyFigure
                        view={BACK_ONLY.has(m) ? "back" : "front"}
                        width={46}
                        fillFor={(region) =>
                          (full || region === m) ? (on ? colors.brand : colors.textMuted) : colors.surface2}
                      />
                      <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={2}>{m}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  done: { fontSize: 15, fontWeight: "600", color: colors.brand },
  sub: { fontSize: 12, color: colors.textFaint, paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm },
  sectionRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "baseline",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  section: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: colors.textMuted },
  link: { fontSize: 12, fontWeight: "600", color: colors.brand },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm },
  tile: {
    width: "31%", alignItems: "center", gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    // The figure's silhouette is drawn in surface2, so the tile sits one
    // step darker or the body vanishes and only the region floats.
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileLabel: { fontSize: 10.5, color: colors.textMuted, textAlign: "center", lineHeight: 12 },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
});
