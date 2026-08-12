import React from "react";
import { View, Text } from "react-native";
import { Utensils, Trash2 } from "lucide-react-native";
import { Card, EmptyState, IconButton, LoadingState } from "@/src/components/ui";
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
  /**
   * B8: the name of what the recommender is suggesting right now, if
   * anything. The empty state used to say "scan a barcode or tap +" directly
   * beneath a strip that had just answered the question — generic advice
   * printed under a specific answer. Null on any day but today, and whenever
   * there is no suggestion, in which case the generic copy is genuinely the
   * best available.
   */
  suggestedMealName?: string | null;
  onOpenSuggestion?: () => void;
}

// The logged-meals list for the viewing date, grouped by meal type. Tapping a
// card edits it; the trash icon deletes it.
export function MealsDayList({
  loadingDay,
  dayMeals,
  groupedMealsByType,
  onEditMeal,
  onDeleteMeal,
  suggestedMealName,
  onOpenSuggestion,
}: MealsDayListProps) {
  return (
    <View style={styles.mealsSection}>
      {/* A1. The day's log was the only block on this tab with no heading, so
          it floated as an unlabelled tail rather than reading as the third
          group — what you have eaten, after the summary and the ways to eat.
          Suppressed while empty: the EmptyState below is its own heading. */}
      {!loadingDay && dayMeals.length > 0 && (
        <Text style={styles.loggedHeader}>Logged today</Text>
      )}
      {loadingDay ? (
        <LoadingState />
      ) : dayMeals.length === 0 ? (
        <EmptyState
          icon={Utensils}
          title="No meals logged yet"
          body={
            suggestedMealName
              ? `Suggested right now: ${suggestedMealName}`
              : "Scan a barcode or tap + to add one"
          }
          action={
            suggestedMealName && onOpenSuggestion
              ? { label: "Open it", onPress: onOpenSuggestion }
              : undefined
          }
        />
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
                <Card
                  key={meal.id}
                  variant="row"
                  style={styles.mealCardSpacing}
                  onPress={() => onEditMeal(meal)}
                >
                  <View style={styles.mealCardHeader}>
                    <Text style={styles.mealTime}>
                      {formatLoggedTime(meal.logged_at)}
                    </Text>
                    <IconButton
                      icon={Trash2}
                      variant="circle"
                      tone="danger"
                      onPress={() => onDeleteMeal(meal.id)}
                      accessibilityLabel={`Delete ${meal.name}`}
                    />
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
                </Card>
              ))}
            </View>
          );
        })
      )}
    </View>
  );
}
