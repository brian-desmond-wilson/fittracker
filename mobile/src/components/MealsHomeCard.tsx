import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Flame } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import {
  MacroGoals,
  MacroTotals,
  EMPTY_TOTALS,
  sumNutrition,
  formatMacroValue,
  macroProgress,
  macroColor,
} from "@/src/lib/mealMacros";

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
    sugars: null,
    fiber_g: null,
  });
  const [totals, setTotals] = useState<MacroTotals>(EMPTY_TOTALS);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const today = getLocalDate();
      const [profileRes, mealsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "target_calories, target_protein_g, target_carbs_g, target_sodium_mg, target_fats_g, target_sugars_g, target_fiber_g"
          )
          .eq("id", user.id)
          .single(),
        supabase
          .from("meal_logs")
          .select("calories, protein, carbs, fats, sugars, sodium_mg, fiber_g")
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
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push("/(tabs)/track/meals")}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Meals</Text>
        <View style={styles.iconContainer}>
          <Flame size={20} color="#F97316" strokeWidth={2} />
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
    </TouchableOpacity>
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
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.08)" strokeWidth={strokeWidth} fill="none" />
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
    <View style={{ marginBottom: 8 }}>
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
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1F2937",
    width: "47%",
    minWidth: 160,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
    flex: 1,
  },
  iconContainer: {
    backgroundColor: "rgba(249, 115, 22, 0.2)",
    borderRadius: 8,
    padding: 6,
  },
  body: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  rightCol: {
    flex: 1,
    justifyContent: "center",
  },
});

const ringStyles = StyleSheet.create({
  topText: {
    fontSize: 16,
    fontWeight: "bold",
    lineHeight: 18,
  },
  bottomText: {
    fontSize: 9,
    color: "#9CA3AF",
    marginTop: 1,
  },
});

const lineStyles = StyleSheet.create({
  label: {
    fontSize: 9,
    color: "#9CA3AF",
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  value: {
    fontSize: 11,
    color: "#FFFFFF",
    fontWeight: "600",
    marginTop: 1,
  },
  track: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 1.5,
    overflow: "hidden",
    marginTop: 3,
  },
  fill: {
    height: 3,
    borderRadius: 1.5,
  },
});
