// mobile/src/components/training/daily/MuscleGroupPicker.tsx
// One tile per region, grouped, with Select all per group. Multi-select.
// Tiles show the shared muscle picture (MuscleIcon); "Full Body" is a tag,
// not a muscle, and keeps the body figure with every region lit. Primary
// muscles only — said in the sub-line so nobody wonders why a
// triceps-secondary workout is missing.
import React from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { MUSCLE_GROUPS } from "@/src/lib/dailyCoverage";
import { BodyFigure } from "./BodyFigure";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";

interface MuscleGroupPickerProps {
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
  /** The one-line rule under the title. Defaults to the Workouts wording. */
  subline?: string;
}

export function MuscleGroupPicker({ selected, onChange, onBack, subline }: MuscleGroupPickerProps) {
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
      <Text style={styles.sub}>{subline ?? "Matches a workout's primary muscles. Pick as many as you like."}</Text>
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
                      {full ? (
                        <BodyFigure
                          view="front"
                          width={34}
                          fillFor={() => (on ? colors.brand : colors.textMuted)}
                        />
                      ) : (
                        <MuscleIcon muscle={m} size={56} />
                      )}
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
    // One step darker than the pictures' own surface so the Full Body figure
    // (drawn in surface2) still reads; the icon tiles match it for consistency.
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileLabel: { fontSize: 10.5, color: colors.textMuted, textAlign: "center", lineHeight: 12 },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
});
