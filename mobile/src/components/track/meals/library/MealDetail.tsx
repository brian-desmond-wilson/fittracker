// mobile/src/components/track/meals/library/MealDetail.tsx
import React, { useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import type { MealTotals, MealWithItems } from "@/src/types/meal-library";
import { MEAL_TYPE_LABELS, ROLE_LABELS, defaultMealTypeFor } from "@/src/types/meal-library";
import type { MealType } from "@/src/types/track";
import type { BrianScoreResult } from "@/src/lib/mealScore";
import { COMPONENT_MAX, RAW_MAX } from "@/src/lib/mealScore";
import { lib, scoreChipStyle } from "./styles";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

interface MealDetailProps {
  meal: MealWithItems;
  totals: MealTotals;
  score: BrianScoreResult;
  logging: boolean;
  onLog: (meal: MealWithItems, mealType: MealType) => void;
  onEdit: (meal: MealWithItems) => void;
  onDelete: (meal: MealWithItems) => void;
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  return (
    <View style={[lib.row, { marginTop: 6 }]}>
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
  meal, totals, score, logging, onLog, onEdit, onDelete,
}: MealDetailProps) {
  const [mealType, setMealType] = useState<MealType>(defaultMealTypeFor(meal));

  const confirmDelete = () =>
    Alert.alert("Delete meal", `Delete "${meal.name}" from your library?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => onDelete(meal) },
    ]);

  const hasSmallPieces = meal.items.some((it) => it.small_pieces_ok);

  return (
    <ScrollView contentContainerStyle={{ paddingVertical: 16 }}>
      <View style={lib.card}>
        <View style={lib.rowBetween}>
          <Text style={lib.mealName}>{meal.name}</Text>
          <View style={[lib.scoreChip, scoreChipStyle(score.score)]}>
            <Text style={lib.scoreChipText}>{score.score}</Text>
          </View>
        </View>
        <Text style={[lib.mutedText, { marginTop: 4 }]}>
          {Math.round(totals.calories)} cal · {Math.round(totals.protein)}g protein · {meal.prep_minutes} min
          {meal.role ? ` · ${ROLE_LABELS[meal.role]}` : ""}
        </Text>
        {score.approved && (
          <View style={[lib.badge, { alignSelf: "flex-start", marginTop: 6 }]}>
            <Text style={lib.badgeText}>Brian Approved</Text>
          </View>
        )}
        {score.containsNever && (
          <Text style={[lib.neverFlag, { marginTop: 6 }]}>
            Contains a food rated “never”
          </Text>
        )}
        {score.tasteUnknown && (
          <Text style={[lib.smallMuted, { marginTop: 6 }]}>
            Taste unknown — no ingredient is linked to a rated food concept yet.
          </Text>
        )}
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Ingredients</Text>
        {meal.items.map((it) => (
          <View key={it.id} style={[lib.rowBetween, { marginTop: 8 }]}>
            <Text style={[lib.mutedText, { color: "#D1D5DB", flexShrink: 1 }]} numberOfLines={1}>
              {it.savedFood.name}
              {it.small_pieces_ok ? " ✂︎" : ""}
            </Text>
            <Text style={lib.smallMuted}>
              ×{it.servings} · {Math.round((it.savedFood.calories ?? 0) * it.servings)} cal
            </Text>
          </View>
        ))}
        {hasSmallPieces && (
          <Text style={[lib.smallMuted, { marginTop: 8 }]}>
            ✂︎ already cut small — EoE-safe
          </Text>
        )}
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700" }]}>Brian Score breakdown</Text>
        <ScoreBar label="Taste" value={score.taste} max={COMPONENT_MAX.taste} />
        <ScoreBar label="Convenience" value={score.convenience} max={COMPONENT_MAX.convenience} />
        <ScoreBar label="Protein" value={score.protein} max={COMPONENT_MAX.protein} />
        <ScoreBar label="EoE-Friendly" value={score.eoe} max={COMPONENT_MAX.eoe} />
        <ScoreBar label="Calories" value={score.calories} max={COMPONENT_MAX.calories} />
        <Text style={[lib.smallMuted, { marginTop: 8 }]}>
          {score.raw}/{RAW_MAX} renormalized to {score.score}/100 (cost unscored — no price data).
        </Text>
      </View>

      <View style={lib.card}>
        <Text style={[lib.mutedText, { fontWeight: "700", marginBottom: 8 }]}>Log as</Text>
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
        <TouchableOpacity
          style={[lib.primaryButton, { marginTop: 8, opacity: logging ? 0.6 : 1 }]}
          disabled={logging}
          onPress={() => onLog(meal, mealType)}
        >
          <Text style={lib.primaryButtonText}>
            {logging ? "Logging…" : "Log this meal"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[lib.rowBetween, { marginHorizontal: 16, marginTop: 4 }]}>
        <TouchableOpacity onPress={() => onEdit(meal)}>
          <Text style={lib.headerAction}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={confirmDelete}>
          <Text style={lib.destructiveText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
