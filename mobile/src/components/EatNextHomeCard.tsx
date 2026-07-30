// Home surface for the Eat Next recommender (spec §7.1). Full-width card,
// TodaysWorkoutCard pattern: self-fetching, refreshKey prop-driven reload
// (no remount — the same component instance re-fetches when refreshKey
// changes), loading / error+retry / contextual-empty states. Also the
// app-open resync point for the eat-nudge family.
import React, { useCallback, useEffect, useRef } from "react";
import {
  ActivityIndicator, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { UtensilsCrossed } from "lucide-react-native";
import { useEatNext } from "@/src/hooks/useEatNext";
import { syncEatNudge } from "@/src/services/eatNudgeService";
import { EMPTY_LIBRARY_MESSAGE } from "@/src/lib/eatNext";
// `scoreBand` is the ONE decision point for the chip's band (spec §6's
// thresholds); this file never re-declares the cutoff numbers locally. Only
// the function is needed — the raw `SCORE_BAND_CORE_MIN`/`SCORE_BAND_MID_MIN`
// constants themselves aren't read anywhere in this file, `scoreBand` already
// resolves them into the band this card actually branches on.
import { scoreBand, type ScoreBand } from "@/src/lib/mealScore";

interface EatNextHomeCardProps {
  refreshKey?: number;
}

export function EatNextHomeCard({ refreshKey }: EatNextHomeCardProps) {
  const { result, loading, error, refetch, computedAt } = useEatNext(refreshKey);

  // `useEatNext`'s own mount effect already issues the first load — this
  // ref skips ONLY the focus callback that fires alongside that same first
  // mount, so the card doesn't double-load on every mount. Every subsequent
  // focus (tab switch back, app foreground) still refetches normally; a
  // remount resets the ref (fresh component instance) and the hook's own
  // mount effect fires again in lockstep, so that path stays correct too.
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
    return (
      <View style={styles.card}>
        <ActivityIndicator color="#22C55E" />
      </View>
    );
  }
  if (error && !result) {
    return (
      <TouchableOpacity style={styles.card} onPress={refetch} activeOpacity={0.7}>
        <Text style={styles.mutedText}>Couldn&apos;t load a suggestion — tap to retry.</Text>
      </TouchableOpacity>
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
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => router.push("/(tabs)/track/meals")}
      >
        <View style={styles.headerRow}>
          <UtensilsCrossed size={18} color="#9CA3AF" strokeWidth={2} />
          <Text style={[styles.mutedText, styles.emptyMessageText]}>
            {result.message ?? "Nothing to suggest right now."}
          </Text>
        </View>
        {isEmptyLibrary && (
          <Text style={styles.ctaText}>Build your Meal Library in Track → Meals</Text>
        )}
      </TouchableOpacity>
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
  const band: ScoreBand = scoreBand(top.score);

  return (
    <TouchableOpacity
      style={[styles.card, emergency && styles.cardEmergency]}
      activeOpacity={0.7}
      onPress={() =>
        router.push({
          pathname: "/(tabs)/track/meals",
          params: { suggestMealId: top.mealId },
        })
      }
    >
      <View style={styles.headerRow}>
        <UtensilsCrossed size={18} color={emergency ? "#F87171" : "#22C55E"} strokeWidth={2} />
        <Text style={[styles.title, emergency && styles.titleEmergency]} numberOfLines={1}>
          {top.name}
        </Text>
      </View>
      <Text style={styles.reason} numberOfLines={2}>
        {top.reasons[0]}
      </Text>
      <View style={styles.statsRow}>
        <Text style={styles.statsText} numberOfLines={1}>
          {top.calories} cal · {top.protein}g protein · {top.prepMinutes} min
        </Text>
        <View style={[styles.scoreChip, SCORE_CHIP_STYLE_BY_BAND[band]]}>
          <Text style={styles.scoreChipText}>{top.score}</Text>
        </View>
      </View>
      {showMessage && <Text style={styles.mutedText}>{result.message}</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
    padding: 20,
    marginBottom: 8,
  },
  cardEmergency: { borderColor: "rgba(248,113,113,0.5)" },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 16, fontWeight: "700", color: "#FFFFFF", flexShrink: 1 },
  titleEmergency: { color: "#F87171" },
  reason: { fontSize: 13, color: "#D1D5DB", marginTop: 6 },
  mutedText: { fontSize: 13, color: "#9CA3AF", marginTop: 4 },
  ctaText: { fontSize: 13, color: "#22C55E", marginTop: 6 },
  // `flex: 1` (not `numberOfLines`): sits in a `flexDirection: "row"` beside
  // a fixed-width icon with nothing else to stop it pushing the row wider
  // than the card. The longest engine message is 45 chars, so this is
  // headroom for a future longer one more than a fix for today's strings.
  emptyMessageText: { flex: 1 },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
    gap: 8,
  },
  statsText: { fontSize: 13, color: "#9CA3AF", flexShrink: 1 },
  scoreChip: {
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignItems: "center",
  },
  scoreChipText: { fontSize: 12, fontWeight: "700", color: "#FFFFFF" },
  // Colors mirror `track/meals/library/styles.ts`'s `scoreChipCore/Mid/Low`
  // for visual consistency with the score chip elsewhere in the app — a
  // presentation choice, not a threshold, so it's fine for this file to hold
  // its own copy (the threshold DECISION stays solely in `scoreBand`).
  scoreChipCore: { backgroundColor: "rgba(34,197,94,0.18)" },
  scoreChipMid: { backgroundColor: "#1F2937" },
  scoreChipLow: { backgroundColor: "rgba(107,114,128,0.25)" },
});

const SCORE_CHIP_STYLE_BY_BAND: Record<ScoreBand, object> = {
  core: styles.scoreChipCore,
  mid: styles.scoreChipMid,
  low: styles.scoreChipLow,
};
