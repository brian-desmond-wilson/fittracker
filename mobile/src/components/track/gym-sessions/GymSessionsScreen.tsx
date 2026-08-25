// Track > Gym Sessions: what you actually did.
//
// The counterpart to Training > Workouts, which holds templates. Nothing here
// is a plan — every row is a session that happened, whatever it came from.
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator, RefreshControl, ScrollView, StatusBar, StyleSheet, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { fetchGymSessions } from "@/src/lib/supabase/gymSessions";
import { fetchRestDates } from "@/src/lib/supabase/daily";
import {
  balance, currentStreak, GROUP_LABELS, sessionsOn, weekSummary,
} from "@/src/lib/gymSessions";
import { GROUP_COLORS } from "./groupColors";
import { SessionRow } from "./SessionRow";
import { HistoryCalendar } from "./HistoryCalendar";
import { WeekStrip } from "./WeekStrip";
import { HeroHeader } from "./HeroHeader";
import {
  DEFAULT_WEEKLY_SESSIONS_GOAL, weekRail,
} from "@/src/lib/sessionPresentation";
import type { HistorySession } from "@/src/types/gymSessions";

const BALANCE_DAYS = 14;

export function GymSessionsScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [restDates, setRestDates] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"history" | "stats" | "calendar">("history");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [calView, setCalView] = useState<"month" | "week">("month");

  // One clock sample per load, the app's no-two-clocks rule.
  const [today] = useState(() => getLocalDateString());

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    const [gymSessions, rested] = await Promise.all([
      fetchGymSessions(user.id),
      fetchRestDates(user.id),
    ]);
    setSessions(gymSessions);
    setRestDates(rested);
    setLoading(false);
  }, []);

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

  const week = useMemo(() => weekSummary(sessions, today), [sessions, today]);
  const streak = useMemo(() => currentStreak(sessions, today), [sessions, today]);
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

  const open = (session: HistorySession) =>
    router.push(`/(tabs)/track/gym-sessions/${session.id}` as never);

  const weekDelta = week.sessions - week.sessionsLastWeek;
  const deltaLabel =
    weekDelta === 0 ? "same as last" : `${weekDelta > 0 ? "+" : ""}${weekDelta} vs last`;

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

        <RefreshIndicator visible={refreshing} />
        <ScrollView
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
                goalDone={week.sessions}
                goalTarget={DEFAULT_WEEKLY_SESSIONS_GOAL}
                streakDays={streak}
                rail={rail}
                week={week}
                collapsed={collapsed}
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

              {view === "history" &&
                sessions.map((session) => (
                  <SessionRow
                    key={session.id}
                    session={session}
                    today={today}
                    onPress={() => open(session)}
                  />
                ))}

              {view === "stats" && (
                <>
                  <View style={styles.weekLine}>
                    <Text style={styles.weekLineText}>This week · {deltaLabel}</Text>
                  </View>

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

                  <Text style={styles.statsComing}>
                    Trends, records, and period stats land in Phase 2.
                  </Text>
                </>
              )}

              {view === "calendar" && (
                <>
                  <View style={[styles.toggle, styles.calToggle]}>
                    {(["month", "week"] as const).map((v) => (
                      <TouchableOpacity
                        key={v}
                        style={[styles.toggleTab, calView === v && styles.toggleTabOn]}
                        onPress={() => setCalView(v)}
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8 },
  back: { minWidth: 40, height: 40, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: 8 },
  title: { fontSize: 22, fontWeight: "700", color: colors.foreground },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { alignItems: "center", paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: colors.foreground },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  weekLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  weekLineText: { fontSize: 12, color: colors.mutedForeground },
  balanceBlock: { marginBottom: 18 },
  sectionLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 1, marginBottom: 7 },
  bar: { flexDirection: "row", height: 7, borderRadius: 4, overflow: "hidden" },
  barLegend: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 6 },
  barLegendText: { fontSize: 10 },
  statsComing: { fontSize: 12, color: colors.mutedForeground, marginTop: 16, textAlign: "center" },
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
});
