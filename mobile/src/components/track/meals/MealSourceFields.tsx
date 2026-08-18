// Where a meal comes from — the one question every "keep this" flow asks.
//
// Three doors write meals from logs now (the library's promotion shelf, the
// log sheet's keep switch, the log editor's save action), and they must ask it
// identically: the same three kinds, the same fallback rules, the same vendor
// suggestions. One component, so "Thistle" typed in any of them is offered in
// all of them.
import React from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import type { MealSourceKind } from "@/src/lib/mealLibraryView";
import type { SourceSuggestion } from "@/src/lib/supabase/mealLibrary";

const SOURCES: Array<{ kind: MealSourceKind; label: string }> = [
  { kind: "home", label: "Made it" },
  { kind: "packaged", label: "Packaged" },
  { kind: "out", label: "Bought out" },
];

/** Enough suggestions to cover the vendors you actually use without the row
 *  becoming a directory. */
const SUGGESTIONS_SHOWN = 6;

/** The DB refuses a name on a home-made meal and requires one otherwise; this
 *  is the one place the fallback wording lives. */
export function resolveSourceName(kind: MealSourceKind, typed: string): string | null {
  if (kind === "home") return null;
  return typed.trim() || (kind === "packaged" ? "Packaged" : "Eaten out");
}

interface MealSourceFieldsProps {
  sourceKind: MealSourceKind;
  onSourceKindChange: (next: MealSourceKind) => void;
  sourceName: string;
  onSourceNameChange: (next: string) => void;
  /** Vendors you keep plus names your meals already carry; may be empty. */
  suggestions: SourceSuggestion[];
  disabled?: boolean;
}

export function MealSourceFields({
  sourceKind,
  onSourceKindChange,
  sourceName,
  onSourceNameChange,
  suggestions,
  disabled,
}: MealSourceFieldsProps) {
  const shown = suggestions.slice(0, SUGGESTIONS_SHOWN);
  return (
    <View>
      <Text style={s.label}>Where it comes from</Text>
      <View style={s.segTrack}>
        {SOURCES.map(({ kind, label }) => {
          const active = sourceKind === kind;
          return (
            <TouchableOpacity
              key={kind}
              style={[s.segment, active && s.segmentActive]}
              onPress={() => onSourceKindChange(kind)}
              disabled={disabled}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[s.segmentText, active && s.segmentTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {sourceKind !== "home" && (
        <>
          <Text style={s.label}>{sourceKind === "out" ? "Where from" : "Brand"}</Text>
          <TextInput
            style={s.input}
            value={sourceName}
            onChangeText={onSourceNameChange}
            placeholder={sourceKind === "out" ? "DoorDash · Chipotle" : "Thistle"}
            placeholderTextColor={colors.textMuted}
            editable={!disabled}
          />
          {shown.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={s.chipRow}
            >
              {shown.map((sugg) => {
                const active = sourceName.trim() === sugg.name;
                return (
                  <TouchableOpacity
                    key={sugg.name}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => onSourceNameChange(sugg.name)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>{sugg.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  label: { ...typography.section, marginTop: spacing.md, marginBottom: spacing.xs },
  segTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.md,
    borderRadius: radii.pill,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.buttonSm, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token
    color: colors.text,
  },
  chipRow: { marginTop: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.buttonSm, color: colors.textMuted },
  chipTextActive: { color: colors.onBrand },
});
