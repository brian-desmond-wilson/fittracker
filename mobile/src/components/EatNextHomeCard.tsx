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
          <Text style={styles.mutedText}>{result.message ?? "Nothing to suggest right now."}</Text>
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
  const showMessage = result.message && !emergency;

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
});
