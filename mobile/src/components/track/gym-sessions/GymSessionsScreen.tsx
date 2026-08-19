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
import { ChevronLeft, Flame } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { fetchGymSessions } from "@/src/lib/supabase/gymSessions";
import {
  balance, currentStreak, formatMinutes, formatVolume, GROUP_LABELS,
  sessionsOn, weekSummary,
} from "@/src/lib/gymSessions";
import { GROUP_COLORS } from "./groupColors";
import { SessionRow } from "./SessionRow";
import { HistoryCalendar } from "./HistoryCalendar";
import type { HistorySession } from "@/src/types/gymSessions";

const BALANCE_DAYS = 14;

export function GymSessionsScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [sessions, setSessions] = useState<HistorySession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // One clock sample per load, the app's no-two-clocks rule.
  const [today] = useState(() => getLocalDateString());

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }
    setSessions(await fetchGymSessions(user.id));
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
              <View style={styles.tiles}>
                <View style={styles.tile}>
                  <Text style={styles.tileLabel}>SESSIONS</Text>
                  <Text style={styles.tileValue}>{week.sessions}</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileLabel}>VOLUME</Text>
                  <Text style={styles.tileValue}>{formatVolume(week.volumeLbs)}</Text>
                </View>
                <View style={styles.tile}>
                  <Text style={styles.tileLabel}>TIME</Text>
                  <Text style={styles.tileValue}>{formatMinutes(week.minutes)}</Text>
                </View>
              </View>

              <View style={styles.weekLine}>
                <Text style={styles.weekLineText}>This week · {deltaLabel}</Text>
                {streak > 0 && (
                  <View style={styles.streak}>
                    <Flame size={11} color="#86EFAC" />
                    <Text style={styles.streakText}>
                      {streak} day{streak === 1 ? "" : "s"}
                    </Text>
                  </View>
                )}
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

              <View style={styles.toggle}>
                {(["list", "calendar"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[styles.toggleTab, view === v && styles.toggleTabOn]}
                    onPress={() => setView(v)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: view === v }}
                  >
                    <Text style={[styles.toggleText, view === v && styles.toggleTextOn]}>
                      {v === "list" ? "List" : "Calendar"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {view === "list" ? (
                sessions.map((session) => (
                  <SessionRow key={session.id} session={session} onPress={() => open(session)} />
                ))
              ) : (
                <>
                  <HistoryCalendar
                    sessions={sessions}
                    today={today}
                    selected={selectedDate}
                    onSelect={setSelectedDate}
                  />
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
  tiles: { flexDirection: "row", gap: 8, marginBottom: 10 },
  tile: { flex: 1, backgroundColor: colors.muted, borderRadius: 10, padding: 10 },
  tileLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.5 },
  tileValue: { fontSize: 18, fontWeight: "700", color: colors.foreground, marginTop: 3 },
  weekLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
  weekLineText: { fontSize: 12, color: colors.mutedForeground },
  streak: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#14532D", borderRadius: 20, paddingHorizontal: 9, paddingVertical: 3,
  },
  streakText: { fontSize: 11, color: "#86EFAC", fontWeight: "600" },
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
  dayBlock: { marginTop: 18, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 14 },
});
