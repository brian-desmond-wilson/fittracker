// The verdict strip: Fuel's one-glance answer to "am I okay?", worn at the
// top of the rail (Direction B's hero, at Direction A's density).
//
// Verdict chip first, arithmetic second, and the engine's promise — what the
// plan below lands the day at — so the reader knows the rail already solves
// whatever gap the chip announces. Replaces the pace lines AND the ring card
// on today's view; past days keep the full nutrition card, because a finished
// day is a record, not a plan.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Badge, Card, type BadgeTone } from "@/src/components/ui";
import {
  formatMacroProgress,
  macroColor,
  macroProgress,
  type MacroGoals,
  type MacroTotals,
  type MacroKey,
} from "@/src/lib/mealMacros";
import type { FuelProjection, FuelVerdict } from "@/src/lib/fuelPlan";

interface FuelVerdictStripProps {
  verdict: FuelVerdict;
  projection: FuelProjection | null;
  dayTotals: MacroTotals;
  goals: MacroGoals;
}

const TONE_FOR: Record<FuelVerdict["tone"], BadgeTone> = {
  behind: "warning",
  on_pace: "success",
  ahead: "neutral",
  goal_hit: "success",
  closed: "neutral",
};

/** The three macros the strip paces. The rest stay on Insights and the
 *  past-day card — the strip is a glance, not a panel. */
const STRIP_MACROS: Array<{ key: MacroKey; label: string }> = [
  { key: "calories", label: "Calories" },
  { key: "protein", label: "Protein" },
  { key: "fiber", label: "Fiber" },
];

function valueFor(t: MacroTotals, k: MacroKey): number {
  return k === "calories" ? t.calories : k === "protein" ? t.protein : t.fiber_g;
}
function goalFor(g: MacroGoals, k: MacroKey): number | null {
  return k === "calories" ? g.calories : k === "protein" ? g.protein : g.fiber_g;
}

export function FuelVerdictStrip({
  verdict,
  projection,
  dayTotals,
  goals,
}: FuelVerdictStripProps) {
  return (
    <Card variant="panel">
      <View style={s.headRow}>
        <Badge tone={TONE_FOR[verdict.tone]} label={verdict.label} />
        {projection && (
          <Text style={s.projection} numberOfLines={1}>
            plan lands {projection.calories.toLocaleString()} cal ·{" "}
            {Math.round(projection.protein)}g P
          </Text>
        )}
      </View>
      {STRIP_MACROS.map(({ key, label }) => {
        const value = valueFor(dayTotals, key);
        const goal = goalFor(goals, key);
        if (goal == null) return null;
        return (
          <View key={key} style={s.barRow}>
            <Text style={s.barLabel} numberOfLines={1}>
              {label} {formatMacroProgress(value, goal, key)}
            </Text>
            <View style={s.track}>
              <View
                style={[
                  s.fill,
                  {
                    width: `${macroProgress(value, goal) * 100}%`,
                    backgroundColor: macroColor(value, goal, key),
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  headRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  projection: { ...typography.caption, flexShrink: 1 },
  barRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  // Wide enough for "Calories 2,300 / 2,300" without wrapping; the bar takes
  // the rest of the row.
  barLabel: { ...typography.caption, width: 148 },
  // Rule 14: the groove a fill lives in is surface2.
  track: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.surface2,
    overflow: "hidden",
  },
  fill: { height: "100%", borderRadius: 999 },
});
