import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Flame } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import { Card } from "@/src/components/ui";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { getLocalDateString } from "@/src/lib/dates";
import {
  MacroGoals,
  MacroTotals,
  EMPTY_TOTALS,
  sumNutrition,
  formatMacroValue,
  macroProgress,
  macroColor,
} from "@/src/lib/mealMacros";


interface MealsHomeCardProps {
  refreshKey?: number;
}

export function MealsHomeCard({ refreshKey }: MealsHomeCardProps) {
  const router = useRouter();
  const [goals, setGoals] = useState<MacroGoals>({
    calories: null,
    protein: null,
    carbs: null,
    sodium_mg: null,
    fats: null,
    saturated_fat_g: null,
    sugars: null,
    fiber_g: null,
  });
  const [totals, setTotals] = useState<MacroTotals>(EMPTY_TOTALS);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const today = getLocalDateString();
      const [profileRes, mealsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "target_calories, target_protein_g, target_carbs_g, target_sodium_mg, target_fats_g, target_saturated_fat_g, target_sugars_g, target_fiber_g"
          )
          .eq("id", user.id)
          .single(),
        supabase
          .from("meal_logs")
          .select("calories, protein, carbs, fats, sugars, saturated_fat_g, sodium_mg, fiber_g")
          .eq("user_id", user.id)
          .eq("date", today),
      ]);
      const p = profileRes.data;
      setGoals({
        calories: p?.target_calories ?? null,
        protein: p?.target_protein_g ?? null,
        carbs: p?.target_carbs_g ?? null,
        sodium_mg: p?.target_sodium_mg ?? null,
        fats: p?.target_fats_g ?? null,
        saturated_fat_g: p?.target_saturated_fat_g ?? null,
        sugars: p?.target_sugars_g ?? null,
        fiber_g: p?.target_fiber_g ?? null,
      });
      setTotals(sumNutrition(mealsRes.data ?? []));
    } catch (error) {
      console.error("MealsHomeCard load failed:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, refreshKey])
  );

  return (
    <Card
      variant="panel"
      style={styles.cardSizing}
      onPress={() => router.push("/(tabs)/track/fuel")}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Fuel</Text>
        <View style={styles.iconContainer}>
          <Flame size={icons.md} color={colors.accents.meals} strokeWidth={icons.strokeWidth} />
        </View>
      </View>

      <View style={styles.body}>
        <MiniRing
          size={64}
          strokeWidth={6}
          value={totals.calories}
          goal={goals.calories}
          color={macroColor(totals.calories, goals.calories, "calories")}
          centerTop={formatMacroValue(totals.calories, "calories")}
          centerBottom={goals.calories != null ? `of ${formatMacroValue(goals.calories, "calories")}` : "cal"}
        />
        <View style={styles.rightCol}>
          <MacroLine
            label="Protein"
            value={totals.protein}
            goal={goals.protein}
            ratio={macroProgress(totals.protein, goals.protein)}
            color={macroColor(totals.protein, goals.protein, "protein")}
          />
          <MacroLine
            label="Carbs"
            value={totals.carbs}
            goal={goals.carbs}
            ratio={macroProgress(totals.carbs, goals.carbs)}
            color={macroColor(totals.carbs, goals.carbs, "carbs")}
          />
        </View>
      </View>
    </Card>
  );
}

function MiniRing({
  size,
  strokeWidth,
  value,
  goal,
  color,
  centerTop,
  centerBottom,
}: {
  size: number;
  strokeWidth: number;
  value: number;
  goal: number | null;
  color: string;
  centerTop: string;
  centerBottom: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * radius;
  const ratio = macroProgress(value, goal);
  const offset = c * (1 - ratio);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={colors.surface2} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={{ position: "absolute", alignItems: "center" }}>
        <Text style={[ringStyles.topText, { color }]}>{centerTop}</Text>
        <Text style={ringStyles.bottomText}>{centerBottom}</Text>
      </View>
    </View>
  );
}

function MacroLine({
  label,
  value,
  goal,
  ratio,
  color,
}: {
  label: string;
  value: number;
  goal: number | null;
  ratio: number;
  color: string;
}) {
  // Stacked layout (label tiny on top, value + bar below) so the row
  // never overflows even when goals push the value width.
  return (
    <View style={lineStyles.wrap}>
      <Text style={lineStyles.label} numberOfLines={1}>
        {label.toUpperCase()}
      </Text>
      <Text style={lineStyles.value} numberOfLines={1}>
        {Math.round(value)}
        {goal != null ? ` / ${Math.round(goal)}g` : "g"}
      </Text>
      <View style={lineStyles.track}>
        <View
          style={[lineStyles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // `Card variant="panel"` owns surface/radius/padding/border; the grid sizing
  // the old bespoke `card` style also carried lives here. `flex: 1` rather
  // than the old `width: "47%"`: Home's grid supplies a `spacing.lg` gap, so a
  // percentage double-counts the separation and leaves the row short of the
  // gutter. Flex lets the gap own it exactly, at any device width.
  cardSizing: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.body,
    color: colors.textMuted,
    flex: 1,
  },
  iconContainer: {
    backgroundColor: tint(colors.accents.meals),
    borderRadius: radii.control,
    padding: spacing.sm,
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rightCol: {
    flex: 1,
    justifyContent: "center",
  },
});

// The ring's centre labels and the macro lines keep their sub-caption font
// sizes (9/11): they are sized to fit inside a 64pt ring and a half-width
// card, and spec §4.5 defines no token below `caption` (12) — same call Task 6
// recorded for `lib.input`'s 15. Colors and spacing are tokenized.
const ringStyles = StyleSheet.create({
  topText: {
    ...typography.rowTitle,
    lineHeight: 18,
  },
  bottomText: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: 1,
  },
});

const lineStyles = StyleSheet.create({
  wrap: { marginBottom: spacing.sm },
  label: {
    fontSize: 9,
    color: colors.textMuted,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  value: {
    fontSize: 11,
    color: colors.text,
    fontWeight: "600",
    marginTop: 1,
  },
  track: {
    height: 3,
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    overflow: "hidden",
    marginTop: 3,
  },
  fill: {
    height: 3,
    borderRadius: radii.pill,
  },
});
