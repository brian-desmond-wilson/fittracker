import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { colors } from "@/src/lib/colors";
import { MealType } from "@/src/types/track";

const MEAL_TYPES: { value: MealType; label: string; color: string }[] = [
  { value: "breakfast", label: "Breakfast", color: "#F59E0B" },
  { value: "lunch", label: "Lunch", color: "#10B981" },
  { value: "dinner", label: "Dinner", color: "#3B82F6" },
  { value: "snack", label: "Snack", color: "#8B5CF6" },
  { value: "dessert", label: "Dessert", color: "#EC4899" },
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
        <View style={styles.card}>
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
            placeholderTextColor={colors.mutedForeground}
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
                    active && { backgroundColor: t.color, borderColor: t.color },
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
            placeholderTextColor={colors.mutedForeground}
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
                placeholderTextColor={colors.mutedForeground}
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
                placeholderTextColor={colors.mutedForeground}
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
                placeholderTextColor={colors.mutedForeground}
                editable={!saving}
              />
            </View>
            <View style={styles.halfField} />
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.buttonPrimary,
                !canSave && styles.buttonDisabled,
              ]}
              onPress={handleSave}
              disabled={saving || !canSave}
            >
              <Text style={styles.buttonPrimaryText}>
                {saving ? "Saving…" : "Log"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
    marginTop: 8,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  required: {
    color: "#EF4444",
  },
  input: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#FFFFFF",
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  chipTextActive: { color: "#FFFFFF" },
  row: { flexDirection: "row", gap: 10 },
  halfField: { flex: 1 },
  actions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonPrimary: { backgroundColor: "#F97316" },
  buttonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPrimaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  buttonSecondaryText: { color: colors.foreground, fontSize: 16, fontWeight: "600" },
});
