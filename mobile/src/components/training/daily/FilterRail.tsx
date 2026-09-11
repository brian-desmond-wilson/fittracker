// mobile/src/components/training/daily/FilterRail.tsx
// The strip under the tab band (mockup A1/A6): sort chip left, Filters chip
// right, one removable chip per active filter beneath, then the count line.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from "react-native";
import { ArrowUpDown, ChevronDown, SlidersHorizontal, X } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import type { FilterChip } from "@/src/lib/filterChips";

interface FilterRailProps<Axis extends string> {
  sortLabel: string;
  onOpenSort: () => void;
  activeCount: number;
  onOpenFilters: () => void;
  chips: FilterChip<Axis>[];
  onRemoveChip: (chip: FilterChip<Axis>) => void;
  onClearAll: () => void;
  /** Items after filters and search. */
  shown: number;
  /** The whole library. */
  total: number;
  /** Count-line wording: ["workout", "workouts"] or ["exercise", "exercises"]. */
  noun: [singular: string, plural: string];
}

export function FilterRail<Axis extends string>({
  sortLabel, onOpenSort, activeCount, onOpenFilters, chips, onRemoveChip, onClearAll, shown, total, noun,
}: FilterRailProps<Axis>) {
  const filtered = activeCount > 0;
  // The count line answers "how much of the library am I looking at", so it
  // narrows for the header search too, not only for filters.
  const narrowed = filtered || shown !== total;
  return (
    <View style={styles.wrap}>
      <View style={styles.rail}>
        <TouchableOpacity style={styles.chip} onPress={onOpenSort}
          accessibilityRole="button" accessibilityLabel={`Sort by ${sortLabel}. Change sort.`}>
          <ArrowUpDown size={13} color={colors.textMuted} />
          <Text style={styles.chipText}>{sortLabel}</Text>
          <ChevronDown size={12} color={colors.textMuted} />
        </TouchableOpacity>
        <View style={styles.spacer} />
        <TouchableOpacity style={[styles.chip, filtered && styles.chipSelected]} onPress={onOpenFilters}
          accessibilityRole="button"
          accessibilityLabel={filtered ? `Filters, ${activeCount} active` : "Filters"}>
          <SlidersHorizontal size={13} color={filtered ? colors.brand : colors.textMuted} />
          <Text style={[styles.chipText, filtered && styles.chipTextSelected]}>Filters</Text>
          {filtered && (
            <View style={styles.badge}><Text style={styles.badgeText}>{activeCount}</Text></View>
          )}
        </TouchableOpacity>
      </View>

      {chips.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {chips.map((chip) => (
            <TouchableOpacity key={`${chip.axis}:${chip.label}`}
              style={[styles.chip, styles.chipSelected]}
              onPress={() => onRemoveChip(chip)}
              accessibilityRole="button" accessibilityLabel={`Remove filter ${chip.label}`}>
              <Text style={[styles.chipText, styles.chipTextSelected]}>{chip.label}</Text>
              <X size={12} color={colors.brand} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={styles.count}>
        <Text style={styles.countText}>
          <Text style={styles.countStrong}>{narrowed ? `${shown} of ${total}` : total}</Text>
          {" "}{total === 1 && !narrowed ? noun[0] : noun[1]}
        </Text>
        {filtered && (
          <TouchableOpacity onPress={onClearAll} accessibilityRole="button" accessibilityLabel="Clear all filters">
            <Text style={styles.clear}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rail: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.sm, paddingBottom: spacing.sm,
  },
  spacer: { flex: 1 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs, height: 30,
    paddingHorizontal: spacing.md, borderRadius: radii.pill,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
  },
  chipSelected: { backgroundColor: tint(colors.brand), borderColor: tint(colors.brand, 0.3) },
  chipText: { fontSize: 13, color: colors.textMuted },
  chipTextSelected: { color: colors.brand, fontWeight: "600" },
  badge: {
    backgroundColor: colors.brand, borderRadius: radii.pill, paddingHorizontal: spacing.xs, minWidth: 16,
    alignItems: "center",
  },
  badgeText: { fontSize: 10, fontWeight: "700", color: colors.onBrand, lineHeight: 15 },
  chips: { paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm, gap: 6 },
  count: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: spacing.screenGutter, paddingBottom: spacing.sm,
  },
  countText: { fontSize: 12, color: colors.textFaint },
  countStrong: { color: colors.textMuted, fontWeight: "600" },
  clear: { fontSize: 12, color: colors.brand, fontWeight: "600" },
});
