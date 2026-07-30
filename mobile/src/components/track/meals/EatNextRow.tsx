// "Suggested now" strip (spec §7.2): the top 2 recommendations as tappable
// chips, rendered directly under `MealsPaceLines` on the Meals screen. A dumb
// renderer — the hook/engine owns all logic, including the `viewingToday`
// guard (§7.2's "today view only"), which lives at the MealsScreen call site
// because that is where the viewed date lives.
//
// CHIP COPY (§7.2's example reads "Korean Beef Bowl · 450 cal behind"): the
// name plus a number, and the number is the meal's OWN calories (with prep
// minutes, the other decision-relevant figure), not the pace gap. Reasoning:
//  - the gap is a CONTEXT-level number, and `EatNextResult` exposes it only
//    as prose in `message` ("450 cal behind pace" for catch_up, "~450 cal to
//    go before day's end" for emergency) — there is no numeric gap field, and
//    re-deriving one here from the screen's own `caloriePace` would be a
//    second source of truth computed off a different clock and a different
//    totals read, which is exactly what "the engine owns all logic" forbids.
//  - it is also only meaningful in 2 of the 6 contexts; `next_meal` and
//    `post_workout` have no gap at all, so a per-chip gap would have nothing
//    to render there.
//  - `calories`/`prepMinutes` are per-recommendation and always present
//    (`EatNextRecommendation`, added in Task 8 precisely so §7.1 and §7.2
//    could render numbers rather than prose).
// The gap is not rendered at strip level either, and deliberately so: this row
// mounts DIRECTLY beneath `MealsPaceLines`, whose `behind` branch already
// renders "Calories: {delta}cal behind · eat {catchUpAmount}cal by {label}"
// (`MealsPaceLines.tsx:56-62`) from the screen's own pace state — a more
// precise statement of the same fact, one line up. Adding `result.message`
// here would not only duplicate it in all three contexts where a message can
// co-occur with a recommendation (catch_up, emergency, and goal_hit
// protein-short, whose shortfall the protein pace line likewise already
// states), it would stack TWO INDEPENDENTLY COMPUTED versions of one number
// adjacently: `useEatNext` and MealsScreen read `meal_logs` and sample
// `new Date()` separately and settle asynchronously after a write, so the two
// lines can briefly disagree on screen. (This reasoning is specific to this
// surface — `EatNextHomeCard` has no pace lines beside it and correctly does
// render `message`.)
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import type { EatNextResult } from "@/src/lib/eatNext";

interface EatNextRowProps {
  result: EatNextResult | null;
  onMealPress: (mealId: string) => void;
}

export function EatNextRow({ result, onMealPress }: EatNextRowProps) {
  // No recommendations → no strip. Every context that renders a message but
  // no recommendation (`after_window`, terminal `goal_hit`, an empty library)
  // is the Home card's job (§7.1's "never a blank card"); §7.2 is a chip row,
  // so with nothing to tap it renders nothing. This is also §7.2's "clear the
  // suggestion" path after a log lands.
  if (!result || result.recommendations.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Suggested now</Text>
      {result.recommendations.slice(0, 2).map((rec) => (
        <TouchableOpacity
          key={rec.mealId}
          style={styles.chip}
          activeOpacity={0.7}
          onPress={() => onMealPress(rec.mealId)}
        >
          <Text style={styles.chipName} numberOfLines={1}>{rec.name}</Text>
          <Text style={styles.chipStats} numberOfLines={1}>
            {rec.calories} cal · {rec.prepMinutes} min
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// Local `StyleSheet` rather than the shared `mealsScreenStyles`, matching how
// `MealsPaceLines` and `RecentFoodChips` scope their own small-widget styles.
// Colors come from `colors` for the same reason `RecentFoodChips.tsx:90-115`
// does: these two chip rows can be on screen together, and hardcoded hex had
// them rendering different backgrounds (`#111827` against `colors.card`'s
// `#1E293B`). Geometry deliberately differs from that peer — full-width
// stacked blocks at `borderRadius: 10` rather than its `maxWidth: "48%"`
// pills — because a meal name plus a stats line does not fit a half-width
// pill without truncating the name to uselessness.
const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 4 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  chip: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  chipName: { fontSize: 14, fontWeight: "600", color: colors.foreground },
  chipStats: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
});
