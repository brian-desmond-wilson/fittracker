// mobile/src/components/track/meals/library/MealDetail.tsx
import React, { useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { MealTotals, MealWithItems } from "@/src/types/meal-library";
import { MEAL_TYPE_LABELS, ROLE_LABELS, defaultMealTypeFor } from "@/src/types/meal-library";
import type { MealType } from "@/src/types/track";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import { COMPONENT_MAX, RAW_MAX } from "@/src/lib/mealScore";
import type { MealAssemblability } from "@/src/lib/stockState";
import { spacing } from "@/src/theme/tokens";
import { Badge, Button, Card } from "@/src/components/ui";
import { lib, scoreTone } from "./styles";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

interface MealDetailProps {
  meal: MealWithItems;
  totals: MealTotals;
  score: BrianScoreResult;
  assemblability?: MealAssemblability;
  logging: boolean;
  onLog: (meal: MealWithItems, mealType: MealType) => void;
  onEdit: (meal: MealWithItems) => void;
  onDelete: (meal: MealWithItems) => void;
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={[lib.row, { marginTop: spacing.sm }]}>
      <Text style={[lib.mutedText, { width: 104 }]}>{label}</Text>
      <Text style={[lib.smallMuted, { width: 52 }]}>
        {Math.round(value * 10) / 10}/{max}
      </Text>
      <View style={lib.barTrack}>
        <View style={[lib.barFill, { width: `${(value / max) * 100}%` }]} />
      </View>
    </View>
  );
}

export function MealDetail({
  meal, totals, score, assemblability, logging, onLog, onEdit, onDelete,
}: MealDetailProps) {
  const [mealType, setMealType] = useState<MealType>(defaultMealTypeFor(meal));

  const confirmDelete = () =>
    Alert.alert("Delete meal", `Delete "${meal.name}" from your library?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(meal) },
    ]);

  const hasSmallPieces = meal.items.some((it) => it.small_pieces_ok);

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: spacing.lg }}>
      <Card variant="row" style={lib.cardSpacing}>
        <View style={lib.rowBetween}>
          <Text style={lib.mealName}>{meal.name}</Text>
          <Badge label={String(score.score)} tone={scoreTone(score.score)} />
        </View>
        <Text style={[lib.mutedText, { marginTop: spacing.xs }]}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {meal.prep_minutes} min
          {meal.role ? ` · ${ROLE_LABELS[meal.role]}` : ""}
        </Text>
        {score.approved && (
          <View style={{ alignSelf: "flex-start", marginTop: spacing.sm }}>
            <Badge label="Brian Approved" tone="success" />
          </View>
        )}
        {score.containsNever && (
          <Text style={[lib.neverFlag, { marginTop: spacing.sm }]}>
            Contains a food rated “never”
          </Text>
        )}
        {score.tasteUnknown && (
          <Text style={[lib.smallMuted, { marginTop: spacing.sm }]}>
            Taste unknown — no ingredient is linked to a rated food concept yet.
          </Text>
        )}
      </Card>

      <Card variant="row" style={lib.cardSpacing}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Ingredients</Text>
        {meal.items.map((it) => (
          <View key={it.id} style={[lib.rowBetween, { marginTop: spacing.sm }]}>
            <Text style={[lib.bodyText, { flexShrink: 1 }]} numberOfLines={1}>
              {it.savedFood.name}
              {it.small_pieces_ok ? " ✂︎" : ""}
            </Text>
            <Text style={lib.smallMuted}>
              ×{it.servings} · {Math.round((it.savedFood.calories ?? 0) * it.servings)} cal
            </Text>
          </View>
        ))}
        {hasSmallPieces && (
          <Text style={[lib.smallMuted, { marginTop: spacing.sm }]}>
            ✂︎ already cut small — EoE-safe
          </Text>
        )}
        {/* Gated on the LIST, not on the `assemblable` verdict. They are not
            the same predicate: `assemblable` is
            `items.length > 0 && missing.length === 0`, so an item-less meal
            is not-assemblable with an EMPTY missing list and the verdict gate
            renders a bare "Missing:" with nothing after it. Item-less meals
            are a live state — `updateMeal`'s non-atomic replace documents
            leaving one behind. */}
        {assemblability && assemblability.missing.length > 0 && (
          <Text style={[lib.smallMuted, lib.warnText, { marginTop: spacing.sm }]}>
            Missing: {assemblability.missing.join(", ")}
          </Text>
        )}
        {/* Gated on `expiringItemName != null`, NOT on the truthiness of
            `expiringDaysLeft`: 0 means "expires today" — a retained rescue
            signal (see stockState.ts) — and 0 is falsy. `!= null` rather than
            truthiness on the NAME either, so this matches `eatNext.ts`'s
            `expiringRank`/`stockReasons` exactly: an empty-string name would
            still rank the meal as a rescue there, and a truthiness gate here
            would silently render nothing for it — the recommender ordering on
            a signal the UI never states. */}
        {assemblability?.expiringItemName != null && (
          <Text style={[lib.smallMuted, lib.warnText, { marginTop: spacing.xs }]}>
            Uses {assemblability.expiringItemName} —{" "}
            {assemblability.expiringDaysLeft === 0
              ? "expires today"
              : `expires in ${assemblability.expiringDaysLeft}d`}
          </Text>
        )}
      </Card>

      <Card variant="row" style={lib.cardSpacing}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Brian Score breakdown</Text>
        <ScoreBar label="Taste" value={score.taste} max={COMPONENT_MAX.taste} />
        <ScoreBar label="Convenience" value={score.convenience} max={COMPONENT_MAX.convenience} />
        <ScoreBar label="Protein" value={score.protein} max={COMPONENT_MAX.protein} />
        <ScoreBar label="EoE-Friendly" value={score.eoe} max={COMPONENT_MAX.eoe} />
        <ScoreBar label="Calories" value={score.calories} max={COMPONENT_MAX.calories} />
        <Text style={[lib.smallMuted, { marginTop: spacing.sm }]}>
          {score.raw}/{RAW_MAX} renormalized to {score.score}/100 (cost unscored — no price data).
        </Text>
      </Card>

      <Card variant="row" style={lib.cardSpacing}>
        <Text style={[lib.mutedText, { fontWeight: "700", marginBottom: spacing.sm }]}>Log as</Text>
        <View style={[lib.row, { flexWrap: "wrap" }]}>
          {MEAL_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[lib.chip, mealType === t && lib.chipActive]}
              onPress={() => setMealType(t)}
            >
              <Text style={[lib.chipText, mealType === t && lib.chipTextActive]}>
                {MEAL_TYPE_LABELS[t]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ marginTop: spacing.sm }}>
          <Button
            label="Log this meal"
            onPress={() => onLog(meal, mealType)}
            loading={logging}
            disabled={logging}
            fluid
          />
        </View>
      </Card>

      <View style={[lib.rowBetween, { marginHorizontal: spacing.screenGutter, marginTop: spacing.xs }]}>
        <Button label="Edit" variant="secondary" onPress={() => onEdit(meal)} />
        <Button label="Delete" variant="destructive" onPress={confirmDelete} />
      </View>
    </ScrollView>
  );
}
