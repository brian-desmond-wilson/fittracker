// mobile/src/components/track/meals/library/MealRow.tsx
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import type { MealTotals, MealWithItems } from "@/src/types/meal-library";
import { ROLE_LABELS } from "@/src/types/meal-library";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import { lib, scoreChipStyle } from "./styles";

interface MealRowProps {
  meal: MealWithItems;
  totals: MealTotals;
  score: BrianScoreResult;
  onPress: (meal: MealWithItems) => void;
}

export const MealRow = React.memo(function MealRow({
  meal,
  totals,
  score,
  onPress,
}: MealRowProps) {
  return (
    <TouchableOpacity style={lib.card} onPress={() => onPress(meal)} activeOpacity={0.7}>
      <View style={lib.rowBetween}>
        <Text style={lib.mealName} numberOfLines={1}>{meal.name}</Text>
        <View style={[lib.scoreChip, scoreChipStyle(score.score)]}>
          <Text style={lib.scoreChipText}>{score.score}</Text>
        </View>
      </View>
      <View style={[lib.row, { marginTop: 6, gap: 8, flexWrap: "wrap" }]}>
        <Text style={lib.mutedText}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {meal.prep_minutes} min
        </Text>
        {score.approved && (
          <View style={lib.badge}>
            <Text style={lib.badgeText}>Brian Approved</Text>
          </View>
        )}
        {meal.role && <Text style={lib.smallMuted}>{ROLE_LABELS[meal.role]}</Text>}
        {score.containsNever && <Text style={lib.neverFlag}>contains a never food</Text>}
      </View>
    </TouchableOpacity>
  );
});
