// The Body page — approved mockup E. One page, two modes over one figure:
//   Heat map — how recently each region was trained, straight off the usage
//     ledger. Vibrant = fresh, faded = neglected.
//   Mark soreness — tap a region to cycle severity; writes into TODAY'S
//     check-in, the same rows the recommender composes against.
// Ships as the 2D front/back figure; the frame is the 3D figure's future slot.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
  StatusBar,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, RefreshCw } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { daysBetween, muscleCoverage, TRAINABLE_MUSCLES } from "@/src/lib/dailyCoverage";
import { fetchUsage } from "@/src/lib/supabase/workoutTags";
import { fetchTodayCheckin, saveCheckin } from "@/src/lib/supabase/daily";
import { BodyFigure, type BodyView } from "./BodyFigure";
import type { DailyCheckin } from "@/src/types/daily";
import type { UsageRow } from "@/src/types/dailyBlocks";

/** How far back "when did I last hit this" looks. Wider than coverage's
 *  7-day decay on purpose: "quads, 24 days" is exactly the neglect story
 *  this page exists to tell. */
const LOOKBACK_DAYS = 30;

type Mode = "heat" | "soreness";

const SEVERITY_LABEL = ["", "tender", "sore", "very sore"];

/** Short display names where the canonical ones run long. Keys stay
 *  canonical everywhere — this is ink, not vocabulary. */
const SHORT_NAME: Record<string, string> = {
  "Forearms / Grip": "Forearms",
  "Neck / Traps": "Traps",
  "Hip Abductors": "Abductors",
  "Hip Adductors": "Adductors",
  "Hip Flexors": "Hip flexors",
};
const shortName = (m: string) => SHORT_NAME[m] ?? m;

export function BodyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("heat");
  const [view, setView] = useState<BodyView>("front");
  const [usage, setUsage] = useState<UsageRow[] | null>(null);
  const [checkin, setCheckin] = useState<DailyCheckin | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRegion, setSavingRegion] = useState(false);
  const today = getLocalDateString(); // one clock sample per mount

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000)
      .toISOString().slice(0, 10);
    const [rows, todayCheckin] = await Promise.all([
      fetchUsage(user.id, since),
      fetchTodayCheckin(user.id, today),
    ]);
    setUsage(rows);
    setCheckin(todayCheckin);
    setLoading(false);
  }, [today]);

  useEffect(() => { load(); }, [load]);

  // Days since each region was last trained, off the same ledger rows the
  // recommender's coverage reads. Null = not in the window at all.
  const lastDays = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of usage ?? []) {
      const days = daysBetween(row.performedDate, today);
      if (!Number.isFinite(days) || days < 0) continue;
      for (const muscle of row.muscles) {
        const prior = m.get(muscle.name);
        if (prior === undefined || days < prior) m.set(muscle.name, days);
      }
    }
    return m;
  }, [usage, today]);

  const coverage = useMemo(() => muscleCoverage(usage ?? [], today), [usage, today]);

  const soreness = checkin?.soreness ?? {};

  const heatFill = (muscle: string): string => {
    const days = lastDays.get(muscle);
    if (days === undefined) return colors.surface2;
    // Vibrancy decays over a week — today is full brand, day 7+ reads faded.
    const intensity = Math.max(0, 1 - days / 7);
    return tint(colors.brand, 0.18 + 0.72 * intensity);
  };

  const sorenessFill = (muscle: string): string => {
    const level = soreness[muscle] ?? 0;
    if (level === 0) return colors.surface2;
    if (level === 1) return tint(colors.warning, 0.4);
    if (level === 2) return tint(colors.warning, 0.85);
    return tint(colors.danger, 0.85);
  };

  // Tap-to-cycle writes through the same save the setup sheet uses, so the
  // recommender and the sheet read exactly what was marked here. A day with
  // no check-in yet gets one with the sheet's own defaults — marking
  // soreness IS checking in.
  const cycleSoreness = async (muscle: string) => {
    if (savingRegion) return;
    setSavingRegion(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingRegion(false); return; }
    const next = { ...soreness };
    const bumped = ((next[muscle] ?? 0) + 1) % 4;
    if (bumped === 0) delete next[muscle]; else next[muscle] = bumped;
    const saved = await saveCheckin({
      userId: user.id,
      date: today,
      energy: checkin?.energy ?? 7,
      minutesAvailable: checkin?.minutesAvailable ?? 60,
      soreness: next,
      overrideRecovery: checkin?.overrideRecovery ?? false,
    });
    if (saved) setCheckin(saved);
    setSavingRegion(false);
  };

  const neglected = TRAINABLE_MUSCLES
    .map((m) => ({ muscle: m, days: lastDays.get(m) ?? null }))
    .sort((a, b) => (b.days ?? Infinity) === (a.days ?? Infinity)
      ? a.muscle.localeCompare(b.muscle)
      : (b.days ?? Infinity) - (a.days ?? Infinity))
    .slice(0, 3);
  const freshest = [...lastDays.entries()]
    .filter(([m]) => (TRAINABLE_MUSCLES as readonly string[]).includes(m))
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .slice(0, 3);

  const soreList = Object.entries(soreness);

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Body</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.seg}>
            {(["heat", "soreness"] as Mode[]).map((m) => (
              <TouchableOpacity key={m}
                style={[styles.segItem, mode === m && styles.segItemOn]}
                onPress={() => setMode(m)}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === m }}>
                <Text style={[styles.segText, mode === m && styles.segTextOn]}>
                  {m === "heat" ? "Heat map" : "Mark soreness"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.brand} />
            </View>
          ) : (
            <>
              <View style={styles.figureWrap}>
                <BodyFigure
                  view={view}
                  fillFor={mode === "heat" ? heatFill : sorenessFill}
                  onPressRegion={mode === "soreness" ? cycleSoreness : undefined}
                />
              </View>

              {mode === "heat" ? (
                <View style={styles.legend}>
                  <Text style={styles.legendText}>neglected</Text>
                  <View style={styles.gradient}>
                    {[0.18, 0.36, 0.54, 0.72, 0.9].map((a) => (
                      <View key={a} style={[styles.gradStep, { backgroundColor: tint(colors.brand, a) }]} />
                    ))}
                  </View>
                  <Text style={styles.legendText}>trained recently</Text>
                </View>
              ) : (
                <Text style={styles.sorenessHint}>
                  Tap a region to cycle: tender → sore → very sore → clear.
                  Feeds today's check-in.
                </Text>
              )}

              <View style={styles.flipRow}>
                <TouchableOpacity style={styles.flipChip}
                  onPress={() => setView(view === "front" ? "back" : "front")}
                  accessibilityRole="button"
                  accessibilityLabel={`Show the ${view === "front" ? "back" : "front"} of the body`}>
                  <RefreshCw size={13} color={colors.text} />
                  <Text style={styles.flipText}>
                    {view === "front" ? "front → back" : "back → front"}
                  </Text>
                </TouchableOpacity>
                <View style={[styles.flipChip, styles.futureChip]}>
                  <Text style={styles.futureText}>drag to rotate — 3D later</Text>
                </View>
              </View>

              {mode === "heat" ? (
                <View style={styles.card}>
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>Most neglected: </Text>
                    {neglected.map(({ muscle, days }) =>
                      `${shortName(muscle).toLowerCase()} (${days === null ? "not in 30d" : `${days}d`})`,
                    ).join(", ")}
                  </Text>
                  <Text style={styles.cardLine}>
                    <Text style={styles.cardLabel}>Freshest: </Text>
                    {freshest.length === 0
                      ? "nothing trained in the last month"
                      : freshest.map(([m, d]) =>
                          `${shortName(m).toLowerCase()} (${d === 0 ? "today" : `${d}d`})`,
                        ).join(", ")}
                  </Text>
                </View>
              ) : (
                <View style={styles.card}>
                  {soreList.length === 0 ? (
                    <Text style={styles.cardLine}>Nothing marked sore today.</Text>
                  ) : (
                    soreList.map(([m, level]) => (
                      <Text key={m} style={styles.cardLine}>
                        <Text style={styles.cardLabel}>{shortName(m)}: </Text>
                        {SEVERITY_LABEL[level]}
                      </Text>
                    ))
                  )}
                </View>
              )}
            </>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  backButton: { width: 40 },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  content: { padding: spacing.lg, paddingBottom: 48 },
  seg: {
    flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 10,
    padding: 3, marginBottom: spacing.lg,
  },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 8 },
  segItemOn: { backgroundColor: colors.bg },
  segText: { fontSize: 13, color: colors.textMuted },
  segTextOn: { color: colors.text, fontWeight: "600" },
  center: { paddingVertical: 64, alignItems: "center" },
  figureWrap: { alignItems: "center" },
  legend: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, marginTop: spacing.md,
  },
  legendText: { fontSize: 11, color: colors.textMuted },
  gradient: { flexDirection: "row", borderRadius: 4, overflow: "hidden" },
  gradStep: { width: 26, height: 8 },
  sorenessHint: {
    fontSize: 12, color: colors.textMuted, textAlign: "center",
    marginTop: spacing.md, lineHeight: 17, paddingHorizontal: spacing.xl,
  },
  flipRow: {
    flexDirection: "row", justifyContent: "center", gap: spacing.sm,
    marginTop: spacing.lg,
  },
  flipChip: {
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.pill, paddingHorizontal: 12, paddingVertical: 7,
  },
  flipText: { fontSize: 12.5, color: colors.text, fontWeight: "600" },
  futureChip: { opacity: 0.6 },
  futureText: { fontSize: 12, color: colors.textFaint },
  card: {
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.panel, padding: spacing.lg, marginTop: spacing.lg, gap: 6,
  },
  cardLine: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  cardLabel: { color: colors.text, fontWeight: "600" },
});
