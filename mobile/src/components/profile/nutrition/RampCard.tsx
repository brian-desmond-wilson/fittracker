import React from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CalorieRampLevel } from "@/src/types/nutrition-preferences";
import type { RampAssessment } from "@/src/lib/rampProgress";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, Card, SectionHeader } from "@/src/components/ui";

interface RampCardProps {
  levels: CalorieRampLevel[];
  assessment: RampAssessment | null;
  // Container (Task 11) adapts this to the changeRampLevel RPC call
  // (targetLevelId, todayLocalDate) — this component stays unaware of
  // persistence.
  onChangeLevel: (target: CalorieRampLevel) => void;
}

export function RampCard({ levels, assessment, onChangeLevel }: RampCardProps) {
  const active = levels.find((l) => l.is_active) ?? null;
  const next = active
    ? levels.find((l) => l.level === active.level + 1) ?? null
    : levels[0] ?? null;

  const confirmChange = (target: CalorieRampLevel) => {
    Alert.alert(
      "Change ramp level",
      `Set Level ${target.level} · ${target.name}?\nThis updates your daily targets to ${target.target_calories} cal / ${target.target_protein_g} g protein.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => onChangeLevel(target) },
      ]
    );
  };

  return (
    <Card variant="panel" style={styles.cardSpacing}>
      <View style={styles.sectionHeaderWrap}>
        <SectionHeader title="Lean Bulk Ramp" />
      </View>
      {active ? (
        <View style={styles.row}>
          <Text style={styles.rowTitle}>
            Level {active.level} · {active.name}
          </Text>
          <Text style={styles.rowValue}>
            {active.target_calories} cal / {active.target_protein_g} g
          </Text>
        </View>
      ) : (
        <Text style={styles.mutedText}>No active level.</Text>
      )}
      {assessment && (
        <Text style={styles.mutedText}>
          {assessment.weeklyGainLbs !== null
            ? `Trend: ${assessment.weeklyGainLbs >= 0 ? "+" : ""}${assessment.weeklyGainLbs.toFixed(2)} lb/wk. `
            : ""}
          {assessment.reason}
        </Text>
      )}
      {assessment?.recommendation === "advance" && next && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            Time to advance to Level {next.level} · {next.name} (
            {next.target_calories} cal)?
          </Text>
          <Button
            label={`Advance to ${next.name}`}
            onPress={() => confirmChange(next)}
            fluid
          />
        </View>
      )}
      {assessment?.recommendation === "advance" && !next && active && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>
            You&apos;re at the top ramp level. If you&apos;re still
            plateaued, reassess your targets manually.
          </Text>
        </View>
      )}
      <Text style={[styles.mutedText, styles.mutedTextSpaced]}>Change level manually:</Text>
      <View style={styles.chipRow}>
        {levels.map((l) => {
          const isActive = l.id === active?.id;
          return (
            <TouchableOpacity
              key={l.id}
              style={[styles.chip, isActive && styles.chipActive]}
              disabled={isActive}
              onPress={() => confirmChange(l)}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
                L{l.level} {l.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // `Card` owns surface/radius/padding/border; placement is passed through.
  cardSpacing: { marginBottom: spacing.lg },
  // `SectionHeader` takes no style prop, so the gap below it lives on a wrapper.
  sectionHeaderWrap: { marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  rowTitle: { ...typography.rowTitle, color: colors.text, flexShrink: 1 },
  rowValue: { ...typography.body, color: colors.textMuted },
  mutedText: { ...typography.body, color: colors.textMuted },
  mutedTextSpaced: { marginTop: spacing.md },
  // Banner recipe, `success` variant: this prompt is a positive one ("time to
  // advance"), and the banner was already green.
  banner: {
    backgroundColor: tint(colors.success),
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: tint(colors.success, 0.3),
    padding: spacing.md,
    marginTop: spacing.md,
  },
  bannerText: {
    ...typography.buttonSm,
    color: colors.success,
    marginBottom: spacing.sm,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  // Grouped single-select: solid brand fill + `onBrand` label.
  chip: {
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.body, color: colors.textMuted },
  chipTextActive: { color: colors.onBrand, fontWeight: "700" },
});
