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
import { Check, X } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";
import { MealType } from "@/src/types/track";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
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
              <X size={icons.lg} color={colors.text} />
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
                placeholderTextColor={colors.textMuted}
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
                placeholderTextColor={colors.textMuted}
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
                placeholderTextColor={colors.textMuted}
                value={servingSize}
                onChangeText={setServingSize}
              />
            </View>

            {/* Nutrition Info */}
            <Text style={styles.sectionTitle}>Nutrition (per serving)</Text>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Calories</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="numeric"
                  value={calories}
                  onChangeText={setCalories}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={protein}
                  onChangeText={setProtein}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={carbs}
                  onChangeText={setCarbs}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Fats (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                  value={fats}
                  onChangeText={setFats}
                />
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Sugars (g)</Text>
              <TextInput
                style={styles.input}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
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
                    selectedMealType === type.value && styles.mealTypeButtonActive,
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
                {saveToLibrary && (
                  <Check
                    size={icons.sm}
                    color={colors.onBrand}
                    strokeWidth={icons.strokeWidth}
                  />
                )}
              </View>
              <Text style={styles.checkboxLabel}>
                Save to my food library for quick access
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Action Button */}
          <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
            <Button
              label={saveToLibrary ? "Save & Log Meal" : "Log Meal"}
              onPress={handleSaveAndLog}
              disabled={!name.trim()}
              fluid
            />
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
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.titleBar,
    color: colors.text,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.screenGutter,
  },
  // Sanctioned surviving orange: a `tint(accents.meals)` info fill.
  barcodeInfo: {
    backgroundColor: tint(colors.accents.meals),
    borderRadius: radii.row,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: tint(colors.accents.meals, 0.3),
  },
  barcodeLabel: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  barcodeValue: {
    ...typography.rowTitle,
    color: colors.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    marginBottom: spacing.sm,
  },
  notFoundText: {
    ...typography.body,
    color: colors.text,
  },
  field: {
    marginBottom: spacing.lg,
  },
  halfField: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  // The one form-label token (see `mealsScreenStyles`): `inputLabel` was a
  // byte-identical twin used interchangeably in the same component.
  label: {
    ...typography.section,
    marginBottom: spacing.sm,
  },
  required: {
    color: colors.danger,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  sectionTitle: {
    ...typography.section,
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  mealTypeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  mealTypeButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Grouped, mutually-exclusive selector → solid brand fill + `onBrand` label.
  mealTypeButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  mealTypeButtonText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  mealTypeButtonTextActive: {
    color: colors.onBrand,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radii.control,
    borderWidth: 2,
    // The outline IS the affordance here, so `textFaint` rather than `border`.
    borderColor: colors.textFaint,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  checkboxLabel: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
  actions: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
});
