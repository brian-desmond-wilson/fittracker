import React from "react";
import { Switch, Text, TouchableOpacity, View } from "react-native";
import type {
  NutritionConstraints,
  SpiceTolerance,
} from "@/src/types/nutrition-preferences";
import type { ConstraintsPatch } from "@/src/lib/supabase/nutritionPreferences";
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

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
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
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
    <View style={s.chipPickerContainer}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.chipRow}>
        {choices.map((c) => {
          const active = c === value;
          return (
            <TouchableOpacity
              key={String(c)}
              style={[s.chip, active && s.chipActive]}
              onPress={() => onChange(c)}
            >
              <Text style={[s.chipText, active && s.chipTextActive]}>
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
    <View style={s.card}>
      <Text style={s.sectionTitle}>Eating Constraints</Text>
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
    </View>
  );
}
