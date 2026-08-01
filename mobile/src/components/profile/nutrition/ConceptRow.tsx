import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type {
  ConceptRating,
  FoodConcept,
} from "@/src/types/nutrition-preferences";
import { CONCEPT_RATINGS } from "@/src/types/nutrition-preferences";
import type { ConceptPatch } from "@/src/lib/supabase/nutritionPreferences";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";

export const RATING_LABELS: Record<ConceptRating, string> = {
  never: "Never",
  dislike: "Dislike",
  neutral: "Neutral",
  like: "Like",
  love: "Love",
};

// A five-step verdict scale expressed entirely in existing tokens: red →
// amber → muted → full-strength → brand. The old "like" light blue was in the
// water accent's family with no identity role here, so it could not survive
// contract 1; `colors.text` carries "positive but not the top" as a step up
// from `textMuted` without inventing a hue.
const RATING_COLORS: Record<ConceptRating, string> = {
  never: colors.danger,
  dislike: colors.warning,
  neutral: colors.textMuted,
  like: colors.text,
  love: colors.brand,
};

interface ConceptRowProps {
  concept: FoodConcept;
  expanded: boolean;
  onToggleExpand: (id: string) => void;
  onPatch: (concept: FoodConcept, patch: ConceptPatch) => void;
  onDelete: (concept: FoodConcept) => void;
}

export const ConceptRow = React.memo(function ConceptRow({
  concept,
  expanded,
  onToggleExpand,
  onPatch,
  onDelete,
}: ConceptRowProps) {
  const [formNote, setFormNote] = useState(concept.form_note ?? "");

  // Modal teardown (Done button, Android back) unmounts this row without a
  // guaranteed native blur, so onEndEditing/onBlur alone can silently drop an
  // in-progress form-note edit. This effect's cleanup is guaranteed to run on
  // unmount (and also on every collapse, since it's keyed on `expanded`),
  // giving one code path that flushes a dirty note regardless of how the row
  // goes away. `dirtyRef` avoids re-sending an edit that was already saved by
  // a normal blur, and the value comparison avoids sending a no-op patch for
  // an edit that round-tripped back to the original text.
  const dirtyRef = useRef(false);
  const latest = useRef({ concept, onPatch, formNote });
  latest.current = { concept, onPatch, formNote };

  useEffect(() => {
    return () => {
      if (!dirtyRef.current) return;
      dirtyRef.current = false;
      const { concept: c, onPatch: patch, formNote: note } = latest.current;
      const next = note.trim() || null;
      if (next === (c.form_note ?? null)) return;
      patch(c, { form_note: next });
    };
  }, [expanded]);

  const confirmDelete = () => {
    Alert.alert("Delete concept", `Remove "${concept.name}" and its links?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onDelete(concept),
      },
    ]);
  };

  return (
    <Card variant="row" style={styles.cardSpacing}>
      <TouchableOpacity
        style={styles.row}
        onPress={() => onToggleExpand(concept.id)}
      >
        <Text style={styles.rowTitle}>{concept.name}</Text>
        <Text style={[styles.rowValue, { color: RATING_COLORS[concept.rating] }]}>
          {RATING_LABELS[concept.rating]}
          {concept.requires_small_pieces ? " · ✂︎" : ""}
          {concept.prep_intensive ? " · ⏱" : ""}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View>
          <View style={styles.chipRow}>
            {CONCEPT_RATINGS.map((r) => {
              const active = r === concept.rating;
              return (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => {
                    if (r !== concept.rating) onPatch(concept, { rating: r });
                  }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {RATING_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Requires small pieces (EoE)</Text>
            <Switch
              value={concept.requires_small_pieces}
              onValueChange={(v) => onPatch(concept, { requires_small_pieces: v })}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Prep-intensive</Text>
            <Switch
              value={concept.prep_intensive}
              onValueChange={(v) => onPatch(concept, { prep_intensive: v })}
              trackColor={{ true: colors.brand, false: colors.border }}
            />
          </View>
          <TextInput
            style={styles.input}
            placeholder="Form note (e.g. must be diced; no bones)"
            placeholderTextColor={colors.textMuted}
            value={formNote}
            onChangeText={(text) => {
              setFormNote(text);
              dirtyRef.current = true;
            }}
            onEndEditing={() => {
              const next = formNote.trim() || null;
              if (next === (concept.form_note ?? null)) return;
              dirtyRef.current = false;
              onPatch(concept, { form_note: next });
            }}
          />
          <View style={styles.deleteWrap}>
            <Button
              variant="destructive"
              label="Delete concept"
              onPress={confirmDelete}
              fluid
            />
          </View>
        </View>
      )}
    </Card>
  );
});

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: spacing.sm },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  rowTitle: { ...typography.rowTitle, color: colors.text, flexShrink: 1 },
  rowValue: { ...typography.body },
  rowLabel: { ...typography.body, color: colors.text, flexShrink: 1 },
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
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token
    color: colors.text,
    marginTop: spacing.md,
  },
  deleteWrap: { marginTop: spacing.md },
});
