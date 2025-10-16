import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus, Utensils, Trash2, Calendar } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "@/src/lib/colors";
import { MealLog, MealType } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

interface MealsScreenProps {
  onClose: () => void;
}

const MEAL_TYPES: { value: MealType; label: string; color: string }[] = [
  { value: "breakfast", label: "Breakfast", color: "#F59E0B" },
  { value: "lunch", label: "Lunch", color: "#10B981" },
  { value: "dinner", label: "Dinner", color: "#3B82F6" },
  { value: "snack", label: "Snack", color: "#8B5CF6" },
  { value: "dessert", label: "Dessert", color: "#EC4899" },
];

export function MealsScreen({ onClose }: MealsScreenProps) {
  const insets = useSafeAreaInsets();
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form fields
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [mealName, setMealName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchMeals();
  }, []);

  const fetchMeals = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to track meals");
        return;
      }

      // Fetch meals from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false });

      if (error) throw error;

      setMeals(data || []);
    } catch (error: any) {
      console.error("Error fetching meals:", error);
      Alert.alert("Error", "Failed to load meals");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedDate(new Date());
    setMealType("breakfast");
    setMealName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setSugars("");
  };

  const handleAddMeal = async () => {
    if (!mealName.trim()) {
      Alert.alert("Validation Error", "Meal name is required");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log meals");
        return;
      }

      const mealData = {
        user_id: user.id,
        date: selectedDate.toISOString().split("T")[0],
        meal_type: mealType,
        name: mealName.trim(),
        calories: calories ? parseInt(calories) : null,
        protein: protein ? parseFloat(protein) : null,
        carbs: carbs ? parseFloat(carbs) : null,
        fats: fats ? parseFloat(fats) : null,
        sugars: sugars ? parseFloat(sugars) : null,
        uses_inventory: false,
        inventory_items: null,
        logged_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("meal_logs").insert([mealData]);

      if (error) throw error;

      resetForm();
      setShowAddForm(false);
      await fetchMeals();
      Alert.alert("Success", "Meal logged successfully");
    } catch (error: any) {
      console.error("Error adding meal:", error);
      Alert.alert("Error", "Failed to log meal");
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    Alert.alert("Delete Meal", "Are you sure you want to delete this meal log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("meal_logs").delete().eq("id", mealId);

            if (error) throw error;

            await fetchMeals();
          } catch (error: any) {
            console.error("Error deleting meal:", error);
            Alert.alert("Error", "Failed to delete meal");
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateOnly = dateStr.split("T")[0];
    const todayOnly = today.toISOString().split("T")[0];
    const yesterdayOnly = yesterday.toISOString().split("T")[0];

    if (dateOnly === todayOnly) {
      return "Today";
    } else if (dateOnly === yesterdayOnly) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  const getMealTypeColor = (type: MealType) => {
    return MEAL_TYPES.find((t) => t.value === type)?.color || "#6B7280";
  };

  const getMealTypeLabel = (type: MealType) => {
    return MEAL_TYPES.find((t) => t.value === type)?.label || type;
  };

  // Calculate today's totals
  const todayMeals = meals.filter((meal) => meal.date === today);
  const todayTotals = todayMeals.reduce(
    (acc, meal) => ({
      calories: acc.calories + (meal.calories || 0),
      protein: acc.protein + (meal.protein || 0),
      carbs: acc.carbs + (meal.carbs || 0),
      fats: acc.fats + (meal.fats || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
  );

  // Group meals by date
  const groupedMeals: Record<string, MealLog[]> = {};
  meals.forEach((meal) => {
    if (!groupedMeals[meal.date]) {
      groupedMeals[meal.date] = [];
    }
    groupedMeals[meal.date].push(meal);
  });

  const sortedDates = Object.keys(groupedMeals).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Track</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleContainer}>
            <Utensils size={32} color="#F97316" strokeWidth={2} />
            <Text style={styles.pageTitle}>Meals & Snacks</Text>
          </View>

          {/* Today's Summary */}
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Today's Nutrition</Text>
            <View style={styles.summaryGrid}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{todayTotals.calories}</Text>
                <Text style={styles.summaryItemLabel}>Calories</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{todayTotals.protein.toFixed(1)}g</Text>
                <Text style={styles.summaryItemLabel}>Protein</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{todayTotals.carbs.toFixed(1)}g</Text>
                <Text style={styles.summaryItemLabel}>Carbs</Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryValue}>{todayTotals.fats.toFixed(1)}g</Text>
                <Text style={styles.summaryItemLabel}>Fats</Text>
              </View>
            </View>
          </View>

          {/* Add Button */}
          {!showAddForm && (
            <View style={styles.addButtonContainer}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Log Meal</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add Form */}
          {showAddForm && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Log Meal</Text>

              {/* Date Selector */}
              <View style={styles.field}>
                <Text style={styles.label}>Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Calendar size={16} color={colors.foreground} />
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
                        mealType === type.value && {
                          backgroundColor: type.color,
                          borderColor: type.color,
                        },
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

              {/* Meal Name */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Meal Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Grilled chicken with rice"
                  placeholderTextColor={colors.mutedForeground}
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

              {/* Form Buttons */}
              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    resetForm();
                    setShowAddForm(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleAddMeal}
                  activeOpacity={0.7}
                >
                  <Text style={styles.saveButtonText}>Log Meal</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Meal History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>History</Text>
            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : sortedDates.length === 0 ? (
              <Text style={styles.emptyText}>No meals logged yet. Start tracking today!</Text>
            ) : (
              sortedDates.map((date) => {
                const dayMeals = groupedMeals[date];
                const dayTotals = dayMeals.reduce(
                  (acc, meal) => ({
                    calories: acc.calories + (meal.calories || 0),
                    protein: acc.protein + (meal.protein || 0),
                    carbs: acc.carbs + (meal.carbs || 0),
                    fats: acc.fats + (meal.fats || 0),
                  }),
                  { calories: 0, protein: 0, carbs: 0, fats: 0 }
                );

                return (
                  <View key={date} style={styles.dayGroup}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayDate}>{formatDate(date)}</Text>
                      <Text style={styles.dayTotal}>{dayTotals.calories} cal</Text>
                    </View>
                    {dayMeals.map((meal) => (
                      <View key={meal.id} style={styles.mealCard}>
                        <View style={styles.mealCardHeader}>
                          <View style={styles.mealInfo}>
                            <View
                              style={[
                                styles.mealTypeBadge,
                                { backgroundColor: getMealTypeColor(meal.meal_type) },
                              ]}
                            >
                              <Text style={styles.mealTypeBadgeText}>
                                {getMealTypeLabel(meal.meal_type)}
                              </Text>
                            </View>
                            <Text style={styles.mealTime}>{formatTime(meal.logged_at)}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteMeal(meal.id)}
                            style={styles.deleteButton}
                            activeOpacity={0.7}
                          >
                            <Trash2 size={18} color={colors.mutedForeground} />
                          </TouchableOpacity>
                        </View>
                        <Text style={styles.mealName}>{meal.name}</Text>
                        {(meal.calories || meal.protein || meal.carbs || meal.fats) && (
                          <View style={styles.mealNutrition}>
                            {meal.calories && (
                              <Text style={styles.nutritionText}>{meal.calories} cal</Text>
                            )}
                            {meal.protein && (
                              <Text style={styles.nutritionText}>P: {meal.protein}g</Text>
                            )}
                            {meal.carbs && (
                              <Text style={styles.nutritionText}>C: {meal.carbs}g</Text>
                            )}
                            {meal.fats && (
                              <Text style={styles.nutritionText}>F: {meal.fats}g</Text>
                            )}
                          </View>
                        )}
                      </View>
                    ))}
                  </View>
                );
              })
            )}
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: colors.foreground,
  },
  content: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.3)",
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#F97316",
    marginBottom: 4,
  },
  summaryItemLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  addButtonContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  addSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
    marginTop: 8,
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
  dateButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.foreground,
  },
  mealTypeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  saveButton: {
    backgroundColor: "#F97316",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  historySection: {
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  dayGroup: {
    marginBottom: 24,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  dayTotal: {
    fontSize: 16,
    fontWeight: "600",
    color: "#F97316",
  },
  mealCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  mealCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  mealInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mealTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mealTypeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  mealTime: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  deleteButton: {
    padding: 4,
  },
  mealName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  mealNutrition: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  nutritionText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
});
