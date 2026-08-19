// One session, in full: what you lifted, for how long, and where it came from.
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { fetchWorkoutSession } from "@/src/lib/supabase/gymSessions";
import { formatSetDuration } from "@/src/lib/setTiming";
import {
  formatMinutes, formatVolume, GROUP_LABELS, sessionEmphasis, sessionMinutes,
  sessionPace, sessionVolume,
} from "@/src/lib/gymSessions";
import { GROUP_COLORS } from "./groupColors";
import type { HistorySession } from "@/src/types/gymSessions";

const clock = (isoTime: string | null): string | null =>
  isoTime
    ? new Date(isoTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

export function SessionDetailScreen({ onClose }: { onClose: () => void }) {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [session, setSession] = useState<HistorySession | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!id) return;
      fetchWorkoutSession(id).then((s) => {
        if (!alive) return;
        setSession(s);
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }, [id]),
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} style={styles.back} activeOpacity={0.7}>
        <ChevronLeft size={24} color={colors.foreground} />
        <Text style={styles.backText}>Gym Sessions</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading || !session) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {header}
          <View style={styles.center}>
            {loading ? (
              <ActivityIndicator size="large" color={colors.primary} />
            ) : (
              <Text style={styles.emptyText}>That session is no longer here.</Text>
            )}
          </View>
        </View>
      </>
    );
  }

  const volume = sessionVolume(session);
  const minutes = sessionMinutes(session);
  const pace = sessionPace(session);
  const emphasis = sessionEmphasis(session);
  const span = [clock(session.startedAt), clock(session.endedAt)].filter(Boolean).join(" – ");
  const day = new Date(`${session.date}T00:00:00`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>{session.name}</Text>
          <Text style={styles.subtitle}>
            {day}
            {span ? ` · ${span}` : ""}
            {session.sessionCount > 1
              ? ` · session ${session.sessionNumber} of ${session.sessionCount}`
              : ""}
          </Text>

          <View style={styles.tiles}>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>VOLUME</Text>
              <Text style={styles.tileValue}>{formatVolume(volume)}</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>TIME</Text>
              <Text style={styles.tileValue}>
                {minutes ? formatMinutes(minutes) : "—"}
              </Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileLabel}>PACE</Text>
              <Text style={styles.tileValue}>{pace ? `${pace}/min` : "—"}</Text>
            </View>
          </View>

          <View style={styles.emphasisRow}>
            <View style={[styles.dot, { backgroundColor: GROUP_COLORS[emphasis] }]} />
            <Text style={styles.emphasisText}>{GROUP_LABELS[emphasis]}</Text>
          </View>

          {/* The bridge back to Training: this session's template. */}
          {session.capturedWorkoutId && (
            <TouchableOpacity
              style={styles.cameFrom}
              activeOpacity={0.7}
              onPress={() =>
                router.push(
                  `/(tabs)/training/captured-workout/${session.capturedWorkoutId}` as never,
                )
              }
              accessibilityRole="button"
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.cameFromLabel}>CAME FROM</Text>
                <Text style={styles.cameFromValue}>
                  {session.name}
                  {session.capturedWorkoutHandle ? ` · ${session.capturedWorkoutHandle}` : ""}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.primary} />
            </TouchableOpacity>
          )}

          <Text style={styles.sectionLabel}>EXERCISES</Text>
          {session.exercises.map((exercise) => (
            <View key={exercise.id} style={styles.exercise}>
              <View style={styles.exerciseHead}>
                <Text style={styles.exerciseName}>{exercise.name}</Text>
                {exercise.difficulty && (
                  <Text style={styles.difficulty}>{exercise.difficulty}</Text>
                )}
              </View>
              {exercise.sets.length === 0 ? (
                <Text style={styles.setLine}>No sets logged</Text>
              ) : (
                exercise.sets.map((set) => (
                  <Text key={set.setNumber} style={styles.setLine}>
                    {[
                      `${set.reps} × ${set.weightLbs} lbs`,
                      set.isWarmup ? "warmup" : null,
                      set.durationSeconds !== null
                        ? formatSetDuration(set.durationSeconds)
                        : null,
                      clock(set.startedAt),
                      // An entered time is worth marking: it is what you
                      // remembered, not what a timer watched.
                      set.timingSource === "entered" ? "entered" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                ))
              )}
            </View>
          ))}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8 },
  back: { flexDirection: "row", alignItems: "center", height: 40, paddingHorizontal: 8 },
  backText: { fontSize: 16, color: colors.foreground },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyText: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
  title: { fontSize: 22, fontWeight: "700", color: colors.foreground },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, marginBottom: 16 },
  tiles: { flexDirection: "row", gap: 8, marginBottom: 12 },
  tile: { flex: 1, backgroundColor: colors.muted, borderRadius: 10, padding: 10 },
  tileLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.5 },
  tileValue: { fontSize: 16, fontWeight: "700", color: colors.foreground, marginTop: 3 },
  emphasisRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  emphasisText: { fontSize: 12, color: colors.mutedForeground },
  cameFrom: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, marginBottom: 20,
  },
  cameFromLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 0.5 },
  cameFromValue: { fontSize: 13, color: colors.primary, marginTop: 3 },
  sectionLabel: { fontSize: 10, color: colors.mutedForeground, letterSpacing: 1, marginBottom: 10 },
  exercise: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  exerciseName: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.foreground },
  difficulty: { fontSize: 11, color: "#F59E0B" },
  setLine: { fontSize: 12, color: colors.mutedForeground, marginTop: 5 },
});
