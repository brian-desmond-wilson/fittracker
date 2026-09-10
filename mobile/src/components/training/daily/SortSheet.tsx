// mobile/src/components/training/daily/SortSheet.tsx
// Mockup A2. Comes up from the bottom; a tap picks and closes.
import React from "react";
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import type { WorkoutSort } from "@/src/types/workoutFilters";
import { SORT_GROUPS, SORT_LABELS, SORT_SUBLABELS } from "@/src/types/workoutFilters";

interface SortSheetProps {
  visible: boolean;
  value: WorkoutSort;
  onSelect: (sort: WorkoutSort) => void;
  onClose: () => void;
}

export function SortSheet({ visible, value, onSelect, onClose }: SortSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close sort" />
      <View style={styles.sheet}>
        <View style={styles.grab} />
        <Text style={styles.title}>Sort by</Text>
        {SORT_GROUPS.map((g) => (
          <View key={g.title}>
            <Text style={styles.section}>{g.title}</Text>
            {g.sorts.map((s) => {
              const on = s === value;
              const sub = SORT_SUBLABELS[s];
              return (
                <TouchableOpacity key={s} style={styles.row}
                  onPress={() => { onSelect(s); onClose(); }}
                  accessibilityRole="radio" accessibilityState={{ selected: on }}>
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{SORT_LABELS[s]}</Text>
                    {sub ? <Text style={styles.sub}>{sub}</Text> : null}
                  </View>
                  <View style={[styles.radio, on && styles.radioOn]}>
                    {on ? <View style={styles.radioDot} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface, borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    paddingBottom: spacing.xxxl,
  },
  grab: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.textFaint, alignSelf: "center", marginTop: spacing.sm, marginBottom: spacing.xs },
  title: { fontSize: 16, fontWeight: "600", color: colors.text, textAlign: "center", paddingVertical: spacing.sm },
  section: {
    fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase",
    color: colors.textMuted, paddingHorizontal: spacing.screenGutter, paddingTop: spacing.md, paddingBottom: spacing.xs,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowText: { flex: 1 },
  label: { fontSize: 15, color: colors.text },
  sub: { fontSize: 12, color: colors.textFaint, marginTop: 1 },
  radio: {
    width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: colors.textFaint,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { borderColor: colors.brand, backgroundColor: colors.brand },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.onBrand },
});
