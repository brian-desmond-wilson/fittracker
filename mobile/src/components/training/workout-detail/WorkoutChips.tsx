// mobile/src/components/training/workout-detail/WorkoutChips.tsx
// The three chip sections of the workout page (spec 2026-09-13 §4.5–4.7).
// Every chip with a filterable value is a button into the Workouts tab.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import { BLOCK_TITLES } from "@/src/lib/dailyBlockCompose";
import { FILTERABLE_ROLES } from "@/src/types/workoutFilters";
import type { BlockRole, WorkoutMuscle } from "@/src/types/dailyBlocks";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";

// Matches the exercise page's muscle tiles so the two read the same.
const TILE_ICON = 44;

// ---------- §4.5 role pills ----------

interface RolePillsProps {
  roles: BlockRole[];
  onFilter: (link: WorkoutFilterLink) => void;
}

/**
 * MAIN · CONDITIONING … — quiet outlined pills; recommender tags, not headlines.
 * Carries no section padding of its own — the caller's section supplies it.
 */
export function RolePills({ roles, onFilter }: RolePillsProps) {
  // bfr has no Workouts-tab filter, so a pill for it would link to nothing.
  const filterableRoles = roles.filter((role) => FILTERABLE_ROLES.includes(role));
  if (filterableRoles.length === 0) return null;
  return (
    <View style={styles.pillRow}>
      {filterableRoles.map((role) => {
        const title = BLOCK_TITLES[role];
        return (
          <TouchableOpacity
            key={role}
            style={styles.pill}
            onPress={() => onFilter({ blockRoles: [role] })}
            accessibilityRole="button"
            accessibilityLabel={`Workouts that serve as ${title}`}
          >
            <Text style={styles.pillText}>{title}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------- §4.6 Hits ----------

interface HitsSectionProps {
  muscles: WorkoutMuscle[];
  onFilter: (link: WorkoutFilterLink) => void;
}

/** Primary and secondary muscles as icon-over-name tiles — the same
 *  treatment as the exercise page (§4.6). Green-bordered fill for the
 *  primaries, muted surface for the secondaries; every tile filters the
 *  Workouts tab. A muscle with no picture (e.g. Full Body) becomes a
 *  text-only tile, matching the exercise page. */
export function HitsSection({ muscles, onFilter }: HitsSectionProps) {
  const primaries = muscles.filter((m) => m.isPrimary);
  const secondaries = muscles.filter((m) => !m.isPrimary);
  if (primaries.length === 0 && secondaries.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Hits</Text>
      {primaries.length > 0 && (
        <View style={styles.muscleGrid}>
          {primaries.map((m) => (
            <TouchableOpacity
              key={m.name}
              style={styles.musclePrimaryTile}
              onPress={() => onFilter({ muscles: [m.name] })}
              accessibilityRole="button"
              accessibilityLabel={`Workouts for ${m.name}`}
            >
              <MuscleIcon muscle={m.name} size={TILE_ICON} />
              <Text style={styles.musclePrimaryText}>{m.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {secondaries.length > 0 && (
        <>
          <Text style={styles.subsectionTitle}>Secondary Muscles</Text>
          <View style={styles.muscleGrid}>
            {secondaries.map((m) => (
              <TouchableOpacity
                key={m.name}
                style={styles.muscleSecondaryTile}
                onPress={() => onFilter({ muscles: [m.name] })}
                accessibilityRole="button"
                accessibilityLabel={`Workouts for ${m.name}`}
              >
                <MuscleIcon muscle={m.name} size={TILE_ICON} dim />
                <Text style={styles.muscleSecondaryText}>{m.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
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
  // Icon-over-name tiles, shared look with the exercise page.
  muscleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  subsectionTitle: { fontSize: 16, fontWeight: "600", color: colors.text, marginTop: 16, marginBottom: 8 },
  musclePrimaryTile: {
    flexDirection: "column", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: tint(colors.brand, 0.125),
    borderRadius: 8, borderWidth: 1, borderColor: colors.brand,
  },
  musclePrimaryText: { fontSize: 12, fontWeight: "600", color: colors.brand },
  muscleSecondaryTile: {
    flexDirection: "column", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10, backgroundColor: colors.surface,
    borderRadius: 8, borderWidth: 1, borderColor: colors.border,
  },
  muscleSecondaryText: { fontSize: 12, fontWeight: "500", color: colors.textMuted },
  equipTile: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radii.control,
    borderWidth: 1, borderColor: colors.border,
  },
  // The Exercises card's badge treatment, sized for a tile.
  equipBadge: {
    width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: colors.brand,
  },
  equipName: { fontSize: 13, color: colors.text },
});
