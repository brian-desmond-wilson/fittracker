import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
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
import { colors } from "@/src/lib/colors";
import { nutritionStyles as s } from "./styles";

export const RATING_LABELS: Record<ConceptRating, string> = {
  never: "Never",
  dislike: "Dislike",
  neutral: "Neutral",
  like: "Like",
  love: "Love",
};

const RATING_COLORS: Record<ConceptRating, string> = {
  never: "#F87171",
  dislike: "#FB923C",
  neutral: colors.mutedForeground,
  like: "#60A5FA",
  love: colors.primary,
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
    <View style={[s.card, { marginBottom: 8, paddingVertical: 10 }]}>
      <TouchableOpacity
        style={s.row}
        onPress={() => onToggleExpand(concept.id)}
      >
        <Text style={s.rowLabel}>{concept.name}</Text>
        <Text style={[s.rowValue, { color: RATING_COLORS[concept.rating] }]}>
          {RATING_LABELS[concept.rating]}
          {concept.requires_small_pieces ? " · ✂︎" : ""}
          {concept.prep_intensive ? " · ⏱" : ""}
        </Text>
      </TouchableOpacity>
      {expanded && (
        <View>
          <View style={s.chipRow}>
            {CONCEPT_RATINGS.map((r) => {
              const active = r === concept.rating;
              return (
                <TouchableOpacity
                  key={r}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => {
                    if (r !== concept.rating) onPatch(concept, { rating: r });
                  }}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>
                    {RATING_LABELS[r]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Requires small pieces (EoE)</Text>
            <Switch
              value={concept.requires_small_pieces}
              onValueChange={(v) => onPatch(concept, { requires_small_pieces: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <View style={s.row}>
            <Text style={s.rowLabel}>Prep-intensive</Text>
            <Switch
              value={concept.prep_intensive}
              onValueChange={(v) => onPatch(concept, { prep_intensive: v })}
              trackColor={{ true: colors.primary, false: colors.border }}
            />
          </View>
          <TextInput
            style={s.input}
            placeholder="Form note (e.g. must be diced; no bones)"
            placeholderTextColor={colors.mutedForeground}
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
          <TouchableOpacity style={s.destructiveButton} onPress={confirmDelete}>
            <Text style={s.destructiveButtonText}>Delete concept</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
});
