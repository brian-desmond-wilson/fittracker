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
// the Home card state the same verdict in the same words; the geometry now
// comes from the `Badge` primitive, which both surfaces share.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Badge, Card } from "@/src/components/ui";
import {
  eatNextStockBadge,
  eatNextExpiringLine,
  eatNextMissingLine,
  type EatNextResult,
} from "@/src/lib/eatNext";

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
        // Spec §10's "names an expiring ingredient", on this surface too.
        // JUDGEMENT (the denser-surface call the review asked for): it fits,
        // and it ships here rather than being left to the Home card. The chip
        // is already a full-width stacked block precisely because a name plus
        // a stats line does not fit a half-width pill (see the geometry note
        // on `styles`), so there is horizontal room for a third line; the line
        // is `null` for every meal with no expiring ingredient, so in the
        // common case the strip is byte-identical to before; and at most two
        // chips render. The alternative — Home card only — would put the two
        // Eat Next surfaces back in the state this task exists to fix, one
        // naming the rescue and one silently not.
        const expiringLine = eatNextExpiringLine(rec.stock);
        // B2: which ones, not just how many.
        const missingLine = eatNextMissingLine(rec.stock);
        return (
          <Card
            key={rec.mealId}
            variant="row"
            style={styles.chip}
            onPress={() => onMealPress(rec.mealId)}
          >
            <View style={styles.chipHeader}>
              <Text style={styles.chipName} numberOfLines={1}>{rec.name}</Text>
              {badge && (
                <Badge label={badge.label} tone={badge.tone} />
              )}
            </View>
            <Text style={styles.chipStats} numberOfLines={1}>
              {rec.calories} cal · {rec.prepMinutes} min
            </Text>
            {missingLine && (
              <Text style={styles.chipStats} numberOfLines={1}>
                {missingLine}
              </Text>
            )}
            {expiringLine && (
              <Text style={styles.chipExpiring} numberOfLines={1}>
                {expiringLine}
              </Text>
            )}
          </Card>
        );
      })}
    </View>
  );
}

// Local `StyleSheet` rather than the shared `mealsScreenStyles`, matching how
// `MealsPaceLines` and `RecentFoodChips` scope their own small-widget styles.
// Only placement/typography lives here now: the chip surface is `Card row` and
// the stock verdict is the `Badge` primitive, so the copy-pasted green/amber
// pair this file used to carry (mirroring `EatNextHomeCard`'s) is gone — the
// two surfaces now provably render the same verdict in the same treatment.
const styles = StyleSheet.create({
  container: { marginTop: spacing.sm, marginBottom: spacing.xs },
  label: {
    ...typography.section,
    marginBottom: spacing.sm,
  },
  /** Placement only — `Card row` owns surface, radius, padding and border. */
  chip: { marginBottom: spacing.sm },
  // The name and its badge share one row; `flexShrink: 1` + `numberOfLines={1}`
  // on the name means a long meal name truncates instead of pushing the badge
  // out of the chip. `Badge` keeps RN's default `flexShrink: 0`.
  chipHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  chipName: {
    ...typography.buttonSm,
    color: colors.text,
    flexShrink: 1,
  },
  chipStats: { ...typography.caption, marginTop: spacing.xs },
  // Same amber as the Home card's expiring line and the same unfilled
  // treatment `MealDetail` gives the identical string, with
  // `numberOfLines={1}` rather than 2 because this is the dense surface and
  // two chips stack here under the pace lines. A truncated rescue line still
  // reads as a rescue and the full text is one tap away in MealDetail; a
  // wrapping one would push the second chip off the fold.
  chipExpiring: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.xs,
  },
});
