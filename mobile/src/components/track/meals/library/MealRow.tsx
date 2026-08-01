// mobile/src/components/track/meals/library/MealRow.tsx
import React from "react";
import { Text, View } from "react-native";
import type { MealTotals, MealWithItems } from "@/src/types/meal-library";
import { ROLE_LABELS } from "@/src/types/meal-library";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import type { MealAssemblability } from "@/src/lib/stockState";
import { spacing } from "@/src/theme/tokens";
import { Badge, Card } from "@/src/components/ui";
import { lib, scoreTone } from "./styles";

interface MealRowProps {
  meal: MealWithItems;
  totals: MealTotals;
  score: BrianScoreResult;
  /** Optional: undefined while the container has no map entry for this meal.
   *  Must be a STABLE object (built in a memo alongside scores/totals) or the
   *  React.memo below can never short-circuit. */
  assemblability?: MealAssemblability;
  onPress: (meal: MealWithItems) => void;
}

export const MealRow = React.memo(function MealRow({
  meal,
  totals,
  score,
  assemblability,
  onPress,
}: MealRowProps) {
  return (
    <Card variant="row" style={lib.cardSpacing} onPress={() => onPress(meal)}>
      <View style={lib.rowBetween}>
        <Text style={lib.mealName} numberOfLines={1}>{meal.name}</Text>
        <Badge label={String(score.score)} tone={scoreTone(score.score)} />
      </View>
      <View style={[lib.row, { marginTop: spacing.sm, gap: spacing.sm, flexWrap: "wrap" }]}>
        <Text style={lib.mutedText}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {meal.prep_minutes} min
        </Text>
        {score.approved && <Badge label="Brian Approved" tone="success" />}
        {assemblability?.assemblable && <Badge label="In stock" tone="success" />}
        {meal.role && <Text style={lib.smallMuted}>{ROLE_LABELS[meal.role]}</Text>}
        {score.containsNever && <Text style={lib.neverFlag}>contains a never food</Text>}
      </View>
    </Card>
  );
});
