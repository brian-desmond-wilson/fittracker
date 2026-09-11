// mobile/src/components/training/daily/filterSheet/EquipmentGrid.tsx
// The 4-column icon tiles. The caller hands in the tile list: Workouts uses
// the fixed EQUIPMENT_GRID, Exercises whatever its catalog carries.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import {
  Bike, Box, Cable, Circle, CircleDashed, CircleDot, Cog, Dumbbell, Minus, Move,
  PersonStanding, RectangleHorizontal, Repeat, Waves, Weight,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { KettlebellIcon } from "@/src/components/ui/KettlebellIcon";

/** A glyph per known name. The kettlebell is the app's own; the rest are the
 *  nearest lucide shapes. Anything unknown gets the box. */
const EQUIPMENT_ICONS: Record<string, LucideIcon | "kettlebell"> = {
  Kettlebell: "kettlebell", Dumbbell, Barbell: Weight, Bodyweight: PersonStanding, Bands: CircleDashed,
  Bar: Minus, Box, "Jump Rope": Repeat, Bench: RectangleHorizontal, Sled: Move, Cable, Machine: Cog,
  Rings: Circle, "Med Ball": CircleDot, Bike, Rower: Waves,
};

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
        const Icon = EQUIPMENT_ICONS[e.name] ?? Box;
        const color = on ? colors.brand : colors.textMuted;
        return (
          <TouchableOpacity key={e.name} style={[styles.tile, on && styles.tileOn, dim && styles.tileDim]}
            onPress={() => onToggle(e.name)}
            accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={e.label}
            accessibilityHint={dim ? dimHint : undefined}>
            {Icon === "kettlebell"
              ? <KettlebellIcon size={24} color={color} />
              : <Icon size={24} color={color} strokeWidth={1.6} />}
            <Text style={[styles.tileLabel, on && styles.tileLabelOn]} numberOfLines={1}>{e.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.screenGutter },
  tile: {
    width: "22%", flexGrow: 1, alignItems: "center", gap: spacing.xs,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radii.row,
  },
  tileOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  tileDim: { opacity: 0.5 },
  tileLabel: { fontSize: 10, color: colors.textMuted, textAlign: "center" },
  tileLabelOn: { color: colors.brand, fontWeight: "600" },
});
