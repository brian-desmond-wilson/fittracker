// mobile/src/components/training/daily/filterSheet/EquipmentGrid.tsx
// The 4-column icon tiles. The caller hands in the tile list: Workouts uses
// the fixed EQUIPMENT_GRID, Exercises whatever its catalog carries.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";

interface EquipmentGridProps {
  tiles: { name: string; label: string }[];
  selected: string[];
  /** Names at least one item carries; the rest draw dimmed but stay tappable. */
  available: Set<string>;
  /** Accessibility hint on a dimmed tile. */
  dimHint: string;
  onToggle: (name: string) => void;
}

export function EquipmentGrid({ tiles, selected, available, dimHint, onToggle }: EquipmentGridProps) {
  return (
    <View style={styles.grid}>
      {tiles.map((e) => {
        const on = selected.includes(e.name);
        const dim = !on && !available.has(e.name);
        const color = on ? colors.brand : colors.textMuted;
        return (
          <TouchableOpacity key={e.name} style={[styles.tile, on && styles.tileOn, dim && styles.tileDim]}
            onPress={() => onToggle(e.name)}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={e.label}
            accessibilityHint={dim ? dimHint : undefined}>
            <EquipmentGlyph name={e.name} size={24} color={color} strokeWidth={1.6} />
            <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={1}>{e.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  // Fixed four-up width so a short last row keeps the same tile size as full
  // rows (no flexGrow, which would stretch an odd last row wider).
  tile: {
    width: "23%", alignItems: "center", gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileDim: { opacity: 0.5 },
  tileLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center" },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
});
