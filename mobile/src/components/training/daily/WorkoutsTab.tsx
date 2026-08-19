import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, router } from "expo-router";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchCapturedWorkouts } from "@/src/lib/supabase/capture";
import { fetchWorkoutCompletions } from "@/src/lib/supabase/workoutCompletions";
import { filterWorkouts } from "@/src/lib/workoutFilter";
import type { CompletionMap } from "@/src/lib/workoutCompletion";
import { getLocalDateString } from "@/src/lib/dates";
import { CaptureFab } from "./CaptureFab";
import { SwipeableWorkoutCard } from "./SwipeableWorkoutCard";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

interface WorkoutsTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
}

export default function WorkoutsTab({ searchQuery, onCountUpdate }: WorkoutsTabProps) {
  const [workouts, setWorkouts] = useState<CapturedWorkoutEntry[]>([]);
  const [completions, setCompletions] = useState<CompletionMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Fixed for the life of a render pass rather than read inside each card, so
  // every "Yesterday" on screen means the same day.
  const today = useMemo(() => getLocalDateString(), []);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    // Together: the history is decoration on the list, so making the list wait
    // for it in sequence would cost a visible beat for nothing.
    const [list, history] = await Promise.all([
      fetchCapturedWorkouts(user.id),
      fetchWorkoutCompletions(user.id),
    ]);
    setWorkouts(list);
    setCompletions(history);
    onCountUpdate(list.length);
    setLoading(false);
  }, [onCountUpdate]);

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

  const filtered = useMemo(
    () => filterWorkouts(workouts, searchQuery),
    [workouts, searchQuery],
  );

  // The loading spinner sits inside the container, not in place of it, so the
  // capture button never blinks out from under your thumb.
  return (
    <GestureHandlerRootView style={styles.container}>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
      <FlatList
        data={filtered}
        keyExtractor={(w) => w.workoutId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
        renderItem={({ item }) => (
          <SwipeableWorkoutCard
            workout={item}
            completion={completions[item.workoutId] ?? null}
            today={today}
            onPress={() =>
              router.push(`/(tabs)/training/captured-workout/${item.workoutId}`)
            }
            onDeleted={load}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {workouts.length === 0 ? "No workouts captured yet" : "No matches"}
            </Text>
            <Text style={styles.emptyText}>
              {workouts.length === 0
                ? "When a post lays out a full session — movements with reps and rounds — it lands here, kept the way the creator wrote it."
                : "Change the search."}
            </Text>
          </View>
        }
      />
      )}

      <CaptureFab onSaved={load} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: "center", alignItems: "center",
  },
  listContent: { padding: 16 },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
