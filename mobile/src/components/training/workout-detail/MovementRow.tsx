// mobile/src/components/training/workout-detail/MovementRow.tsx
// One movement (spec 2026-09-13 §4.8, decision 6): number, 64pt thumbnail,
// name + prescription (+ note), then an icon-only facts line — primary
// muscle, up to two dimmed secondaries, a hairline, one badge per
// equipment name. The row opens the exercise. Items built without the join
// (no `muscles`/`equipment`) draw without a facts line.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { ChevronRight, Dumbbell } from "lucide-react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import { formatWorkoutItem } from "@/src/lib/workoutFormat";
import { movementGear } from "@/src/lib/workoutEquipment";
import { muscleIconSlug } from "@/src/lib/muscleIconCatalog";
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
  const [imageFailed, setImageFailed] = useState(false);
  // A rehost sweep can repair a URL that previously 404'd; without this, a
  // row that once failed stays stuck on the fallback even after the fix.
  useEffect(() => {
    setImageFailed(false);
  }, [item.imageUrl]);
  const prescription = formatWorkoutItem(item);

  // MuscleIcon draws nothing for a name without a picture ("Full Body" on a
  // run), and an invisible icon must not claim a slot, a hairline, or the
  // thumbnail fallback — so layout is driven only by picturable muscles.
  const primary = item.muscles?.find((m) => m.isPrimary && muscleIconSlug(m.name) !== null)?.name ?? null;
  const secondaries = (item.muscles ?? [])
    .filter((m) => !m.isPrimary && muscleIconSlug(m.name) !== null)
    .slice(0, MAX_SECONDARY_ICONS)
    .map((m) => m.name);
  // Surfaces ("Floor"/"Wall") and Bodyweight are how the movement is done,
  // not what it needs — the Exercises card and the workout-level "You'll
  // need" both leave them out, so this badge row does too.
  const equipment = movementGear(item);
  const hasFacts = primary !== null || secondaries.length > 0 || equipment.length > 0;

  // The a11y label reads the real muscles regardless of picture — a "Full
  // Body" run still announces "Primary Full Body" even though the row draws
  // the dumbbell glyph in its place.
  const primaryLabel = item.muscles?.find((m) => m.isPrimary)?.name ?? null;
  const secondaryLabels = (item.muscles ?? []).filter((m) => !m.isPrimary).slice(0, MAX_SECONDARY_ICONS).map((m) => m.name);

  const a11yFacts = [
    `${index}. ${item.name}`,
    prescription || null,
    primaryLabel ? `Primary ${primaryLabel}` : null,
    secondaryLabels.length ? `also ${secondaryLabels.join(", ")}` : null,
    equipment.length ? equipment.join(", ") : null,
  ].filter(Boolean).join(". ");
  // The mapper writes "" for exerciseId when the exercise did not join, so
  // there is nothing to open — don't promise it in the label.
  const a11y = item.exerciseId ? `${a11yFacts}. Open the exercise.` : a11yFacts;

  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      // The mapper writes "" for exerciseId when the exercise did not join;
      // this guard is reachable for those unmatched rows.
      disabled={!item.exerciseId}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={a11y}
    >
      <Text style={styles.index}>{index}</Text>
      {item.imageUrl && !imageFailed ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.thumb}
          // A rehosted picture can 404 after a sweep; a blank grey square
          // would read as a missing exercise, so fall back like no-image.
          onError={() => setImageFailed(true)}
        />
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
