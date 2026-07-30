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
//
// STOCK BADGE (Task 14): the one thing on the chip that is NOT one of the
// numbers argued about above. It reads `rec.stock` — the typed verdict —
// never `rec.reasons`, whose stock entry sits at no fixed index (that read is
// exactly what made the engine's stock copy invisible on both surfaces). Copy
// and the green/amber split come from `eatNextStockBadge` so this chip and
// the Home card state the same verdict in the same words; only the geometry
// is local, because this surface is denser than the Home card.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import { eatNextStockBadge, type EatNextResult } from "@/src/lib/eatNext";

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
      {result.recommendations.slice(0, 2).map((rec) => {
        // `null` = unknown stock → no badge at all. Saying nothing is the
        // correct rendering of "we don't know"; anything else would claim
        // more than the ranking did.
        const badge = eatNextStockBadge(rec.stock);
        return (
          <TouchableOpacity
            key={rec.mealId}
            style={styles.chip}
            activeOpacity={0.7}
            onPress={() => onMealPress(rec.mealId)}
          >
            <View style={styles.chipHeader}>
              <Text style={styles.chipName} numberOfLines={1}>{rec.name}</Text>
              {badge && (
                <View
                  style={[
                    styles.stockBadge,
                    badge.assemblable ? styles.stockBadgeIn : styles.stockBadgeMissing,
                  ]}
                >
                  <Text
                    style={[
                      styles.stockBadgeText,
                      badge.assemblable
                        ? styles.stockBadgeInText
                        : styles.stockBadgeMissingText,
                    ]}
                    numberOfLines={1}
                  >
                    {badge.label}
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.chipStats} numberOfLines={1}>
              {rec.calories} cal · {rec.prepMinutes} min
            </Text>
          </TouchableOpacity>
        );
      })}
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
  // The name and its badge share one row; `flexShrink: 1` + `numberOfLines={1}`
  // on the name means a long meal name truncates instead of pushing the badge
  // out of the chip. The badge keeps RN's default `flexShrink: 0` — stated
  // explicitly below for the same reason it is on the Home card.
  chipHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  chipName: { fontSize: 14, fontWeight: "600", color: colors.foreground, flexShrink: 1 },
  chipStats: { fontSize: 12, color: colors.mutedForeground, marginTop: 2 },
  // One notch tighter than the Home card's badge (11pt text in a 6/2 box):
  // this strip stacks two chips directly under `MealsPaceLines`, so the badge
  // has to read as an annotation on the name rather than a second element
  // competing with it. Colors are deliberately identical to the Home card's —
  // same verdict, same green/amber — only the geometry is denser.
  stockBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
    flexShrink: 0,
  },
  stockBadgeText: { fontSize: 10, fontWeight: "600" },
  stockBadgeIn: { backgroundColor: "rgba(34,197,94,0.15)" },
  stockBadgeInText: { color: "#22C55E" },
  stockBadgeMissing: { backgroundColor: "rgba(245,158,11,0.15)" },
  stockBadgeMissingText: { color: "#F59E0B" },
});
