// mobile/src/components/training/workout-detail/WorkoutStatRow.tsx
// Time / Intensity / Skill / Scored by (spec 2026-09-13 §4.3). Format is
// not here — it is on the hero badge and the list band. A cell with a value
// is a button into the Workouts tab with that one axis applied; an empty
// cell shows a dash and does nothing. Same frame as the exercise page's
// meta row.
import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { colors } from "@/src/theme/tokens";
import { SCORE_LABELS } from "@/src/lib/workoutFormatVocab";
import { INTENSITY_LABELS } from "@/src/types/workoutFilters";
import { lengthBandOf } from "@/src/lib/workoutFilters";
import type { WorkoutTags } from "@/src/types/dailyBlocks";
import type { WorkoutFilterLink } from "@/src/lib/workoutFilterLink";

interface WorkoutStatRowProps {
  tags: WorkoutTags;
  onFilter: (link: WorkoutFilterLink) => void;
}

const EMPTY = "—";

export function WorkoutStatRow({ tags, onFilter }: WorkoutStatRowProps) {
  const band = tags.estMinutes === null ? null : lengthBandOf(tags.estMinutes);
  const cells: { label: string; value: string | null; link: WorkoutFilterLink | null; a11y: string }[] = [
    {
      label: "Time",
      value: tags.estMinutes === null ? null : `~${tags.estMinutes} min`,
      link: band ? { lengths: [band] } : null,
      a11y: "Workouts of this length",
    },
    {
      label: "Intensity",
      value: tags.intensity === null ? null : INTENSITY_LABELS[tags.intensity],
      link: tags.intensity === null ? null : { intensity: tags.intensity },
      a11y: "Workouts at this intensity",
    },
    {
      label: "Skill",
      value: tags.skillLevel,
      link: tags.skillLevel === null ? null : { skills: [tags.skillLevel] },
      a11y: "Workouts at this skill level",
    },
    {
      label: "Scored by",
      value: tags.scoreType === null ? null : SCORE_LABELS[tags.scoreType],
      link: tags.scoreType === null ? null : { scores: [tags.scoreType] },
      a11y: "Workouts scored this way",
    },
  ];

  return (
    <View style={styles.row}>
      {cells.map((c) => (
        <Pressable
          key={c.label}
          style={styles.cell}
          hitSlop={4}
          disabled={!c.link}
          onPress={() => c.link && onFilter(c.link)}
          accessibilityRole={c.link ? "button" : "text"}
          accessibilityLabel={c.link ? `${c.label} ${c.value}. ${c.a11y}` : `${c.label} not set`}
        >
          <Text style={styles.label}>{c.label}</Text>
          {/* Shrink rather than ellipsise: long values ("Rounds + reps",
              "Duration / hold") must still read whole across four columns. */}
          <Text
            style={[styles.value, !c.value && styles.valueEmpty]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {c.value ?? EMPTY}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", padding: 16, gap: 12, backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  cell: { flex: 1 },
  label: { fontSize: 11, fontWeight: "600", color: colors.textMuted, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 15, fontWeight: "600", color: colors.text },
  valueEmpty: { color: colors.textFaint },
});
