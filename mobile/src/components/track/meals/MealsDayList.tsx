import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { Utensils, Trash2 } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { MealLog, MealType } from "@/src/types/track";
import { styles } from "./mealsScreenStyles";
import {
  MEAL_TYPE_ORDER,
  getMealTypeColor,
  getMealTypeLabel,
  formatLoggedTime,
} from "./mealsHelpers";

interface MealsDayListProps {
  loadingDay: boolean;
  dayMeals: MealLog[];
  groupedMealsByType: Record<MealType, MealLog[]>;
  onEditMeal: (meal: MealLog) => void;
  onDeleteMeal: (mealId: string) => void;
}

// The logged-meals list for the viewing date, grouped by meal type. Tapping a
// card edits it; the trash icon deletes it.
export function MealsDayList({
  loadingDay,
  dayMeals,
  groupedMealsByType,
  onEditMeal,
  onDeleteMeal,
}: MealsDayListProps) {
  return (
    <View style={styles.mealsSection}>
      {loadingDay ? (
        <Text style={styles.loadingText}>Loading...</Text>
      ) : dayMeals.length === 0 ? (
        <View style={styles.emptyState}>
          <Utensils size={48} color={colors.mutedForeground} />
          <Text style={styles.emptyStateText}>No meals logged yet</Text>
          <Text style={styles.emptyStateSubtext}>
            Scan a barcode or tap + to add one
          </Text>
        </View>
      ) : (
        MEAL_TYPE_ORDER.map((mealType) => {
          const mealsOfType = groupedMealsByType[mealType];
          if (mealsOfType.length === 0) return null;

          return (
            <View key={mealType} style={styles.mealTypeSection}>
              <View style={styles.mealTypeSectionHeader}>
                <View
                  style={[
                    styles.mealTypeBadge,
                    { backgroundColor: getMealTypeColor(mealType) },
                  ]}
                >
                  <Text style={styles.mealTypeBadgeText}>
                    {getMealTypeLabel(mealType)}
                  </Text>
                </View>
              </View>
              {mealsOfType.map((meal) => (
                <TouchableOpacity
                  key={meal.id}
                  style={styles.mealCard}
                  onPress={() => onEditMeal(meal)}
                  activeOpacity={0.7}
                >
                  <View style={styles.mealCardHeader}>
                    <Text style={styles.mealTime}>
                      {formatLoggedTime(meal.logged_at)}
                    </Text>
                    <TouchableOpacity
                      onPress={() => onDeleteMeal(meal.id)}
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
                </TouchableOpacity>
              ))}
            </View>
          );
        })
      )}
    </View>
  );
}
