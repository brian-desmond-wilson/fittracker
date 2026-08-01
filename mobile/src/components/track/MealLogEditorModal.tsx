import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";
import { MealLog, MealType } from "@/src/types/track";

interface MealLogEditorModalProps {
  visible: boolean;
  meal: MealLog | null;
  saving: boolean;
  onClose: () => void;
  onSave: (updates: {
    name: string;
    meal_type: MealType;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
    sugars: number | null;
    sodium_mg: number | null;
    fiber_g: number | null;
  }) => void;
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
];

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

export function MealLogEditorModal({
  visible,
  meal,
  saving,
  onClose,
  onSave,
}: MealLogEditorModalProps) {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [fiberG, setFiberG] = useState("");

  useEffect(() => {
    if (!meal) return;
    setName(meal.name);
    setMealType(meal.meal_type);
    setCalories(meal.calories != null ? meal.calories.toString() : "");
    setProtein(meal.protein != null ? meal.protein.toString() : "");
    setCarbs(meal.carbs != null ? meal.carbs.toString() : "");
    setFats(meal.fats != null ? meal.fats.toString() : "");
    setSugars(meal.sugars != null ? meal.sugars.toString() : "");
    setSodiumMg(meal.sodium_mg != null ? meal.sodium_mg.toString() : "");
    setFiberG(meal.fiber_g != null ? meal.fiber_g.toString() : "");
  }, [meal]);

  const handleSave = () => {
    onSave({
      name: name.trim(),
      meal_type: mealType,
      calories: numOrNull(calories),
      protein: numOrNull(protein),
      carbs: numOrNull(carbs),
      fats: numOrNull(fats),
      sugars: numOrNull(sugars),
      sodium_mg: numOrNull(sodiumMg),
      fiber_g: numOrNull(fiberG),
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <Card variant="panel" style={styles.card}>
          <Text style={styles.title}>Edit Meal</Text>
          {/* `handled` is mandatory in the sheet recipe: a scroller between a
              live keyboard and a control eats the first tap on that control.
              This sheet has meal-type chips below its fields, so a user tapping
              one while a field holds focus reproduces it. */}
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Meal name"
              placeholderTextColor={colors.textMuted}
              editable={!saving}
            />

            <Text style={styles.label}>Meal Type</Text>
            <View style={styles.chipsRow}>
                {MEAL_TYPES.map((t) => {
                  const active = mealType === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      onPress={() => setMealType(t.value)}
                      style={[
                        styles.chip,
                        active && styles.chipActive,
                      ]}
                      disabled={saving}
                    >
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </View>

            <Text style={styles.label}>Calories</Text>
            <TextInput
              style={styles.input}
              value={calories}
              onChangeText={setCalories}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              editable={!saving}
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sodium (mg)</Text>
                <TextInput
                  style={styles.input}
                  value={sodiumMg}
                  onChangeText={setSodiumMg}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Fats (g)</Text>
                <TextInput
                  style={styles.input}
                  value={fats}
                  onChangeText={setFats}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sugars (g)</Text>
                <TextInput
                  style={styles.input}
                  value={sugars}
                  onChangeText={setSugars}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Fiber (g)</Text>
                <TextInput
                  style={styles.input}
                  value={fiberG}
                  onChangeText={setFiberG}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <View style={styles.actionButton}>
              <Button
                variant="secondary"
                label="Cancel"
                onPress={onClose}
                disabled={saving}
                fluid
              />
            </View>
            <View style={styles.actionButton}>
              <Button
                label="Save"
                onPress={handleSave}
                loading={saving}
                disabled={name.trim() === ""}
                fluid
              />
            </View>
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  /**
   * Width + a cap the sheet can never exceed. `maxHeight: "100%"` resolves
   * against the backdrop's content box (screen minus its `spacing.xl` padding),
   * which replaces the hand-picked `maxHeight: 460`/`500` those numbers could
   * not adapt: on a 568pt device the chrome alone (title, actions, padding)
   * eats ~146pt, so a 460pt scroller still pushed the footer off-screen.
   */
  card: {
    width: "100%",
    maxHeight: "100%",
  },
  /** Shrinks first, so the title and the footer buttons always render. */
  sheetScroll: {
    flexShrink: 1,
  },
  title: {
    ...typography.titleBar,
    color: colors.text,
    marginBottom: spacing.md,
  },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  // Grouped, mutually-exclusive selector → solid brand fill + `onBrand` label.
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  chipTextActive: { color: colors.onBrand },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  /** `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it. */
  actionButton: { flex: 1 },
});
