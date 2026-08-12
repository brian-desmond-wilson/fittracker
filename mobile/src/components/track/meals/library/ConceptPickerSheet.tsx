// Attach an ingredient to a food concept, from the place the gap shows up.
//
// D4. Concept links are the most load-bearing data in the loop — they decide
// what "ready", "missing" and "in stock" mean — and they were invisible and
// unrepairable from the app. A meal would sit permanently un-makeable with no
// hint that the fix was one link, let alone a way to make it. This is that
// way, offered exactly where the failure is stated.
import React, { useMemo, useState } from "react";
import {
  FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { FoodConcept } from "@/src/types/nutrition-preferences";
import { matchesQuery } from "@/src/lib/mealSearch";

interface ConceptPickerSheetProps {
  visible: boolean;
  /** What we are linking, for the title — the ingredient's own name. */
  subject: string;
  concepts: FoodConcept[];
  busy: boolean;
  onPick: (conceptId: string) => void;
  onClose: () => void;
}

export function ConceptPickerSheet({
  visible, subject, concepts, busy, onPick, onClose,
}: ConceptPickerSheetProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  // Seeded with the ingredient's own name: the concept you want is almost
  // always the one that shares a word with it, so the first thing the sheet
  // shows should already be the answer.
  const filtered = useMemo(() => {
    const q = query.trim() || subject;
    const hits = concepts.filter((c) => matchesQuery(c.name, q));
    // Falling back to the whole list beats showing nothing: a miss on the
    // seeded guess must not look like an empty concept catalog.
    return hits.length > 0 ? hits : concepts;
  }, [concepts, query, subject]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={1}>Link “{subject}”</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <X size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
        </View>

        <Text style={styles.help}>
          Pick what this ingredient IS. Linking it lets the app check your
          kitchen for it, so this meal can be told apart from one you are
          genuinely out of.
        </Text>

        <TextInput
          style={styles.input}
          placeholder={`Search concepts (showing matches for “${subject}”)`}
          placeholderTextColor={colors.textFaint}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
        />

        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              disabled={busy}
              onPress={() => onPick(item.id)}
              accessibilityRole="button"
            >
              <Text style={styles.rowName}>{item.name}</Text>
              <Text style={styles.rowMeta}>{item.rating}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.help}>
              No food concepts yet — they live under nutrition preferences.
            </Text>
          }
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { ...typography.titleBar, color: colors.text, flexShrink: 1 },
  help: {
    ...typography.caption, color: colors.textMuted,
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.md,
  },
  input: {
    ...typography.body, color: colors.text,
    marginHorizontal: spacing.screenGutter, marginVertical: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
  },
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  rowName: { ...typography.body, color: colors.text, flexShrink: 1 },
  rowMeta: { ...typography.caption, color: colors.textFaint },
});
