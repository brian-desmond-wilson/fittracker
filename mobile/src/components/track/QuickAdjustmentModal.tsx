import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";
import { MealType } from "@/src/types/track";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
];

interface QuickAdjustmentModalProps {
  visible: boolean;
  defaultMealType?: MealType;
  saving: boolean;
  onClose: () => void;
  onSave: (input: {
    name: string;
    meal_type: MealType;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
  }) => void;
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

export function QuickAdjustmentModal({
  visible,
  defaultMealType = "snack",
  saving,
  onClose,
  onSave,
}: QuickAdjustmentModalProps) {
  const [name, setName] = useState("Quick adjustment");
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");

  useEffect(() => {
    if (visible) {
      setName("Quick adjustment");
      setMealType(defaultMealType);
      setCalories("");
      setProtein("");
      setCarbs("");
      setFats("");
    }
  }, [visible, defaultMealType]);

  const canSave = numOrNull(calories) != null && (numOrNull(calories) ?? 0) > 0;

  const handleSave = () => {
    onSave({
      name: name.trim() || "Quick adjustment",
      meal_type: mealType,
      calories: numOrNull(calories),
      protein: numOrNull(protein),
      carbs: numOrNull(carbs),
      fats: numOrNull(fats),
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Card variant="panel" style={styles.card}>
          <Text style={styles.title}>Quick Adjustment</Text>
          <Text style={styles.subtitle}>
            Add calories without picking a saved food. Macros are optional.
          </Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Quick adjustment"
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
                  disabled={saving}
                  style={[
                    styles.chip,
                    active && styles.chipActive,
                  ]}
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

          <Text style={styles.label}>
            Calories <Text style={styles.required}>*</Text>
          </Text>
          <TextInput
            style={styles.input}
            value={calories}
            onChangeText={setCalories}
            keyboardType="decimal-pad"
            placeholder="100"
            placeholderTextColor={colors.textMuted}
            editable={!saving}
            autoFocus
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
            <View style={styles.halfField} />
          </View>

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
                label="Log"
                onPress={handleSave}
                loading={saving}
                disabled={!canSave}
                fluid
              />
            </View>
          </View>
        </Card>
      </View>
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
  /** Width only — `Card panel` owns surface, radius, padding and border. */
  card: {
    width: "100%",
  },
  title: {
    ...typography.titleBar,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  required: {
    color: colors.danger,
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
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  /** `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it. */
  actionButton: { flex: 1 },
});
