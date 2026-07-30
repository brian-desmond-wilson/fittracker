// Promotes Phase 1's ramp "advance" suggestion to Home (spec §7.3). Renders
// nothing unless the assessment says advance AND a next level exists — the
// top-of-ramp case stays a Preferences-only banner. Never writes; tapping
// deep-links to the Nutrition Preferences modal where RampCard confirms.
import React, { useCallback, useState } from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { TrendingUp } from "lucide-react-native";
import {
  fetchNutritionPreferences,
  fetchRecentWeighIns,
} from "@/src/lib/supabase/nutritionPreferences";
import { assessRampProgress } from "@/src/lib/rampProgress";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";

// Must match NutritionPreferencesScreen.tsx's own TREND_WINDOW_DAYS — both
// feed the same assessRampProgress() call, and a mismatch here would let
// this banner and the Preferences screen disagree about whether an advance
// is due (spec §7.3). Verified equal (both 42) as of Task 9; if you change
// one, change both.
const TREND_WINDOW_DAYS = 42;

interface RampHomeBannerProps {
  refreshKey?: number;
}

// `number`/`name` are kept as one object (rather than two separate `useState`
// calls) so "actionable" is a single fact — there's no way for a number to be
// set while the name lags behind or vice versa, and the render guard below
// only has one thing to check.
interface NextLevel {
  number: number;
  name: string;
}

export function RampHomeBanner({ refreshKey }: RampHomeBannerProps) {
  const [nextLevel, setNextLevel] = useState<NextLevel | null>(null);

  const load = useCallback(async () => {
    try {
      const since = new Date();
      since.setDate(since.getDate() - TREND_WINDOW_DAYS);
      const [prefs, weighIns] = await Promise.all([
        fetchNutritionPreferences(),
        fetchRecentWeighIns(getLocalDateString(since)),
      ]);
      const active = prefs.rampLevels.find((l) => l.is_active) ?? null;
      const next = active
        ? prefs.rampLevels.find((l) => l.level === active.level + 1) ?? null
        : null;
      const assessment = assessRampProgress({
        weighIns,
        levelStartedAt: active?.started_at ?? null,
        today: getLocalDateString(),
      });
      if (assessment.recommendation === "advance" && next) {
        setNextLevel({ number: next.level, name: next.name });
      } else {
        setNextLevel(null);
      }
    } catch (error) {
      // A Home banner is decoration — fail silent, never alert from here.
      console.error("RampHomeBanner load:", error);
      setNextLevel(null);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, refreshKey]),
  );

  if (nextLevel === null) return null;

  return (
    <TouchableOpacity
      style={styles.banner}
      activeOpacity={0.8}
      onPress={() =>
        router.push({ pathname: "/(tabs)/profile", params: { modal: "nutrition" } })
      }
    >
      <TrendingUp size={18} color="#22C55E" strokeWidth={2} />
      <Text style={styles.text}>
        Ready for Level {nextLevel.number} — {nextLevel.name}. Tap to review.
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(34,197,94,0.12)",
    borderColor: "rgba(34,197,94,0.4)",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  text: { fontSize: 14, fontWeight: "600", color: "#22C55E", flexShrink: 1 },
});
