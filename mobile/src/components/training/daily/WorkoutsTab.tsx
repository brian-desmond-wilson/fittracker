import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl,
  TouchableOpacity,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, router } from "expo-router";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchCapturedWorkouts } from "@/src/lib/supabase/capture";
import { fetchWorkoutCompletions } from "@/src/lib/supabase/workoutCompletions";
import { filterWorkouts } from "@/src/lib/workoutFilter";
import { filterNeverDone, sortByStaleness } from "@/src/lib/workoutCompletion";
import type { CompletionMap } from "@/src/lib/workoutCompletion";
import { getLocalDateString } from "@/src/lib/dates";
import { CaptureFab } from "./CaptureFab";
import { SwipeableWorkoutCard } from "./SwipeableWorkoutCard";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

interface WorkoutsTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
  /** A URL from the iOS share sheet, passed through to the capture flow. */
  shareUrl?: string | null;
}

/** How the list is ordered. "captured" is what the tab has always done and
 *  stays the default — a sort that silently reordered the list on upgrade
 *  would look like data loss. */
type SortMode = "captured" | "stale";

const workoutId = (w: CapturedWorkoutEntry) => w.workoutId;

export default function WorkoutsTab({ searchQuery, onCountUpdate, shareUrl }: WorkoutsTabProps) {
  const [workouts, setWorkouts] = useState<CapturedWorkoutEntry[]>([]);
  const [completions, setCompletions] = useState<CompletionMap>({});
  const [sort, setSort] = useState<SortMode>("captured");
  const [neverDoneOnly, setNeverDoneOnly] = useState(false);
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

  // Search first, then the never-done cut, then the order: filtering after
  // sorting would do the same work and throw most of it away.
  const filtered = useMemo(() => {
    let list = filterWorkouts(workouts, searchQuery);
    if (neverDoneOnly) list = filterNeverDone(list, workoutId, completions);
    if (sort === "stale") list = sortByStaleness(list, workoutId, completions, today);
    return list;
  }, [workouts, searchQuery, neverDoneOnly, sort, completions, today]);

  const chip = (label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  // The loading spinner sits inside the container, not in place of it, so the
  // capture button never blinks out from under your thumb.
  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.rail}>
        {chip("Newest", sort === "captured", () => setSort("captured"))}
        {chip("Not done in a while", sort === "stale", () => setSort("stale"))}
        <View style={styles.railGap} />
        {chip("Never done", neverDoneOnly, () => setNeverDoneOnly((v) => !v))}
      </View>

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
              {workouts.length === 0
                ? "No workouts captured yet"
                : neverDoneOnly
                  ? "You've done them all"
                  : "No matches"}
            </Text>
            <Text style={styles.emptyText}>
              {workouts.length === 0
                ? "When a post lays out a full session — movements with reps and rounds — it lands here, kept the way the creator wrote it."
                : neverDoneOnly
                  ? "Every workout that matches has been trained at least once."
                  : "Change the search."}
            </Text>
          </View>
        }
      />
      )}

      <CaptureFab onSaved={load} initialUrl={shareUrl ?? null} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: "center", alignItems: "center",
  },
  rail: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  // Pushes the never-done filter away from the two sort chips: they are
  // different questions and a single even row reads as one set of four.
  railGap: { flex: 1 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, color: colors.mutedForeground },
  chipTextActive: { color: colors.primaryForeground, fontWeight: "600" },
  listContent: { padding: 16 },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
