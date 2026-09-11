// mobile/src/components/training/daily/SortSheet.tsx
// Mockup A2. Comes up from the bottom; a tap picks and closes. Generic over
// the sort union: each tab hands in its own groups and labels.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { BottomSheet } from "@/src/components/ui/BottomSheet";
import { colors, spacing } from "@/src/theme/tokens";

interface SortSheetProps<S extends string> {
  visible: boolean;
  value: S;
  groups: { title: string; sorts: S[] }[];
  labels: Record<S, string>;
  sublabels?: Partial<Record<S, string>>;
  onSelect: (sort: S) => void;
  onClose: () => void;
}

export function SortSheet<S extends string>({
  visible, value, groups, labels, sublabels, onSelect, onClose,
}: SortSheetProps<S>) {
  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel="Close sort" padded={false}>
      <Text style={styles.title}>Sort by</Text>
      {groups.map((g) => (
        <View key={g.title}>
          <Text style={styles.section}>{g.title}</Text>
          {g.sorts.map((s) => {
            const on = s === value;
            const sub = sublabels?.[s];
            return (
              <TouchableOpacity key={s} style={styles.row}
                onPress={() => { onSelect(s); onClose(); }}
                accessibilityRole="radio" accessibilityState={{ selected: on }}>
                <View style={styles.rowText}>
                  <Text style={styles.label}>{labels[s]}</Text>
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
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
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
