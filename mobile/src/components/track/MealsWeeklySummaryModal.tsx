import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/src/lib/colors";
import { MealLog } from "@/src/types/track";
import { MacroGoals, MacroTotals, EMPTY_TOTALS, sumNutrition } from "@/src/lib/mealMacros";
import { computeMacroSplit } from "@/src/lib/mealStats";

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + days);
  return r;
}

interface MealsWeeklySummaryModalProps {
  visible: boolean;
  historicalLogs: MealLog[];
  goals: MacroGoals;
  onClose: () => void;
}

/**
 * Single-screen weekly digest. Uses the last 7 days ending today.
 */
export function MealsWeeklySummaryModal({
  visible,
  historicalLogs,
  goals,
  onClose,
}: MealsWeeklySummaryModalProps) {
  const insets = useSafeAreaInsets();

  // Build per-day totals over the last 7 days (oldest -> newest).
  const today = new Date();
  const dailyTotals: { date: string; totals: MacroTotals; weekday: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addDays(today, -i);
    const key = getLocalDate(d);
    const dayLogs = historicalLogs.filter((l) => l.date === key);
    dailyTotals.push({
      date: key,
      totals: sumNutrition(dayLogs),
      weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
    });
  }

  const weekTotals = dailyTotals.reduce<MacroTotals>(
    (acc, d) => ({
      calories: acc.calories + d.totals.calories,
      protein: acc.protein + d.totals.protein,
      carbs: acc.carbs + d.totals.carbs,
      fats: acc.fats + d.totals.fats,
      sugars: acc.sugars + d.totals.sugars,
      sodium_mg: acc.sodium_mg + d.totals.sodium_mg,
      fiber_g: acc.fiber_g + d.totals.fiber_g,
    }),
    { ...EMPTY_TOTALS },
  );

  const avgCals = weekTotals.calories / 7;
  const avgProtein = weekTotals.protein / 7;
  const calGoal = goals.calories ?? 0;
  const proGoal = goals.protein ?? 0;
  const calDaysHit = dailyTotals.filter((d) =>
    calGoal > 0 ? d.totals.calories >= calGoal : false,
  ).length;
  const proDaysHit = dailyTotals.filter((d) =>
    proGoal > 0 ? d.totals.protein >= proGoal : false,
  ).length;

  const bestProteinDay = dailyTotals.reduce(
    (best, d) => (d.totals.protein > best.totals.protein ? d : best),
    dailyTotals[0],
  );
  const bestCalDay = dailyTotals.reduce(
    (best, d) => (d.totals.calories > best.totals.calories ? d : best),
    dailyTotals[0],
  );

  const weekSplit = computeMacroSplit(weekTotals);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Meals</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={styles.title}>Weekly Summary</Text>
          <Text style={styles.subtitle}>Last 7 days</Text>

          {/* Top-line totals */}
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(weekTotals.calories)}</Text>
              <Text style={styles.statLabel}>Total cal</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(avgCals)}</Text>
              <Text style={styles.statLabel}>Avg cal/day</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(weekTotals.protein)}</Text>
              <Text style={styles.statLabel}>Total protein</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(avgProtein)}</Text>
              <Text style={styles.statLabel}>Avg protein/day</Text>
            </View>
          </View>

          {/* Goal hit rates */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Goal hits</Text>
            <View style={styles.hitRow}>
              <Text style={styles.hitLabel}>Calories</Text>
              <Text style={styles.hitValue}>
                {calGoal > 0 ? `${calDaysHit} / 7 days` : "No goal set"}
              </Text>
            </View>
            <View style={styles.hitRow}>
              <Text style={styles.hitLabel}>Protein</Text>
              <Text style={styles.hitValue}>
                {proGoal > 0 ? `${proDaysHit} / 7 days` : "No goal set"}
              </Text>
            </View>
          </View>

          {/* Highlights */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Highlights</Text>
            <View style={styles.hitRow}>
              <Text style={styles.hitLabel}>Best protein day</Text>
              <Text style={styles.hitValue}>
                {bestProteinDay.totals.protein > 0
                  ? `${bestProteinDay.weekday} · ${Math.round(bestProteinDay.totals.protein)} g`
                  : "—"}
              </Text>
            </View>
            <View style={styles.hitRow}>
              <Text style={styles.hitLabel}>Highest calorie day</Text>
              <Text style={styles.hitValue}>
                {bestCalDay.totals.calories > 0
                  ? `${bestCalDay.weekday} · ${Math.round(bestCalDay.totals.calories)} cal`
                  : "—"}
              </Text>
            </View>
          </View>

          {/* Macro split over the whole week */}
          {weekTotals.calories > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Macro split (week)</Text>
              <View style={styles.splitBar}>
                <View
                  style={{
                    flex: weekSplit.protein,
                    backgroundColor: "#22C55E",
                    height: 8,
                  }}
                />
                <View
                  style={{
                    flex: weekSplit.carbs,
                    backgroundColor: "#F59E0B",
                    height: 8,
                  }}
                />
                <View
                  style={{
                    flex: weekSplit.fats,
                    backgroundColor: "#3B82F6",
                    height: 8,
                  }}
                />
              </View>
              <Text style={styles.splitLabel}>
                <Text style={{ color: "#22C55E" }}>
                  Protein {Math.round(weekSplit.protein * 100)}%
                </Text>
                <Text style={{ color: colors.mutedForeground }}> · </Text>
                <Text style={{ color: "#F59E0B" }}>
                  Carbs {Math.round(weekSplit.carbs * 100)}%
                </Text>
                <Text style={{ color: colors.mutedForeground }}> · </Text>
                <Text style={{ color: "#3B82F6" }}>
                  Fats {Math.round(weekSplit.fats * 100)}%
                </Text>
              </Text>
            </View>
          )}

          {/* Per-day calorie sparkline-ish */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Daily calories</Text>
            <View style={styles.daysRow}>
              {dailyTotals.map((d) => {
                const ratio =
                  calGoal > 0 ? Math.min(d.totals.calories / calGoal, 1) : 0;
                const hit = calGoal > 0 && d.totals.calories >= calGoal;
                return (
                  <View key={d.date} style={styles.dayCol}>
                    <View style={styles.dayBarTrack}>
                      <View
                        style={[
                          styles.dayBarFill,
                          {
                            height: `${ratio * 100}%`,
                            backgroundColor: hit ? "#22C55E" : "#F97316",
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.dayLabel}>{d.weekday[0]}</Text>
                    <Text style={styles.dayValue}>
                      {Math.round(d.totals.calories)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
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
  backText: { fontSize: 17, color: colors.foreground },
  content: { flex: 1 },
  contentInner: { padding: 20, paddingBottom: 60 },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.foreground,
  },
  subtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 12,
  },
  statCell: {
    width: "47%",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  hitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  hitLabel: { fontSize: 13, color: colors.foreground },
  hitValue: { fontSize: 13, color: colors.mutedForeground, fontWeight: "600" },
  splitBar: {
    flexDirection: "row",
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  splitLabel: {
    fontSize: 11,
    fontWeight: "600",
    marginTop: 6,
    textAlign: "center",
  },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 6,
    height: 110,
  },
  dayCol: {
    flex: 1,
    alignItems: "center",
  },
  dayBarTrack: {
    width: "60%",
    height: 70,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 4,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  dayBarFill: {
    width: "100%",
    borderRadius: 4,
  },
  dayLabel: {
    fontSize: 11,
    color: colors.foreground,
    marginTop: 4,
    fontWeight: "600",
  },
  dayValue: {
    fontSize: 9,
    color: colors.mutedForeground,
    marginTop: 2,
  },
});
