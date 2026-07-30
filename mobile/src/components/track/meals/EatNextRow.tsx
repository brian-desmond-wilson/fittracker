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
// So the gap appears exactly once, at strip level, in the engine's own words
// (`result.message`), and each chip carries its own numbers. In `catch_up` —
// the context §7.2's example is drawn from — the two nearly coincide anyway:
// candidates are filtered to within ±35% of the gap (`CATCH_UP_BAND`), so a
// 450 cal gap surfaces ~450 cal meals.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
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
  // `!!` rather than a bare `&&`: `message` is `string | null`, and a falsy
  // *string* ("") would land as a bare text child of the `View` below, which
  // RN rejects ("Text strings must be rendered within a <Text> component").
  // Unreachable with today's engine — every message it produces is `null` or
  // a non-empty literal — but this reads as a boolean and should be one.
  const showMessage = !!result.message;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Suggested now</Text>
      {showMessage && (
        <Text style={styles.message} numberOfLines={1}>
          {result.message}
        </Text>
      )}
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

const styles = StyleSheet.create({
  container: { marginTop: 8, marginBottom: 4 },
  label: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  // Deliberately NOT folded into `label`: uppercased with `letterSpacing`,
  // the longest message that can co-occur with a recommendation ("Calorie
  // target hit — protein still short.", 40 chars) would overflow the strip's
  // width beside "SUGGESTED NOW". Its own line keeps both intact.
  message: { fontSize: 12, color: "#9CA3AF", marginTop: -2, marginBottom: 6 },
  chip: {
    backgroundColor: "#111827",
    borderWidth: 1,
    borderColor: "#1F2937",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 6,
  },
  chipName: { fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  chipStats: { fontSize: 12, color: "#9CA3AF", marginTop: 2 },
});
