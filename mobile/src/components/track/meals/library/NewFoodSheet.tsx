// The food you don't have yet, created without losing the meal you're editing.
//
// Searching for an ingredient that isn't in your foods used to end in silence:
// eight results, none of them it, and no way forward from here. The only route
// was to leave for the Foods screen — which discarded every edit on this page —
// add it there, come back, and start again.
//
// Name and calories, because those are what a meal needs to be scored and
// logged. Everything else about a food can be filled in later from Foods; none
// of it changes what this meal is.
import React, { useEffect, useState } from "react";
import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";

interface NewFoodSheetProps {
  visible: boolean;
  /** What was typed into the search box, or scanned. */
  initialName: string;
  initialBarcode?: string | null;
  saving: boolean;
  onCancel: () => void;
  onCreate: (food: { name: string; calories: number | null; protein: number | null; barcode: string | null }) => void;
}

/** Blank is a real answer — an unknown calorie count is not zero, and the score
 *  already knows how to treat a food it cannot price. */
function parseNumber(text: string): number | null {
  const n = Number(text.trim());
  return text.trim() === "" || Number.isNaN(n) || n < 0 ? null : n;
}

export function NewFoodSheet({
  visible, initialName, initialBarcode = null, saving, onCancel, onCreate,
}: NewFoodSheetProps) {
  const [name, setName] = useState(initialName);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");

  // Reseed on each open: the sheet is mounted once and reused, so without this
  // the second food you create arrives pre-filled with the first one's name.
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setCalories("");
      setProtein("");
    }
  }, [visible, initialName]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={s.scrim}>
        <View style={s.sheet}>
          <Text style={s.title}>New product</Text>
          <Text style={s.sub}>It&apos;ll be saved to your products and added to this meal.</Text>

          <View style={s.field}>
            <Text style={s.label}>NAME</Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={setName}
              placeholder="What is it called?"
              placeholderTextColor={colors.textFaint}
              autoFocus
            />
          </View>

          <View style={s.row}>
            <View style={[s.field, s.half]}>
              <Text style={s.label}>CALORIES</Text>
              <TextInput
                style={s.input}
                value={calories}
                onChangeText={setCalories}
                keyboardType="number-pad"
                placeholder="per serving"
                placeholderTextColor={colors.textFaint}
              />
            </View>
            <View style={[s.field, s.half]}>
              <Text style={s.label}>PROTEIN</Text>
              <TextInput
                style={s.input}
                value={protein}
                onChangeText={setProtein}
                keyboardType="decimal-pad"
                placeholder="optional"
                placeholderTextColor={colors.textFaint}
              />
            </View>
          </View>

          <View style={s.actions}>
            <TouchableOpacity style={s.cancel} onPress={onCancel} accessibilityRole="button">
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <View style={s.grow}>
              <Button
                label="Save and add"
                onPress={() => onCreate({
                  name: name.trim(),
                  calories: parseNumber(calories),
                  protein: parseNumber(protein),
                  barcode: initialBarcode,
                })}
                disabled={name.trim() === "" || saving}
                loading={saving}
                fluid
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    padding: spacing.screenGutter,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  title: { ...typography.titleBar, color: colors.text },
  sub: { ...typography.caption, color: colors.textMuted },
  field: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textMuted, fontWeight: "700" },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
  },
  row: { flexDirection: "row", gap: spacing.md },
  half: { flex: 1 },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  cancel: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  cancelText: { ...typography.buttonSm, color: colors.textMuted },
  grow: { flex: 1 },
});
