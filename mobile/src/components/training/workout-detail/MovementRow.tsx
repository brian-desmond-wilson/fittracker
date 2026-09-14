// mobile/src/components/training/workout-detail/MovementRow.tsx
// One movement (spec 2026-09-13 §4.8, decision 6): number, 64pt thumbnail,
// name + prescription (+ note), then an icon-only facts line — primary
// muscle, up to two dimmed secondaries, a hairline, one badge per
// equipment name. The row opens the exercise. Items built without the join
// (no `muscles`/`equipment`) draw without a facts line.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { ChevronRight, Dumbbell } from "lucide-react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import { formatWorkoutItem } from "@/src/lib/workoutFormat";
import type { CapturedWorkoutItemEntry } from "@/src/types/capture";

const THUMB = 64;
const ICON = 20;
const MAX_SECONDARY_ICONS = 2;

interface MovementRowProps {
  index: number;
  item: CapturedWorkoutItemEntry;
  onPress: () => void;
  /** Last row drops its hairline so the band below it does not double up. */
  last?: boolean;
}

export function MovementRow({ index, item, onPress, last = false }: MovementRowProps) {
  const prescription = formatWorkoutItem(item);
  const primary = item.muscles?.find((m) => m.isPrimary)?.name ?? null;
  const secondaries = (item.muscles ?? []).filter((m) => !m.isPrimary).slice(0, MAX_SECONDARY_ICONS).map((m) => m.name);
  const equipment = item.equipment ?? [];
  const hasFacts = primary !== null || secondaries.length > 0 || equipment.length > 0;

  const a11y = [
    `${index}. ${item.name}`,
    prescription || null,
    primary ? `Primary ${primary}` : null,
    secondaries.length ? `also ${secondaries.join(", ")}` : null,
    equipment.length ? equipment.join(", ") : null,
  ].filter(Boolean).join(". ") + ". Open the exercise.";

  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      disabled={!item.exerciseId}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={styles.index}>{index}</Text>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.thumb} />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]}>
          {primary
            ? <MuscleIcon muscle={primary} size={40} dim />
            : <Dumbbell size={24} color={colors.textFaint} strokeWidth={1.5} />}
        </View>
      )}
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
        {/* Silence beats invention: when the creator prescribed nothing, the
            movement stands on its own. */}
        {prescription !== "" && <Text style={styles.prescription}>{prescription}</Text>}
        {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
        {hasFacts && (
          <View style={styles.facts}>
            {primary && <MuscleIcon muscle={primary} size={ICON} />}
            {secondaries.map((m) => <MuscleIcon key={m} muscle={m} size={ICON} dim />)}
            {(primary || secondaries.length > 0) && equipment.length > 0 && <View style={styles.divider} />}
            {equipment.map((e) => (
              <View key={e} style={styles.equipBadge}>
                <EquipmentGlyph name={e} size={13} color={colors.brand} />
              </View>
            ))}
          </View>
        )}
      </View>
      {!!item.exerciseId && <ChevronRight size={18} color={colors.textMuted} style={styles.chevron} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  index: { width: 16, textAlign: "right", fontSize: 12, fontWeight: "700", color: colors.textFaint, paddingTop: 4 },
  thumb: { width: THUMB, height: THUMB, borderRadius: radii.control + 2, backgroundColor: colors.surface2 },
  thumbEmpty: { alignItems: "center", justifyContent: "center" },
  body: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: "600", color: colors.text, lineHeight: 18 },
  prescription: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  notes: { fontSize: 12, color: colors.textMuted, marginTop: 2, fontStyle: "italic" },
  facts: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  divider: { width: 1, height: 14, backgroundColor: colors.border, marginHorizontal: 2 },
  equipBadge: {
    width: 20, height: 20, borderRadius: 5, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: colors.brand,
  },
  chevron: { marginTop: 4 },
});
