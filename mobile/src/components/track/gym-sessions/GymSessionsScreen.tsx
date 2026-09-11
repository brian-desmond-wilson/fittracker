// Track > Gym Sessions: what you actually did.
//
// The counterpart to Training > Workouts, which holds templates. Nothing here
// is a plan — every row is a session that happened, whatever it came from.
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, RefreshControl, ScrollView, StatusBar, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { fetchGymSessions, fetchSetFacts, fetchWeightSeries } from "@/src/lib/supabase/gymSessions";
import type { WeightPoint } from "@/src/lib/supabase/gymSessions";
import { fetchRestDates } from "@/src/lib/supabase/daily";
import { fetchGoalHistory, saveWeeklyGoal } from "@/src/lib/supabase/weeklyGoals";
import {
  balance, currentStreak, GROUP_LABELS, sessionsOn, weekSummary,
} from "@/src/lib/gymSessions";
import { goalForWeek } from "@/src/lib/goalHistory";
import { goalProgress } from "@/src/lib/goalProgress";
import { computeRecords, recordsBySession } from "@/src/lib/personalRecords";
import { periodRange } from "@/src/lib/statsPeriod";
import { GROUP_COLORS } from "./groupColors";
import { SessionRow } from "./SessionRow";
import { HistoryCalendar } from "./HistoryCalendar";
import { WeekStrip } from "./WeekStrip";
import { HeroHeader } from "./HeroHeader";
import { StatsTab } from "./StatsTab";
import { GoalEditorSheet } from "./GoalEditorSheet";
import { calendarWeekSessions, weekRail, weeksInARow } from "@/src/lib/sessionPresentation";
import type { HistorySession } from "@/src/types/gymSessions";
import type { WeeklyGoal, WeeklyGoalDraft } from "@/src/types/goals";
import type { SetFact } from "@/src/types/records";

const BALANCE_DAYS = 14;

interface GymSessionsScreenProps {
  onClose: () => void;
  /** Scope the History list to sessions with a working set of this exercise. */
  exerciseId?: string | null;
  exerciseName?: string | null;
}

export function GymSessionsScreen({ onClose, exerciseId = null, exerciseName = null }: GymSessionsScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [restDates, setRestDates] = useState<Set<string>>(new Set());
  const [weightSeries, setWeightSeries] = useState<WeightPoint[]>([]);
  const [goals, setGoals] = useState<WeeklyGoal[]>([]);
  const [setFacts, setSetFacts] = useState<SetFact[]>([]);
  const [goalSheetOpen, setGoalSheetOpen] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"history" | "stats" | "calendar">("history");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calView, setCalView] = useState<"month" | "week">("month");
  // The scope is a chip the reader can drop; the hero, stats and calendar
  // keep describing every session — only the list narrows.
  const [scoped, setScoped] = useState(true);
  const listSessions = useMemo(
    () => (exerciseId && scoped
      ? sessions.filter((s) => s.exercises.some(
          (e) => e.exerciseId === exerciseId && e.sets.some((set) => !set.isWarmup),
        ))
      : sessions),
    [sessions, exerciseId, scoped],
  );

  // One clock sample per load, the app's no-two-clocks rule.
  const [today] = useState(() => getLocalDateString());
  const scrollRef = useRef<ScrollView>(null);
  const userIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    userIdRef.current = user.id;
    const [gymSessions, rested, weights, goalHistory, facts] = await Promise.all([
      fetchGymSessions(user.id),
      fetchRestDates(user.id),
      fetchWeightSeries(user.id, `${Number(today.slice(0, 4)) - 1}-01-01`),
      fetchGoalHistory(user.id),
      fetchSetFacts(user.id),
    ]);
    setSessions(gymSessions);
    setRestDates(rested);
    setWeightSeries(weights);
    setGoals(goalHistory);
    setSetFacts(facts);
    setLoading(false);
  }, [today]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const currentGoal = useMemo(() => goalForWeek(goals, today), [goals, today]);
  const records = useMemo(() => computeRecords(setFacts), [setFacts]);
  const prCounts = useMemo(() => recordsBySession(records), [records]);
  // computeRecords returns oldest-first (so "previous best" math reads
  // naturally); the section wants newest-first without disturbing prCounts,
  // which keys off `records` as computed.
  const recentRecords = useMemo(() => [...records].reverse(), [records]);
  const weekSessions = useMemo(() => {
    const r = periodRange("week", today);
    return sessions.filter((s) => s.date >= r.start && s.date <= r.end);
  }, [sessions, today]);
  const progress = useMemo(
    () => goalProgress(weekSessions, currentGoal),
    [weekSessions, currentGoal],
  );

  const week = useMemo(() => weekSummary(sessions, today), [sessions, today]);
  const streak = useMemo(
    () => currentStreak(sessions, today, restDates),
    [sessions, today, restDates],
  );
  const weekStreak = useMemo(
    () => weeksInARow(sessions, today, goals),
    [sessions, today, goals],
  );
  const bars = useMemo(
    () => balance(sessions, BALANCE_DAYS, today),
    [sessions, today],
  );
  const rail = useMemo(
    () => weekRail(sessions, restDates, today),
    [sessions, restDates, today],
  );
  const daySessions = useMemo(
    () => (selectedDate ? sessionsOn(sessions, selectedDate) : []),
    [sessions, selectedDate],
  );
  const weekGoalDone = useMemo(
    () => calendarWeekSessions(sessions, today),
    [sessions, today],
  );

  const open = (session: HistorySession) =>
    router.push(`/(tabs)/track/gym-sessions/${session.id}` as never);

  const saveGoal = async (draft: WeeklyGoalDraft) => {
    const userId = userIdRef.current;
    if (!userId) return;
    setSavingGoal(true);
    try {
      const ok = await saveWeeklyGoal(userId, periodRange("week", today).start, draft);
      if (!ok) {
        Alert.alert("Couldn't save", "Your goal didn't save. Check your connection and try again.");
        return;
      }
      await load();
      setGoalSheetOpen(false);
    } finally {
      setSavingGoal(false);
    }
  };

  const seeAllRecords = () => router.push("/(tabs)/track/gym-sessions/records" as never);

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.back} activeOpacity={0.7}>
            <ChevronLeft size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.title}>Gym Sessions</Text>
        </View>

        {collapsed && !loading && sessions.length > 0 && (
          <View style={styles.pinnedHero}>
            <HeroHeader
              goalDone={weekGoalDone}
              goalTarget={currentGoal.sessionsTarget}
              streakDays={streak}
              weeksInARow={weekStreak}
              rail={rail}
              week={week}
              collapsed
              onExpand={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
            />
          </View>
        )}

        <RefreshIndicator visible={refreshing} />
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          scrollEventThrottle={32}
          onScroll={(e) => {
            const y = e.nativeEvent.contentOffset.y;
            setCollapsed((c) => (c ? y > 90 : y > 130));
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : sessions.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>No workouts logged yet</Text>
              <Text style={styles.emptyText}>
                Sessions land here once you finish one. Start a workout from Training.
              </Text>
            </View>
          ) : (
            <>
              <HeroHeader
                goalDone={weekGoalDone}
                goalTarget={currentGoal.sessionsTarget}
                streakDays={streak}
                weeksInARow={weekStreak}
                rail={rail}
                week={week}
                collapsed={false}
              />

              <View style={styles.toggle}>
                {(["history", "stats", "calendar"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.toggleTab, view === v && styles.toggleTabOn]}
                    onPress={() => setView(v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: view === v }}
                  >
                    <Text style={[styles.toggleText, view === v && styles.toggleTextOn]}>
                      {v === "history" ? "History" : v === "stats" ? "Stats" : "Calendar"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {view === "history" && exerciseId && scoped && (
                <View style={styles.scopeRow}>
                  <Text style={styles.scopeText} numberOfLines={1}>
                    Sessions with {exerciseName ?? "this exercise"} · {listSessions.length}
                  </Text>
                  <TouchableOpacity onPress={() => setScoped(false)} accessibilityRole="button"
                    accessibilityLabel="Show all sessions" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.scopeClear}>Show all</Text>
                  </TouchableOpacity>
                </View>
              )}
              {view === "history" &&
                listSessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    today={today}
                    prCount={prCounts.get(session.id) ?? 0}
                    onPress={() => open(session)}
                  />
                ))}
              {view === "history" && exerciseId && scoped && listSessions.length === 0 && (
                <Text style={styles.emptyText}>No session with a working set of this exercise yet.</Text>
              )}

              {view === "stats" && (
                <>
                  <StatsTab
                    sessions={sessions}
                    weightSeries={weightSeries}
                    today={today}
                    progress={progress}
                    onEditGoal={() => setGoalSheetOpen(true)}
                    records={recentRecords}
                    onSeeAllRecords={seeAllRecords}
                  />

                  {bars.length > 0 && (
                    <View style={styles.balanceBlock}>
                      <Text style={styles.sectionLabel}>LAST {BALANCE_DAYS} DAYS</Text>
                      <View style={styles.bar}>
                        {bars.map((b) => (
                          <View
                            key={b.group}
                            style={{
                              width: `${b.percent}%`,
                              backgroundColor: GROUP_COLORS[b.group],
                            }}
                          />
                        ))}
                      </View>
                      <View style={styles.barLegend}>
                        {bars.map((b) => (
                          <Text
                            key={b.group}
                            style={[styles.barLegendText, { color: GROUP_COLORS[b.group] }]}
                          >
                            {GROUP_LABELS[b.group]} {b.percent}%
                          </Text>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}

              {view === "calendar" && (
                <>
                  <View style={[styles.toggle, styles.calToggle]}>
                    {(["month", "week"] as const).map((v) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.toggleTab, calView === v && styles.toggleTabOn]}
                        onPress={() => {
                          setCalView(v);
                          if (
                            v === "week" &&
                            selectedDate &&
                            !rail.some((d) => d.date === selectedDate)
                          ) {
                            setSelectedDate(null);
                          }
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: calView === v }}
                      >
                        <Text style={[styles.toggleText, calView === v && styles.toggleTextOn]}>
                          {v === "month" ? "Month" : "Week"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {calView === "month" ? (
                    <HistoryCalendar
                      sessions={sessions}
                      today={today}
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      restDates={restDates}
                    />
                  ) : (
                    <WeekStrip
                      rail={rail}
                      sessions={sessions}
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      today={today}
                    />
                  )}
                  {selectedDate && (
                    <View style={styles.dayBlock}>
                      <Text style={styles.sectionLabel}>
                        {new Date(`${selectedDate}T00:00:00`)
                          .toLocaleDateString([], {
                            weekday: "long",
                            day: "numeric",
                            month: "long",
                          })
                          .toUpperCase()}
                      </Text>
                      {daySessions.map((session) => (
                        <SessionRow
                          key={session.id}
                          session={session}
                          today={today}
                          showDate={false}
                          prCount={prCounts.get(session.id) ?? 0}
                          onPress={() => open(session)}
                        />
                      ))}
                    </View>
                  )}
                </>
              )}
            </>
          )}
        </ScrollView>
        <GoalEditorSheet
          visible={goalSheetOpen}
          goal={currentGoal}
          saving={savingGoal}
          onClose={() => setGoalSheetOpen(false)}
          onSave={saveGoal}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8 },
  pinnedHero: { paddingHorizontal: 20 },
  back: { minWidth: 40, height: 40, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.foreground },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: colors.foreground },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  balanceBlock: { marginBottom: 18 },
  sectionLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 1, marginBottom: 7 },
  bar: { flexDirection: "row", height: 7, borderRadius: 4, overflow: "hidden" },
  barLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  barLegendText: { fontSize: 10 },
  toggle: {
    flexDirection: "row", gap: 4, backgroundColor: colors.muted,
    borderRadius: 9, padding: 3, marginBottom: 14,
  },
  toggleTab: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 7 },
  toggleTabOn: { backgroundColor: colors.primary },
  toggleText: { fontSize: 13, color: colors.mutedForeground, fontWeight: "600" },
  toggleTextOn: { color: "#052E16" },
  calToggle: { alignSelf: "flex-start", width: 170, marginBottom: 12 },
  dayBlock: { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
  scopeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
    paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10,
    backgroundColor: colors.muted, borderRadius: 9,
  },
  scopeText: { flex: 1, fontSize: 13, fontWeight: "600", color: colors.foreground },
  scopeClear: { fontSize: 13, fontWeight: "600", color: colors.primary },
});
