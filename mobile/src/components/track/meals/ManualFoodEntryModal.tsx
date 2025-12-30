import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StatusBar,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { MealType } from "@/src/types/track";

const MEAL_TYPES: { value: MealType; label: string; color: string }[] = [
  { value: "breakfast", label: "Breakfast", color: "#F59E0B" },
  { value: "lunch", label: "Lunch", color: "#10B981" },
  { value: "dinner", label: "Dinner", color: "#3B82F6" },
  { value: "snack", label: "Snack", color: "#8B5CF6" },
  { value: "dessert", label: "Dessert", color: "#EC4899" },
];

interface ManualFoodData {
  name: string;
  brand: string | null;
  barcode: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  serving_size: string | null;
}

interface ManualFoodEntryModalProps {
  visible: boolean;
  barcode: string | null;
  onClose: () => void;
  onSaveAndLog: (food: ManualFoodData, mealType: MealType, saveToLibrary: boolean) => void;
}

export function ManualFoodEntryModal({
  visible,
  barcode,
  onClose,
  onSaveAndLog,
}: ManualFoodEntryModalProps) {
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [selectedMealType, setSelectedMealType] = useState<MealType>("snack");
  const [saveToLibrary, setSaveToLibrary] = useState(true);

  const resetForm = () => {
    setName("");
    setBrand("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setSugars("");
    setServingSize("");
    setSelectedMealType("snack");
    setSaveToLibrary(true);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSaveAndLog = () => {
    if (!name.trim()) {
      return;
    }

    const foodData: ManualFoodData = {
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode,
      calories: calories ? parseInt(calories) : null,
      protein: protein ? parseFloat(protein) : null,
      carbs: carbs ? parseFloat(carbs) : null,
      fats: fats ? parseFloat(fats) : null,
      sugars: sugars ? parseFloat(sugars) : null,
      serving_size: servingSize.trim() || null,
    };

    onSaveAndLog(foodData, selectedMealType, saveToLibrary);
    resetForm();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X size={24} color={colors.foreground} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Add Food Manually</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {/* Barcode Info */}
            {barcode && (
              <View style={styles.barcodeInfo}>
                <Text style={styles.barcodeLabel}>Barcode:</Text>
                <Text style={styles.barcodeValue}>{barcode}</Text>
                <Text style={styles.notFoundText}>
                  Not found in database. Enter details manually.
                </Text>
              </View>
            )}

            {/* Food Name */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Food Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Protein Bar"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
              />
            </View>

            {/* Brand */}
            <View style={styles.field}>
              <Text style={styles.label}>Brand</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Quest"
                placeholderTextColor={colors.mutedForeground}
                value={brand}
                onChangeText={setBrand}
              />
            </View>

            {/* Serving Size */}
            <View style={styles.field}>
              <Text style={styles.label}>Serving Size</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 1 bar (60g)"
                placeholderTextColor={colors.mutedForeground}
                value={servingSize}
                onChangeText={setServingSize}
              />
            </View>

            {/* Nutrition Info */}
            <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.inputLabel}>Calories</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="numeric"
                  value={calories}
                  onChangeText={setCalories}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.inputLabel}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={protein}
                  onChangeText={setProtein}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.inputLabel}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={carbs}
                  onChangeText={setCarbs}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.inputLabel}>Fats (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={fats}
                  onChangeText={setFats}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.inputLabel}>Sugars (g)</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.mutedForeground}
                keyboardType="decimal-pad"
                value={sugars}
                onChangeText={setSugars}
              />
            </View>

            {/* Meal Type Selector */}
            <Text style={styles.sectionTitle}>Log as</Text>
            <View style={styles.mealTypeButtons}>
              {MEAL_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.mealTypeButton,
                    selectedMealType === type.value && {
                      backgroundColor: type.color,
                      borderColor: type.color,
                    },
                  ]}
                  onPress={() => setSelectedMealType(type.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.mealTypeButtonText,
                      selectedMealType === type.value &&
                        styles.mealTypeButtonTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Save to Library Toggle */}
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setSaveToLibrary(!saveToLibrary)}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.checkbox,
                  saveToLibrary && styles.checkboxChecked,
                ]}
              >
                {saveToLibrary && <Text style={styles.checkmark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                Save to my food library for quick access
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Button */}
          <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                !name.trim() && styles.primaryButtonDisabled,
              ]}
              onPress={handleSaveAndLog}
              activeOpacity={0.7}
              disabled={!name.trim()}
            >
              <Text style={styles.primaryButtonText}>
                {saveToLibrary ? "Save & Log Meal" : "Log Meal"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.foreground,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  barcodeInfo: {
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.3)",
  },
  barcodeLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  barcodeValue: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: 8,
  },
  notFoundText: {
    fontSize: 14,
    color: "#F97316",
  },
  field: {
    marginBottom: 16,
  },
  halfField: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
    marginTop: 8,
  },
  mealTypeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  mealTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  mealTypeButtonTextActive: {
    color: "#FFFFFF",
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 20,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.foreground,
    flex: 1,
  },
  actions: {
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  primaryButton: {
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#F97316",
    alignItems: "center",
  },
  primaryButtonDisabled: {
    backgroundColor: colors.muted,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
