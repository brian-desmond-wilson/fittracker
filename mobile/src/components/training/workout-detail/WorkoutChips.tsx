// mobile/src/components/training/workout-detail/WorkoutChips.tsx
// The three chip sections of the workout page (spec 2026-09-13 §4.5–4.7).
// Every chip with a filterable value is a button into the Workouts tab.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import type { BlockRole, WorkoutMuscle } from "@/src/types/dailyBlocks";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";

const PRIMARY_ICON = 26;
const SECONDARY_ICON = 20;

// ---------- §4.5 role pills ----------

interface RolePillsProps {
  roles: BlockRole[];
  onFilter: (link: WorkoutFilterLink) => void;
}

/** MAIN · CONDITIONING … — quiet outlined pills; recommender tags, not headlines. */
export function RolePills({ roles, onFilter }: RolePillsProps) {
  if (roles.length === 0) return null;
  return (
    <View style={styles.pillRow}>
      {roles.map((role) => (
        <TouchableOpacity
          key={role}
          style={styles.pill}
          onPress={() => onFilter({ blockRoles: [role] })}
          accessibilityRole="button"
          accessibilityLabel={`Workouts that serve as ${role}`}
        >
          <Text style={styles.pillText}>{role}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ---------- §4.6 Hits ----------

interface HitsSectionProps {
  muscles: WorkoutMuscle[];
  onFilter: (link: WorkoutFilterLink) => void;
}

/** Primaries as named chips; secondaries as a dimmed icon row with the names in grey. */
export function HitsSection({ muscles, onFilter }: HitsSectionProps) {
  const primaries = muscles.filter((m) => m.isPrimary);
  const secondaries = muscles.filter((m) => !m.isPrimary);
  if (primaries.length === 0 && secondaries.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Hits</Text>
      {primaries.length > 0 && (
        <View style={styles.chipRow}>
          {primaries.map((m) => (
            <TouchableOpacity
              key={m.name}
              style={styles.muscleChip}
              onPress={() => onFilter({ muscles: [m.name] })}
              accessibilityRole="button"
              accessibilityLabel={`Workouts for ${m.name}`}
            >
              <MuscleIcon muscle={m.name} size={PRIMARY_ICON} />
              <Text style={styles.muscleName}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {secondaries.length > 0 && (
        <View style={[styles.chipRow, styles.secondaryRow]}>
          {secondaries.map((m) => (
            <TouchableOpacity
              key={m.name}
              onPress={() => onFilter({ muscles: [m.name] })}
              accessibilityRole="button"
              accessibilityLabel={`Workouts for ${m.name}`}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <MuscleIcon muscle={m.name} size={SECONDARY_ICON} dim />
            </TouchableOpacity>
          ))}
          <Text style={styles.secondaryNames} numberOfLines={2}>
            also {secondaries.map((m) => m.name).join(", ")}
          </Text>
        </View>
      )}
    </View>
  );
}

// ---------- §4.7 You'll need ----------

interface NeedsSectionProps {
  equipment: string[];
  isBodyweight: boolean;
  onFilter: (link: WorkoutFilterLink) => void;
}

/** One outlined tile per derived equipment name; bodyweight-only shows one
 *  untappable "Bodyweight" tile. Nothing derived and not bodyweight: the
 *  section is omitted rather than guessed. */
export function NeedsSection({ equipment, isBodyweight, onFilter }: NeedsSectionProps) {
  const tiles = equipment.length > 0 ? equipment : isBodyweight ? ["Bodyweight"] : [];
  if (tiles.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>You'll need</Text>
      <View style={styles.chipRow}>
        {tiles.map((name) => {
          const tappable = name !== "Bodyweight";
          return (
            <TouchableOpacity
              key={name}
              style={styles.equipTile}
              onPress={() => onFilter({ equipment: [name] })}
              disabled={!tappable}
              accessibilityRole={tappable ? "button" : "text"}
              accessibilityLabel={tappable ? `Workouts using ${name}` : name}
            >
              <View style={styles.equipBadge}>
                <EquipmentGlyph name={name} size={14} color={colors.brand} />
              </View>
              <Text style={styles.equipName}>{name}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  pillRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: spacing.sm },
  pill: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.border,
  },
  pillText: { fontSize: 10, color: colors.textMuted, textTransform: "uppercase", letterSpacing: 0.6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
  muscleChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.control,
    backgroundColor: tint(colors.brand, 0.08), borderWidth: 1, borderColor: tint(colors.brand, 0.35),
  },
  muscleName: { fontSize: 13, fontWeight: "600", color: colors.text },
  secondaryRow: { marginTop: spacing.sm, gap: 6 },
  secondaryNames: { flexShrink: 1, fontSize: 11, color: colors.textMuted, marginLeft: 2 },
  equipTile: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.control,
    borderWidth: 1, borderColor: colors.border,
  },
  // The Exercises card's badge: brand glyph on a brand tint, brand border.
  equipBadge: {
    width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: colors.brand,
  },
  equipName: { fontSize: 13, color: colors.text },
});
