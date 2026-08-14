import React, { useEffect, useState } from "react";
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
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import { Card } from "@/src/components/ui";
import { MealLog } from "@/src/types/track";
import { MacroGoals, MacroTotals, EMPTY_TOTALS, sumNutrition } from "@/src/lib/mealMacros";
import { computeMacroSplit } from "@/src/lib/mealStats";
import { supabase } from "@/src/lib/supabase";
import { addDays, getLocalDateString } from "@/src/lib/dates";



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
    const key = getLocalDateString(d);
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
      saturated_fat_g: acc.saturated_fat_g + d.totals.saturated_fat_g,
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

  // E5. Asked once per opening, never on a timer, and failure is silence: an
  // observation is a bonus on a screen that is already complete without it.
  const [observations, setObservations] = useState<string[]>([]);
  const [loadingInsight, setLoadingInsight] = useState(false);
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setObservations([]);
    setLoadingInsight(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("meal-week-insight", {
          body: {
            logs: historicalLogs
              .filter((l) => dailyTotals.some((d) => d.date === l.date))
              .map((l) => ({
                date: l.date,
                meal_type: l.meal_type,
                name: l.name,
                calories: l.calories,
                protein: l.protein,
              })),
            calorieGoal: goals.calories ?? null,
            proteinGoal: goals.protein ?? null,
          },
        });
        if (error) throw error;
        if (!cancelled) setObservations((data?.observations ?? []) as string[]);
      } catch (e) {
        console.error("meal-week-insight:", e);
      } finally {
        if (!cancelled) setLoadingInsight(false);
      }
    })();
    return () => { cancelled = true; };
    // `dailyTotals`/`historicalLogs` are derived fresh each render; keying on
    // `visible` asks once per opening rather than on every recomputation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

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
            <ChevronLeft size={icons.lg} color={colors.text} />
            <Text style={styles.backText}>Meals</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
          <Text style={styles.title}>Weekly Summary</Text>
          <Text style={styles.subtitle}>Last 7 days</Text>

          {/* E5. Everything below this is arithmetic the reader can already
              do. This is the only part that says something they could not see
              — patterns across rows rather than sums of columns. Renders
              nothing at all when the week is too thin to support one, which
              is the honest output rather than a padded paragraph. */}
          {observations.length > 0 && (
            <Card variant="row" style={styles.insightCard}>
              <Text style={styles.insightHeader}>What stands out</Text>
              {observations.map((o) => (
                <Text key={o} style={styles.insightLine}>• {o}</Text>
              ))}
            </Card>
          )}
          {loadingInsight && (
            <Text style={styles.insightPending}>Reading your week…</Text>
          )}

          {/* Top-line totals */}
          <View style={styles.statsRow}>
            <Card variant="row" style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(weekTotals.calories)}</Text>
              <Text style={styles.statLabel}>Total cal</Text>
            </Card>
            <Card variant="row" style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(avgCals)}</Text>
              <Text style={styles.statLabel}>Avg cal/day</Text>
            </Card>
          </View>
          <View style={styles.statsRow}>
            <Card variant="row" style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(weekTotals.protein)}</Text>
              <Text style={styles.statLabel}>Total protein</Text>
            </Card>
            <Card variant="row" style={styles.statCell}>
              <Text style={styles.statValue}>{Math.round(avgProtein)}</Text>
              <Text style={styles.statLabel}>Avg protein/day</Text>
            </Card>
          </View>

          {/* Goal hit rates */}
          <Card variant="row" style={styles.cardSpacing}>
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
          </Card>

          {/* Highlights */}
          <Card variant="row" style={styles.cardSpacing}>
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
          </Card>

          {/* Macro split over the whole week */}
          {weekTotals.calories > 0 && (
            <Card variant="row" style={styles.cardSpacing}>
              <Text style={styles.cardTitle}>Macro split (week)</Text>
              <View style={styles.splitBar}>
                <View style={[styles.splitSegment, { flex: weekSplit.protein }]} />
                <View style={[styles.splitSegment, styles.splitCarbs, { flex: weekSplit.carbs }]} />
                <View style={[styles.splitSegment, styles.splitFats, { flex: weekSplit.fats }]} />
              </View>
              <Text style={styles.splitLabel}>
                <Text style={styles.splitProteinText}>
                  Protein {Math.round(weekSplit.protein * 100)}%
                </Text>
                <Text style={styles.splitSeparator}> · </Text>
                <Text style={styles.splitCarbsText}>
                  Carbs {Math.round(weekSplit.carbs * 100)}%
                </Text>
                <Text style={styles.splitSeparator}> · </Text>
                <Text style={styles.splitFatsText}>
                  Fats {Math.round(weekSplit.fats * 100)}%
                </Text>
              </Text>
            </Card>
          )}

          {/* Per-day calorie sparkline-ish */}
          <Card variant="row" style={styles.cardSpacing}>
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
                          { height: `${ratio * 100}%` },
                          hit ? styles.dayBarFillHit : styles.dayBarFillShort,
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
          </Card>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  backText: { ...typography.titleBar, fontWeight: "400", color: colors.text },
  content: { flex: 1 },
  contentInner: {
    padding: spacing.screenGutter,
    paddingBottom: spacing.xxxl,
  },
  title: {
    ...typography.titleRoot,
    color: colors.text,
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  // Equal columns from `flex: 1` + the row `gap` — never percentage widths,
  // which double-count the gap and leave the pair short of the gutter.
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  // Standing stat-cell token (see amendments): `rowTitle` at 700. Not
  // `titleRoot` — that is this modal's own H1 two lines above, and matching it
  // flattened the hierarchy.
  insightCard: { marginBottom: spacing.lg },
  insightHeader: { ...typography.section, marginBottom: spacing.sm },
  insightLine: {
    ...typography.body, color: colors.text, marginBottom: spacing.sm, lineHeight: 20,
  },
  insightPending: {
    ...typography.caption, color: colors.textFaint, marginBottom: spacing.lg,
  },
  statValue: {
    ...typography.rowTitle,
    fontWeight: "700",
    color: colors.text,
  },
  statLabel: {
    ...typography.caption,
    marginTop: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  /** Placement the `Card row` primitive can't express. */
  cardSpacing: {
    marginBottom: spacing.md,
  },
  cardTitle: {
    ...typography.section,
    marginBottom: spacing.md,
  },
  hitRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
  },
  hitLabel: { ...typography.body, color: colors.text },
  hitValue: { ...typography.buttonSm, color: colors.textMuted },
  splitBar: {
    flexDirection: "row",
    height: spacing.sm,
    borderRadius: radii.pill,
    overflow: "hidden",
    backgroundColor: colors.surface2,
  },
  // Data-series marks from the tokenized macro palette (spec §8 stage 6
  // sanctions macro fills); `under`/`met`/`atCap` here read as P/C/F, which is
  // the same three hues this bar has always used.
  splitSegment: { height: spacing.sm, backgroundColor: colors.macros.met },
  splitCarbs: { backgroundColor: colors.macros.atCap },
  splitFats: { backgroundColor: colors.macros.under },
  splitLabel: {
    ...typography.caption,
    fontWeight: "600",
    marginTop: spacing.sm,
    textAlign: "center",
  },
  splitProteinText: { color: colors.macros.met },
  splitCarbsText: { color: colors.macros.atCap },
  splitFatsText: { color: colors.macros.under },
  splitSeparator: { color: colors.textMuted },
  daysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: spacing.sm,
    height: 110,
  },
  dayCol: {
    flex: 1,
    alignItems: "center",
  },
  dayBarTrack: {
    width: "60%",
    height: 70,
    // Unfilled meter track (standing rule), not a faint outline.
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  dayBarFill: {
    width: "100%",
    borderRadius: radii.control,
  },
  dayBarFillHit: { backgroundColor: colors.macros.met },
  // Short of goal keeps the Meals identity orange — a bar fill, which spec §8
  // stage 6 sanctions.
  dayBarFillShort: { backgroundColor: colors.accents.meals },
  dayLabel: {
    ...typography.caption,
    color: colors.text,
    fontWeight: "600",
    marginTop: spacing.xs,
  },
  // Held at 9 rather than converged to `caption` (12). Seven `flex: 1` columns
  // inside this card leave ~31pt each on a 320pt device; a 4-digit calorie
  // total at 12pt needs ~29pt, and this `Text` has no `numberOfLines`, so it
  // would WRAP — and `daysRow` is a fixed 110pt with `alignItems: "flex-end"`,
  // so the second line would overflow the row. At 9pt the same value needs
  // ~22pt, leaving real headroom. `dayLabel` above is a single character, so
  // it converges to `caption` safely.
  dayValue: {
    fontSize: 9,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
});
