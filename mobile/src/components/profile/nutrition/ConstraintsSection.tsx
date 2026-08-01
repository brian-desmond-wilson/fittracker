import React from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import type {
  NutritionConstraints,
  SpiceTolerance,
} from "@/src/types/nutrition-preferences";
import type { ConstraintsPatch } from "@/src/lib/supabase/nutritionPreferences";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Card, SectionHeader } from "@/src/components/ui";

const SPICE_LEVELS: SpiceTolerance[] = ["none", "mild", "medium", "hot"];
const PREP_CHOICES = [5, 10, 15, 20];
const LEFTOVER_CHOICES = [12, 24, 48];

interface ConstraintsSectionProps {
  constraints: NutritionConstraints;
  onPatch: (patch: ConstraintsPatch) => void;
}

function BoolRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.brand, false: colors.border }}
      />
    </View>
  );
}

function ChipPicker<T extends string | number>({
  label,
  choices,
  value,
  format,
  onChange,
}: {
  label: string;
  choices: T[];
  value: T;
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.chipPickerContainer}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {choices.map((c) => {
          const active = c === value;
          return (
            <TouchableOpacity
              key={String(c)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onChange(c)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {format(c)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export function ConstraintsSection({
  constraints,
  onPatch,
}: ConstraintsSectionProps) {
  return (
    <Card variant="panel" style={styles.cardSpacing}>
      <View style={styles.sectionHeaderWrap}>
        <SectionHeader title="Eating Constraints" />
      </View>
      <BoolRow
        label="EoE (soft textures, small pieces)"
        value={constraints.has_eoe}
        onChange={(v) => onPatch({ has_eoe: v })}
      />
      <BoolRow
        label="Avoid eating with hands"
        value={constraints.avoids_eating_with_hands}
        onChange={(v) => onPatch({ avoids_eating_with_hands: v })}
      />
      <BoolRow
        label="Prefer bowls"
        value={constraints.prefers_bowls}
        onChange={(v) => onPatch({ prefers_bowls: v })}
      />
      <BoolRow
        label="Small frequent meals"
        value={constraints.prefers_small_frequent_meals}
        onChange={(v) => onPatch({ prefers_small_frequent_meals: v })}
      />
      <ChipPicker
        label="Spice tolerance"
        choices={SPICE_LEVELS}
        value={constraints.spice_tolerance}
        format={(v) => v}
        onChange={(v) => onPatch({ spice_tolerance: v })}
      />
      <ChipPicker
        label="Max prep time"
        choices={PREP_CHOICES}
        value={constraints.max_prep_minutes}
        format={(v) => `${v} min`}
        onChange={(v) => onPatch({ max_prep_minutes: v })}
      />
      <ChipPicker
        label="Leftovers OK for"
        choices={LEFTOVER_CHOICES}
        value={constraints.max_leftover_hours}
        format={(v) => `${v} h`}
        onChange={(v) => onPatch({ max_leftover_hours: v })}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: spacing.lg },
  sectionHeaderWrap: { marginBottom: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  // Label beside a control in a row — body copy, not a field heading.
  rowLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
  // Label ABOVE a field group — the one form-label token.
  fieldLabel: { ...typography.section },
  chipPickerContainer: { paddingVertical: spacing.md },
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
