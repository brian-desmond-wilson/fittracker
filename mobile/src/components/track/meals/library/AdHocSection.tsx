// "You eat this, but the library has never heard of it."
//
// The catalog claims to hold every meal you have ever eaten, and hand-typed
// and scanned logs were quietly excluded — a thing you order weekly stayed
// invisible to availability, scoring, favourites and suggestions forever.
// This is the doorway: repeat ad-hoc logs, and one tap to make each one a
// real meal.
import React, { useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, Card, SectionHeader } from "@/src/components/ui";
import { adHocSummary, AD_HOC_MIN_TIMES, type AdHocCandidate } from "@/src/lib/adHocMeals";
import { CATEGORY_LABELS, CATEGORY_SECTION_ORDER, type MealCategory } from "@/src/types/meal-library";
import type { MealSourceKind } from "@/src/lib/mealLibraryView";

interface AdHocSectionProps {
  candidates: AdHocCandidate[];
  onPromote: (
    candidate: AdHocCandidate,
    meta: { category: MealCategory; source_kind: MealSourceKind; source_name: string | null },
  ) => Promise<void>;
}

const SOURCES: Array<{ kind: MealSourceKind; label: string }> = [
  { kind: "home", label: "Made it" },
  { kind: "packaged", label: "Packaged" },
  { kind: "out", label: "Ate out" },
];

export function AdHocSection({ candidates, onPromote }: AdHocSectionProps) {
  const [target, setTarget] = useState<AdHocCandidate | null>(null);
  const [category, setCategory] = useState<MealCategory>("lunch");
  const [sourceKind, setSourceKind] = useState<MealSourceKind>("home");
  const [sourceName, setSourceName] = useState("");
  const [saving, setSaving] = useState(false);

  if (candidates.length === 0) return null;

  const open = (c: AdHocCandidate) => {
    setTarget(c);
    setCategory("lunch");
    setSourceKind("home");
    setSourceName("");
  };

  const handleSave = async () => {
    if (!target) return;
    setSaving(true);
    try {
      await onPromote(target, {
        category,
        source_kind: sourceKind,
        // The DB refuses a name on a home-made meal and requires one
        // otherwise; falling back to the label keeps a blank field legal.
        source_name:
          sourceKind === "home"
            ? null
            : sourceName.trim() || (sourceKind === "packaged" ? "Packaged" : "Eaten out"),
      });
      setTarget(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={s.wrap}>
      <SectionHeader title="Eaten, but not in your library" />
      <Text style={s.help}>
        Logged {AD_HOC_MIN_TIMES}+ times and never saved as a meal. Save one
        and it joins the catalog — scored, stocked and suggestable like the
        rest.
      </Text>
      {candidates.map((c) => (
        <Card variant="row" key={c.name} style={s.row}>
          <View style={s.rowLine}>
            <View style={s.rowBody}>
              <Text style={s.name} numberOfLines={1}>{c.name}</Text>
              <Text style={s.meta}>{adHocSummary(c)}</Text>
            </View>
            <TouchableOpacity
              onPress={() => open(c)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Save ${c.name} as a meal`}
            >
              <Text style={s.action}>Save as meal</Text>
            </TouchableOpacity>
          </View>
        </Card>
      ))}

      <Modal visible={target !== null} transparent animationType="fade" onRequestClose={() => setTarget(null)}>
        <View style={s.backdrop}>
          <Card variant="panel" style={s.sheet}>
            <Text style={s.sheetTitle}>Save “{target?.name}” as a meal</Text>
            <Text style={s.sheetBody}>
              Its numbers come from what you usually log
              {target?.calories != null ? ` — about ${Math.round(target.calories)} cal` : ""}.
            </Text>

            <Text style={s.label}>Category</Text>
            <View style={s.chips}>
              {CATEGORY_SECTION_ORDER.map((c) => {
                const active = category === c;
                return (
                  <TouchableOpacity
                    key={c}
                    style={[s.chip, active && s.chipActive]}
                    onPress={() => setCategory(c)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[s.chipText, active && s.chipTextActive]}>{CATEGORY_LABELS[c]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={s.label}>Where it comes from</Text>
            <View style={s.segTrack}>
              {SOURCES.map(({ kind, label }) => {
                const active = sourceKind === kind;
                return (
                  <TouchableOpacity
                    key={kind}
                    style={[s.segment, active && s.segmentActive]}
                    onPress={() => setSourceKind(kind)}
                    disabled={saving}
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
                  onChangeText={setSourceName}
                  placeholder={sourceKind === "out" ? "DoorDash · Chipotle" : "Thistle"}
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </>
            )}

            <View style={s.actions}>
              <View style={s.actionButton}>
                <Button variant="secondary" label="Cancel" onPress={() => setTarget(null)} disabled={saving} fluid />
              </View>
              <View style={s.actionButton}>
                <Button label="Save" onPress={handleSave} loading={saving} fluid />
              </View>
            </View>
          </Card>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.screenGutter, marginTop: spacing.xl },
  help: { ...typography.caption, marginTop: spacing.sm, marginBottom: spacing.md },
  row: { marginBottom: spacing.sm },
  rowLine: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  rowBody: { flex: 1, minWidth: 0 },
  name: { ...typography.rowTitle, color: colors.text },
  meta: { ...typography.caption, marginTop: 2 },
  action: { ...typography.buttonSm, color: colors.brand },

  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sheet: { width: "100%", maxHeight: "100%" },
  sheetTitle: { ...typography.titleBar, color: colors.text, marginBottom: spacing.xs },
  sheetBody: { ...typography.caption, marginBottom: spacing.md },
  label: { ...typography.section, marginTop: spacing.md, marginBottom: spacing.xs },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.buttonSm, color: colors.textMuted },
  chipTextActive: { color: colors.onBrand },
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
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionButton: { flex: 1 },
});
