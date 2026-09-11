// mobile/src/components/training/daily/filterSheet/FilterRow.tsx
// A row that pushes a page inside the sheet: label, current value, chevron.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, spacing } from "@/src/theme/tokens";

interface FilterRowProps {
  label: string;
  /** Null shows the placeholder in faint text; a value shows in brand green. */
  value: string | null;
  placeholder: string;
  first?: boolean;
  onPress: () => void;
}

export function FilterRow({ label, value, placeholder, first, onPress }: FilterRowProps) {
  return (
    <TouchableOpacity style={[styles.row, first && styles.rowFirst]} onPress={onPress}
      accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={[styles.rowValue, value !== null && styles.rowValueOn]} numberOfLines={1}>
          {value ?? placeholder}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowFirst: { borderTopWidth: 1, borderTopColor: colors.border },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, color: colors.text },
  rowValue: { fontSize: 12, color: colors.textFaint, marginTop: 2 },
  rowValueOn: { color: colors.brand },
});
