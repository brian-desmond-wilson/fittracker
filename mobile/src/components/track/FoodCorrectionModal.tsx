import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import { colors } from "@/src/lib/colors";

export interface FoodCorrectionValues {
  name: string;
  brand: string | null;
  serving_size: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
}

interface FoodCorrectionModalProps {
  visible: boolean;
  initialValues: FoodCorrectionValues;
  saving: boolean;
  onClose: () => void;
  onSave: (next: FoodCorrectionValues) => void;
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function toStr(v: number | null | undefined): string {
  return v != null ? String(v) : "";
}

export function FoodCorrectionModal({
  visible,
  initialValues,
  saving,
  onClose,
  onSave,
}: FoodCorrectionModalProps) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [fiberG, setFiberG] = useState("");

  useEffect(() => {
    if (visible) {
      setName(initialValues.name ?? "");
      setBrand(initialValues.brand ?? "");
      setServingSize(initialValues.serving_size ?? "");
      setCalories(toStr(initialValues.calories));
      setProtein(toStr(initialValues.protein));
      setCarbs(toStr(initialValues.carbs));
      setFats(toStr(initialValues.fats));
      setSugars(toStr(initialValues.sugars));
      setSodiumMg(toStr(initialValues.sodium_mg));
      setFiberG(toStr(initialValues.fiber_g));
    }
  }, [visible, initialValues]);

  const handleSave = () => {
    onSave({
      name: name.trim() || initialValues.name,
      brand: brand.trim() === "" ? null : brand.trim(),
      serving_size: servingSize.trim() === "" ? null : servingSize.trim(),
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
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Edit Nutrition</Text>
          <Text style={styles.subtitle}>
            Values are per serving. Future scans of this food will use your
            corrected values.
          </Text>

          <ScrollView style={{ maxHeight: 460 }}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Food name"
              placeholderTextColor={colors.mutedForeground}
              editable={!saving}
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Brand</Text>
                <TextInput
                  style={styles.input}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="Optional"
                  placeholderTextColor={colors.mutedForeground}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Serving Size</Text>
                <TextInput
                  style={styles.input}
                  value={servingSize}
                  onChangeText={setServingSize}
                  placeholder="e.g. 1 bottle (237 mL)"
                  placeholderTextColor={colors.mutedForeground}
                  editable={!saving}
                />
              </View>
            </View>

            <Text style={styles.label}>Calories (per serving)</Text>
            <TextInput
              style={styles.input}
              value={calories}
              onChangeText={setCalories}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.mutedForeground}
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
              <View style={styles.halfField}>
                <Text style={styles.label}>Sodium (mg)</Text>
                <TextInput
                  style={styles.input}
                  value={sodiumMg}
                  onChangeText={setSodiumMg}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
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
                  placeholderTextColor={colors.mutedForeground}
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
                  placeholderTextColor={colors.mutedForeground}
                  editable={!saving}
                />
              </View>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={onClose}
              disabled={saving}
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleSave}
              disabled={saving}
            >
              <Text style={styles.buttonPrimaryText}>
                {saving ? "Saving…" : "Save"}
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
  buttonPrimaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "600" },
  buttonSecondaryText: { color: colors.foreground, fontSize: 16, fontWeight: "600" },
});
