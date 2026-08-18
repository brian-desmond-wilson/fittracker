// "You eat this, but the library has never heard of it."
//
// The catalog claims to hold every meal you have ever eaten, and hand-typed
// and scanned logs were quietly excluded — a thing you order weekly stayed
// invisible to availability, scoring, favourites and suggestions forever.
// This is the doorway: repeat ad-hoc logs, and one tap to make each one a
// real meal.
import React, { useState } from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, Card, SectionHeader } from "@/src/components/ui";
import { adHocSummary, AD_HOC_MIN_TIMES, type AdHocCandidate } from "@/src/lib/adHocMeals";
import { CATEGORY_LABELS, CATEGORY_SECTION_ORDER, type MealCategory } from "@/src/types/meal-library";
import type { MealSourceKind } from "@/src/lib/mealLibraryView";
import type { SourceSuggestion } from "@/src/lib/supabase/mealLibrary";
import { MealSourceFields, resolveSourceName } from "../MealSourceFields";

interface AdHocSectionProps {
  candidates: AdHocCandidate[];
  /** Vendors you keep plus names your meals already carry. */
  sourceSuggestions: SourceSuggestion[];
  onPromote: (
    candidate: AdHocCandidate,
    meta: { category: MealCategory; source_kind: MealSourceKind; source_name: string | null },
  ) => Promise<void>;
}

export function AdHocSection({ candidates, sourceSuggestions, onPromote }: AdHocSectionProps) {
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
        source_name: resolveSourceName(sourceKind, sourceName),
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

            <MealSourceFields
              sourceKind={sourceKind}
              onSourceKindChange={setSourceKind}
              sourceName={sourceName}
              onSourceNameChange={setSourceName}
              suggestions={sourceSuggestions}
              disabled={saving}
            />

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
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionButton: { flex: 1 },
});
