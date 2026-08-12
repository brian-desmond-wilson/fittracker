// mobile/src/components/track/meals/library/MealRow.tsx
import React from "react";
import { Image, Text, View } from "react-native";
import type { MealTotals, MealWithItems } from "@/src/types/meal-library";
import { ROLE_LABELS } from "@/src/types/meal-library";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import type { MealAssemblability } from "@/src/lib/stockState";
import { prepBudgetLabel, prepBudgetVerdict } from "@/src/lib/eatNext";
import { mealFaceUrl } from "@/src/lib/mealFace";
import { monogram } from "@/src/lib/vendorMonogram";
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
  /** The owner's prep budget, so the row can say when a meal is over it or
   *  past the hard cap that keeps it out of suggestions entirely (C7). */
  maxPrepMinutes: number;
  onPress: (meal: MealWithItems) => void;
}

export const MealRow = React.memo(function MealRow({
  meal,
  totals,
  score,
  assemblability,
  maxPrepMinutes,
  onPress,
}: MealRowProps) {
  // A meal past the hard cap never appears in Eat Next at all, and until now
  // nothing anywhere said so — it simply was not there. The library is where
  // you browse meals, so it is where the exclusion has to be visible.
  const prepNote = prepBudgetLabel(meal.prep_minutes, maxPrepMinutes);
  const prepExcluded =
    prepBudgetVerdict(meal.prep_minutes, maxPrepMinutes) === "excluded";
  // C5. A meal has no picture of its own and should not — it is an assembly,
  // and its identity is its parts — so it borrows the one from its biggest
  // contributor. Falls back to initials rather than a shared glyph, the same
  // way the quick-add tiles do.
  const faceUrl = mealFaceUrl(
    meal.items.map((it) => ({
      displayOrder: it.display_order,
      imageUrl: it.savedFood.image_primary_url,
      calories: (it.savedFood.calories ?? 0) * it.servings,
    })),
  );
  return (
    <Card variant="row" style={lib.cardSpacing} onPress={() => onPress(meal)}>
      <View style={lib.rowBetween}>
        <View style={lib.faceRow}>
          <View style={lib.face}>
            {faceUrl ? (
              <Image source={{ uri: faceUrl }} style={lib.faceImage} resizeMode="cover" />
            ) : (
              <Text style={lib.faceMonogram}>{monogram(meal.name)}</Text>
            )}
          </View>
          <Text style={lib.mealName} numberOfLines={1}>{meal.name}</Text>
        </View>
        <Badge label={String(score.score)} suffix="/100" tone={scoreTone(score.score)} />
      </View>
      <View style={[lib.row, { marginTop: spacing.sm, gap: spacing.sm, flexWrap: "wrap" }]}>
        <Text style={lib.mutedText}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {meal.prep_minutes} min
        </Text>
        {score.approved && <Badge label="Brian Approved" tone="success" />}
        {assemblability?.assemblable && <Badge label="In stock" tone="success" />}
        {prepNote && (
          <Badge label={prepNote} tone={prepExcluded ? "warning" : "neutral"} />
        )}
        {meal.role && <Text style={lib.smallMuted}>{ROLE_LABELS[meal.role]}</Text>}
        {score.containsNever && <Text style={lib.neverFlag}>contains a never food</Text>}
      </View>
    </Card>
  );
});
