// The verdict strip: Fuel's one-glance answer to "am I okay?", worn at the
// top of the rail (Direction B's hero, at Direction A's density).
//
// Verdict chip first — including WHEN the plan was last rebuilt, so the strip
// never pretends to be more live than it is — arithmetic second, and the engine's
// promise: what the rail below lands the day at. Replaces the pace lines AND
// the ring card on today's view; past days keep the full nutrition card,
// because a finished day is a record, not a plan.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Badge, Card, type BadgeTone } from "@/src/components/ui";
import {
  formatMacroProgress,
  formatMacroValue,
  macroColor,
  macroProgress,
  macroUnit,
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
  /** When the plan was computed — rendered on the chip ("· replanned 1:25"). */
  computedAt: Date;
}

const TONE_FOR: Record<FuelVerdict["tone"], BadgeTone> = {
  behind: "warning",
  on_pace: "success",
  ahead: "neutral",
  goal_hit: "success",
  closed: "neutral",
};

/** Chip copy stays short — the chip carries the verdict word plus the
 *  replanned time, per the approved mock ("Behind · replanned 1:25"). */
const CHIP_WORD: Record<FuelVerdict["tone"], string> = {
  behind: "Behind",
  on_pace: "On pace",
  ahead: "Ahead",
  goal_hit: "Goals hit",
  closed: "Day closed",
};

/** The three macros the strip paces — always all three, per the mock. A
 *  missing goal renders the row with an empty track rather than hiding it:
 *  "you're not pacing fiber" is information, an absent row is a mystery. */
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

function fmtClock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")}`;
}

export function FuelVerdictStrip({
  verdict,
  projection,
  dayTotals,
  goals,
  computedAt,
}: FuelVerdictStripProps) {
  return (
    // This screen's elements each carry the gutter (no container owns it) —
    // same as MealsNutritionCard beside it in the past-day branch.
    <Card variant="panel" style={s.gutter}>
      <View style={s.headRow}>
        <Badge
          tone={TONE_FOR[verdict.tone]}
          label={`${CHIP_WORD[verdict.tone]} · replanned ${fmtClock(computedAt)}`}
        />
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
        return (
          <View key={key} style={s.barRow}>
            <Text style={s.barLabel} numberOfLines={1}>
              {goal != null
                ? `${label} ${formatMacroProgress(value, goal, key)}`
                : `${label} ${formatMacroValue(value, key)}${macroUnit(key)} · no goal`}
            </Text>
            <View style={s.track}>
              {goal != null && (
                <View
                  style={[
                    s.fill,
                    {
                      width: `${macroProgress(value, goal) * 100}%`,
                      backgroundColor: macroColor(value, goal, key),
                    },
                  ]}
                />
              )}
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const s = StyleSheet.create({
  // The rail starts immediately below with no top margin of its own, so the
  // strip owns the gap between the two.
  gutter: { marginHorizontal: spacing.screenGutter, marginBottom: spacing.lg },
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
