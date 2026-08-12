// Home surface for the Eat Next recommender (spec §7.1). Full-width card,
// TodaysWorkoutCard pattern: self-fetching, refreshKey prop-driven reload
// (no remount — the same component instance re-fetches when refreshKey
// changes), loading / error+retry / contextual-empty states. Also the
// app-open resync point for the eat-nudge family.
import React, { useCallback, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { UtensilsCrossed } from "lucide-react-native";
import { useEatNext } from "@/src/hooks/useEatNext";
import { syncEatNudge } from "@/src/services/eatNudgeService";
import { Badge, Card } from "@/src/components/ui";
import { colors, icons, spacing, tint, typography } from "@/src/theme/tokens";
// `eatNextStockBadge` is the ONE decision point for the badge's copy and its
// green/amber split (see its doc comment) — this file never re-derives
// "In stock" / "Missing N" from `stock.assemblable`/`stock.missingCount`
// itself, and never reads `reasons` for it.
import {
  EMPTY_LIBRARY_MESSAGE,
  eatNextStockBadge,
  eatNextExpiringLine,
} from "@/src/lib/eatNext";
// `scoreTone` is the ONE band → Badge-tone lookup (it resolves spec §6's
// thresholds through `scoreBand`, whose cutoffs this file never re-declares).
// Imported rather than mirrored so the same score renders the same chip color
// here and in the Meal Library — which is exactly what the copy-pasted local
// palette this import replaced could not guarantee.
import { scoreTone } from "@/src/components/track/meals/library/styles";

interface EatNextHomeCardProps {
  refreshKey?: number;
}

export function EatNextHomeCard({ refreshKey }: EatNextHomeCardProps) {
  const { result, loading, error, refetch, computedAt } = useEatNext(refreshKey);

  // `useEatNext`'s own mount effect already issues the first load — this
  // ref skips ONLY the focus callback that fires alongside that same first
  // mount, so the card doesn't double-load on every mount. Every subsequent
  // NAVIGATION focus (tab switch back to Home) still refetches normally; a
  // remount resets the ref (fresh component instance) and the hook's own
  // mount effect fires again in lockstep, so that path stays correct too.
  // NOT covered: a warm foreground return (app backgrounded, then
  // foregrounded again with Home still the focused screen) does not refire
  // this — `useFocusEffect` is a navigation-focus hook, not an AppState
  // listener, and `app/_layout.tsx`'s AppState handler only logs. See the
  // corrected spec §8.1 parenthetical for the consequence.
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      refetch();
    }, [refetch]),
  );

  // App-open / focus resync point for the nudge family (spec §8.1). `result`
  // and `computedAt` are always a matched pair from the same `useEatNext`
  // load — the hook sets them together on every success and leaves both
  // untouched on a failed refetch (stale-while-revalidate) — so this effect
  // never has to reach for a fresh `new Date()` the way the cross-midnight
  // landmine required (see eatNext.ts's `EatNextNudge.fireAtMinutes` doc
  // comment and useEatNext.ts's `computedAt` doc comment). `computedAt` is
  // `Date | null` before the first load resolves; that case has no decision
  // to sync yet, so it's a deliberate no-op, not an oversight.
  //
  // `syncEatNudge` can reject (`requestPermissions` in `notificationService.ts`
  // has no try/catch around its native calls, and `syncEatNudgeCore` awaits
  // it outside its own try). Its doc comment names the caller as responsible
  // for that rejection; unlike `persistMeals` (which awaits `syncMealReminders`
  // inside a try/catch), this is a background effect with nothing to catch it
  // — an uncaught rejection here is a dev yellow-box and silence in prod.
  // Caught and logged, not surfaced to the user: this runs on every
  // background resync with no gesture to attach an alert to, matching how
  // permission denial is handled everywhere else in this family (surfaced
  // once, at the toggle gesture, not from a background resync).
  useEffect(() => {
    if (!result || !computedAt) return;
    void syncEatNudge(result.nudge, computedAt).catch((e) => {
      console.error("EatNextHomeCard nudge resync:", e);
    });
  }, [result, computedAt]);

  if (loading && !result) {
    // In-card loading is a bare brand `ActivityIndicator`, not `LoadingState`
    // — that primitive is full-bleed (`flex: 1` + opaque `bg`) and hardcodes a
    // "Loading..." label, neither of which belongs inside a `Card`.
    return (
      <Card variant="panel" style={styles.cardSpacing}>
        <ActivityIndicator color={colors.brand} />
      </Card>
    );
  }
  if (error && !result) {
    return (
      <Card variant="panel" style={styles.cardSpacing} onPress={refetch}>
        <Text style={styles.mutedText}>Couldn&apos;t load a suggestion — tap to retry.</Text>
      </Card>
    );
  }
  // Unreachable given the hook's contract (Task 5's `setError(null)`
  // relocation made `{loading: false, result: null, error: null}`
  // structurally impossible past the first resolution — see the Task 8
  // amendment, Verification 5). Kept because TS can't see across
  // `useState`/`setState` call sites to know that, so `result` doesn't
  // narrow to non-null below without this — same reasoning as the
  // "defensive, currently unreachable" guards in `computeNudge`.
  if (!result) return null;

  const top = result.recommendations[0];
  const emergency = result.context === "emergency";

  if (!top) {
    // Contextual empty: goal_hit / after_window / empty library message.
    const isEmptyLibrary = result.message === EMPTY_LIBRARY_MESSAGE;
    return (
      <Card
        variant="panel"
        style={styles.cardSpacing}
        onPress={() => router.push("/(tabs)/track/meals")}
      >
        <View style={styles.headerRow}>
          <UtensilsCrossed size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
          <Text style={[styles.mutedText, styles.emptyMessageText]}>
            {result.message ?? "Nothing to suggest right now."}
          </Text>
        </View>
        {isEmptyLibrary && (
          <Text style={styles.ctaText}>Build your Meal Library in Track → Meals</Text>
        )}
      </Card>
    );
  }

  // For `emergency`, `message` ("~N cal to go before day's end") and
  // `reasons[0]` ("~N cal to go — N cal, N min prep") share the same leading
  // clause — rendering both reads as a literal repeat of "~N cal to go" on
  // screen. Every other context's message is complementary, not a prefix
  // match of reasons[0] (see the Task 8 amendment for the full text
  // comparison), so only this one is suppressed.
  // `!!` (not just `&&`): `result.message` is `string | null`, and RN throws
  // ("Text strings must be rendered within a <Text> component") if a falsy
  // *string* (e.g. `""`) ends up as a bare child of a JSX `&&`. Unreachable
  // today — every message the engine produces is `null` or a non-empty
  // literal — but this name reads as a boolean and its type should be one.
  const showMessage = !!result.message && !emergency;
  // `null` when the engine knows nothing about this meal's stock (no map, no
  // entry, or an item-less meal) — render nothing rather than guess. Read off
  // the TYPED field; `top.reasons` is a flat array whose stock entry has no
  // fixed index, which is precisely why this card used to show none of it.
  const stockBadge = eatNextStockBadge(top.stock);
  // Spec §10: "Eat Next … names an expiring ingredient". `null` whenever this
  // meal has no expiring ingredient (the common case) — and note it is
  // deliberately independent of the badge above: a rescue is worth naming
  // whether or not the meal is assemblable, because the user already owns the
  // item that is about to spoil (Task 8's DECISION, Task 9 FIX 3).
  const expiringLine = eatNextExpiringLine(top.stock);

  return (
    <Card
      variant="panel"
      style={[styles.cardSpacing, emergency && styles.cardEmergency]}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/track/meals",
          params: { suggestMealId: top.mealId },
        })
      }
    >
      <View style={styles.headerRow}>
        <UtensilsCrossed
          size={icons.md}
          color={emergency ? colors.danger : colors.brand}
          strokeWidth={icons.strokeWidth}
        />
        <Text style={[styles.title, emergency && styles.titleEmergency]} numberOfLines={1}>
          {top.name}
        </Text>
        {stockBadge && (
          <Badge label={stockBadge.label} tone={stockBadge.tone} />
        )}
      </View>
      <Text style={styles.reason} numberOfLines={2}>
        {top.reasons[0]}
      </Text>
      {expiringLine && (
        <Text style={styles.expiringText} numberOfLines={2}>
          {expiringLine}
        </Text>
      )}
      <View style={styles.statsRow}>
        <Text style={styles.statsText} numberOfLines={1}>
          {top.calories} cal · {top.protein}g protein · {top.prepMinutes} min
        </Text>
        <Badge label={String(top.score)} tone={scoreTone(top.score)} />
      </View>
      {showMessage && <Text style={styles.mutedText}>{result.message}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  // `Card variant="panel"` owns surface/radius/padding/border; only the
  // placement the old bespoke `card` style also carried lives here.
  cardSpacing: { marginBottom: spacing.sm },
  cardEmergency: { borderColor: tint(colors.danger, 0.3) },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { ...typography.rowTitle, color: colors.text, flexShrink: 1 },
  titleEmergency: { color: colors.danger },
  reason: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm },
  mutedText: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  ctaText: { ...typography.body, color: colors.brand, marginTop: spacing.sm },
  // `flex: 1` (not `numberOfLines`): sits in a `flexDirection: "row"` beside
  // a fixed-width icon with nothing else to stop it pushing the row wider
  // than the card. The longest engine message is 45 chars, so this is
  // headroom for a future longer one more than a fix for today's strings.
  emptyMessageText: { flex: 1 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  statsText: { ...typography.body, color: colors.textMuted, flexShrink: 1 },
  // The score chip and the stock badge are both `Badge` now. The DECISIONS
  // still live where they always did — the band in `scoreBand`/`scoreTone`,
  // the badge's copy and its green/amber split in `eatNextStockBadge` — but
  // the presentation no longer has a local copy to drift from.
  //
  // The expiring-rescue line. Amber-on-nothing rather than a filled `Badge`:
  // it is a full sentence, not a two-word verdict, and it is the same
  // treatment `MealDetail` gives the identical string (`lib.smallMuted` +
  // `lib.warnText`, i.e. caption text in `colors.warning` with no fill).
  // `numberOfLines` is 2, not 1 — an item name plus the clause can exceed one
  // line at large Dynamic Type sizes, and truncating an ingredient name to
  // "Uses Chicken Th…" defeats the point of naming it.
  expiringText: { ...typography.caption, color: colors.warning, marginTop: spacing.xs },
});
