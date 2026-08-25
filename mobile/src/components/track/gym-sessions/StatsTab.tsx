// The Stats tab: one scope selector drives the tiles and every chart.
// Arithmetic lives in statsPeriod; this file owns only arrangement.
import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import { formatMinutes, formatVolume, sessionVolume } from "@/src/lib/gymSessions";
import {
  bucketIndexFor, bucketLabels, bucketSeries, liftCandidates, periodRange, periodSummary,
  strengthSeries, summaryDelta, type StatScope,
} from "@/src/lib/statsPeriod";
import type { WeightPoint } from "@/src/lib/supabase/gymSessions";
import type { HistorySession } from "@/src/types/gymSessions";
import { PeriodBars } from "./PeriodBars";
import { TrendLine } from "./TrendLine";

const BODY_WEIGHT_COLOR = "#60A5FA";

export function StatsTab({
  sessions,
  weightSeries,
  today,
}: {
  sessions: HistorySession[];
  weightSeries: WeightPoint[];
  today: string;
}) {
  const [scope, setScope] = useState<StatScope>("week");
  const lifts = useMemo(() => liftCandidates(sessions), [sessions]);
  const [liftId, setLiftId] = useState<string | null>(null);
  const activeLift = liftId ?? lifts[0]?.exerciseId ?? null;

  const range = useMemo(() => periodRange(scope, today), [scope, today]);
  const summary = useMemo(() => periodSummary(sessions, range), [sessions, range]);
  const labels = useMemo(() => bucketLabels(scope, today), [scope, today]);
  const volumeBuckets = useMemo(
    () => bucketSeries(sessions, scope, today, (g) => g.reduce((t, s) => t + sessionVolume(s), 0)),
    [sessions, scope, today],
  );
  const frequencyBuckets = useMemo(
    () => bucketSeries(sessions, scope, today, (g) => g.length),
    [sessions, scope, today],
  );
  const strength = useMemo(
    () => (activeLift ? strengthSeries(sessions, activeLift, scope, today) : []),
    [sessions, activeLift, scope, today],
  );
  const weightBuckets = useMemo(() => {
    // last known weight per bucket, so the line is a level, not a sum
    const within = weightSeries.filter((w) => w.date >= range.start && w.date <= range.end);
    return labels.map((_, i) => {
      const dates = within.filter((w) => bucketIndexFor(w.date, scope, today) === i);
      return dates.length > 0 ? dates[dates.length - 1].weightLbs : null;
    });
  }, [weightSeries, labels, range, scope, today]);

  const tiles = [
    { label: "WORKOUTS", value: String(summary.workouts), delta: summaryDelta(summary.workouts, summary.prev.workouts, scope) },
    { label: "TIME", value: formatMinutes(summary.minutes), delta: summaryDelta(Math.round(summary.minutes / 60), Math.round(summary.prev.minutes / 60), scope) },
    { label: "VOLUME", value: formatVolume(summary.volumeLbs), delta: summaryDelta(Math.round(summary.volumeLbs / 1000), Math.round(summary.prev.volumeLbs / 1000), scope) },
    { label: "EXERCISES", value: String(summary.exercises), delta: summaryDelta(summary.exercises, summary.prev.exercises, scope) },
  ];

  return (
    <View>
      <View style={styles.seg}>
        {(["week", "month", "year"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.segTab, scope === s && styles.segTabOn]}
            onPress={() => setScope(s)}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === s }}
          >
            <Text style={[styles.segText, scope === s && styles.segTextOn]}>
              {s === "week" ? "Week" : s === "month" ? "Month" : "Year"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.tiles}>
        {tiles.map((t) => (
          <View key={t.label} style={styles.tile}>
            <Text style={styles.tileLabel}>{t.label}</Text>
            <Text style={styles.tileValue}>{t.value}</Text>
            <Text style={[styles.tileDelta, t.delta.startsWith("-") && { color: colors.mutedForeground }]}>
              {t.delta}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Volume</Text>
        <PeriodBars values={volumeBuckets} labels={labels} formatValue={formatVolume} />
      </View>

      {lifts.length > 0 && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Strength · est. 1RM</Text>
          <View style={styles.liftRow}>
            {lifts.map((l) => (
              <TouchableOpacity
                key={l.exerciseId}
                style={[styles.lift, activeLift === l.exerciseId && styles.liftOn]}
                onPress={() => setLiftId(l.exerciseId)}
                accessibilityRole="button"
                accessibilityState={{ selected: activeLift === l.exerciseId }}
              >
                <Text style={[styles.liftText, activeLift === l.exerciseId && styles.liftTextOn]} numberOfLines={1}>
                  {l.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TrendLine values={strength} labels={labels} formatValue={(v) => `${Math.round(v)} lbs`} />
        </View>
      )}

      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Sessions</Text>
        <PeriodBars values={frequencyBuckets} labels={labels} formatValue={(v) => String(v)} />
      </View>

      {weightBuckets.some((w) => w !== null) && (
        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Body weight</Text>
          <TrendLine values={weightBuckets} labels={labels} color={BODY_WEIGHT_COLOR} formatValue={(v) => `${Math.round(v)} lbs`} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  seg: {
    flexDirection: "row", gap: 4, backgroundColor: colors.muted,
    borderRadius: 9, padding: 3, marginBottom: 12, alignSelf: "flex-start", width: 220,
  },
  segTab: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 7 },
  segTabOn: { backgroundColor: colors.background },
  segText: { fontSize: 12, color: colors.mutedForeground, fontWeight: "600" },
  segTextOn: { color: colors.foreground },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  tile: {
    flexBasis: "48%", flexGrow: 1, backgroundColor: colors.muted,
    borderRadius: 10, padding: 10,
  },
  tileLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.5 },
  tileValue: { fontSize: 18, fontWeight: "700", color: colors.foreground, marginTop: 3 },
  tileDelta: { fontSize: 10, color: "#4ADE80", marginTop: 2 },
  panel: {
    backgroundColor: colors.muted, borderRadius: 12, padding: 12, marginBottom: 12,
  },
  panelTitle: { fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 },
  liftRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 },
  lift: {
    backgroundColor: colors.background, borderRadius: 99,
    paddingHorizontal: 10, paddingVertical: 4, maxWidth: 120,
  },
  liftOn: { backgroundColor: "#052E16" },
  liftText: { fontSize: 11, color: colors.mutedForeground, fontWeight: "600" },
  liftTextOn: { color: "#4ADE80" },
});
