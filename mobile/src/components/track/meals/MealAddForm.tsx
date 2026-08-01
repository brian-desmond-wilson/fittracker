import React from "react";
import { View, Text, TouchableOpacity, TextInput, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "lucide-react-native";
import { colors, icons } from "@/src/theme/tokens";
import { Button, SectionHeader } from "@/src/components/ui";
import { SavedFood, RecentFoodItem } from "@/src/types/track";
import { RecentFoodChips } from "./RecentFoodChips";
import { styles } from "./mealsScreenStyles";
import { MEAL_TYPES } from "./mealsHelpers";
import { MealAddFormState } from "./useMealAddForm";

interface MealAddFormProps {
  form: MealAddFormState;
  recentFoods: RecentFoodItem[];
  favorites: SavedFood[];
  onChipPress: (food: SavedFood) => void;
  onCancel: () => void;
  onSubmit: () => void;
}

// The manual "Log Meal" form (date, meal type, name, and optional macros).
export function MealAddForm({
  form,
  recentFoods,
  favorites,
  onChipPress,
  onCancel,
  onSubmit,
}: MealAddFormProps) {
  const {
    selectedDate,
    setSelectedDate,
    showDatePicker,
    setShowDatePicker,
    mealType,
    setMealType,
    mealName,
    setMealName,
    calories,
    setCalories,
    protein,
    setProtein,
    carbs,
    setCarbs,
    fats,
    setFats,
    sugars,
    setSugars,
    sodiumMg,
    setSodiumMg,
    fiberG,
    setFiberG,
  } = form;

  return (
    <View style={styles.addSection}>
      <SectionHeader title="Log Meal" />

      {/* Date Selector */}
      <View style={styles.field}>
        <Text style={styles.label}>Date</Text>
        <TouchableOpacity
          style={styles.dateButton}
          onPress={() => setShowDatePicker(true)}
        >
          <Calendar size={icons.sm} color={colors.text} />
          <Text style={styles.dateButtonText}>
            {selectedDate.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(event, date) => {
            setShowDatePicker(Platform.OS === "ios");
            if (date) {
              setSelectedDate(date);
            }
          }}
          maximumDate={new Date()}
        />
      )}

      {/* Meal Type Selector */}
      <View style={styles.field}>
        <Text style={styles.label}>Meal Type</Text>
        <View style={styles.mealTypeButtons}>
          {MEAL_TYPES.map((type) => (
            <TouchableOpacity
              key={type.value}
              style={[
                styles.mealTypeButton,
                mealType === type.value && styles.mealTypeButtonActive,
              ]}
              onPress={() => setMealType(type.value)}
              activeOpacity={0.7}
            >
              <Text
                style={[
                  styles.mealTypeButtonText,
                  mealType === type.value && styles.mealTypeButtonTextActive,
                ]}
              >
                {type.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Recent Food Chips for quick fill */}
      <RecentFoodChips
        recentFoods={recentFoods}
        favorites={favorites}
        onChipPress={onChipPress}
      />

      {/* Meal Name */}
      <View style={styles.field}>
        <Text style={styles.label}>
          Meal Name <Text style={styles.required}>*</Text>
        </Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., Grilled chicken with rice"
          placeholderTextColor={colors.textMuted}
          value={mealName}
          onChangeText={setMealName}
        />
      </View>

      {/* Nutritional Information */}
      <Text style={styles.subsectionTitle}>Nutrition (optional)</Text>

      <View style={styles.row}>
        <View style={styles.halfField}>
          <Text style={styles.inputLabel}>Calories</Text>
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
          <Text style={styles.inputLabel}>Protein (g)</Text>
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
          <Text style={styles.inputLabel}>Carbs (g)</Text>
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
          <Text style={styles.inputLabel}>Fats (g)</Text>
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

      <View style={styles.row}>
        <View style={styles.halfField}>
          <Text style={styles.inputLabel}>Sugars (g)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={sugars}
            onChangeText={setSugars}
          />
        </View>
        <View style={styles.halfField}>
          <Text style={styles.inputLabel}>Sodium (mg)</Text>
          <TextInput
            style={styles.input}
            placeholder="0"
            placeholderTextColor={colors.textMuted}
            keyboardType="decimal-pad"
            value={sodiumMg}
            onChangeText={setSodiumMg}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.inputLabel}>Fiber (g)</Text>
        <TextInput
          style={styles.input}
          placeholder="0"
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={fiberG}
          onChangeText={setFiberG}
        />
      </View>

      {/* Form Buttons */}
      <View style={styles.formButtons}>
        <View style={styles.formButton}>
          <Button variant="secondary" label="Cancel" onPress={onCancel} fluid />
        </View>
        <View style={styles.formButton}>
          <Button label="Log Meal" onPress={onSubmit} fluid />
        </View>
      </View>
    </View>
  );
}
