import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, router } from "expo-router";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchCapturedWorkouts } from "@/src/lib/supabase/capture";
import { fetchWorkoutCompletions } from "@/src/lib/supabase/workoutCompletions";
import { fetchCreators } from "@/src/lib/supabase/creators";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import { refreshCreatorFromPhone } from "@/src/lib/creatorProfile";
import { isAvatarStale, normaliseHandle } from "@/src/lib/creatorHandle";
import { applyFiltersAndSearch, activeFilterChips, countActiveFilters, removeChip, creatorCounts, mostRestrictiveAxis, clearAxis } from "@/src/lib/workoutFilters";
import { sortWorkouts } from "@/src/lib/workoutSort";
import { loadWorkoutPrefs, saveWorkoutPrefs } from "@/src/lib/workoutFilterStore";
import { EMPTY_FILTERS, DEFAULT_SORT, SORT_LABELS } from "@/src/types/workoutFilters";
import type { WorkoutFilters, WorkoutSort } from "@/src/types/workoutFilters";
import type { CompletionMap } from "@/src/lib/workoutCompletion";
import { getLocalDateString } from "@/src/lib/dates";
import { CaptureFab } from "./CaptureFab";
import { SwipeableWorkoutCard } from "./SwipeableWorkoutCard";
import { WorkoutsRail } from "./WorkoutsRail";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { SortSheet } from "./SortSheet";
import { WorkoutFiltersSheet } from "./WorkoutFiltersSheet";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

interface WorkoutsTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
  /** A URL from the iOS share sheet, passed through to the capture flow. */
  shareUrl?: string | null;
}

/** "a", "a and b", "a, b and c" — labels verbatim, because a creator handle
 *  or a band like "≤ 15 min" reads wrong in any other case. */
const listed = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export default function WorkoutsTab({ searchQuery, onCountUpdate, shareUrl }: WorkoutsTabProps) {
  const [workouts, setWorkouts] = useState<CapturedWorkoutEntry[]>([]);
  const [completions, setCompletions] = useState<CompletionMap>({});
  const [avatars, setAvatars] = useState<CreatorAvatarMap>({});
  // Handles this session has already asked the function to refresh, so
  // reopening the picker does not re-ask for one that came back empty.
  const refreshed = useRef(new Set<string>());
  const [userId, setUserId] = useState<string | null>(null);
  const [filters, setFilters] = useState<WorkoutFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<WorkoutSort>(DEFAULT_SORT);
  // Prefs are read before the first list paint so the list does not flash
  // from unfiltered to filtered (spec §7). The ref remembers WHOSE prefs are
  // loaded, so a different user signing in on a surviving tab gets their own;
  // a state guard in `load`'s deps would give the callback a new identity
  // mid-load and make the focus effect fire it twice.
  const prefsFor = useRef<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Fixed for the life of a render pass rather than read inside each card, so
  // every "Yesterday" on screen means the same day.
  const today = useMemo(() => getLocalDateString(), []);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    if (prefsFor.current !== user.id) {
      prefsFor.current = user.id;
      const prefs = await loadWorkoutPrefs(user.id);
      setFilters(prefs.filters);
      setSort(prefs.sort);
      setPrefsReady(true);
    }
    // Together: the history is decoration on the list, so making the list wait
    // for it in sequence would cost a visible beat for nothing.
    // Creators ride along: the picker is decoration on the list, and a
    // missing map just means letters.
    const [list, history, faces] = await Promise.all([
      fetchCapturedWorkouts(user.id),
      fetchWorkoutCompletions(user.id),
      fetchCreators(),
    ]);
    setWorkouts(list);
    setCompletions(history);
    setAvatars(faces);
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

  const applyFilters = useCallback((next: WorkoutFilters) => {
    setFilters(next);
    if (userId) saveWorkoutPrefs(userId, { filters: next, sort });
  }, [userId, sort]);

  const applySort = useCallback((next: WorkoutSort) => {
    setSort(next);
    if (userId) saveWorkoutPrefs(userId, { filters, sort: next });
  }, [userId, filters]);

  const filtered = useMemo(() => {
    const list = applyFiltersAndSearch(workouts, filters, completions, searchQuery);
    return sortWorkouts(list, sort, completions, today);
  }, [workouts, filters, completions, searchQuery, sort, today]);

  const chips = useMemo(() => activeFilterChips(filters), [filters]);
  const activeCount = countActiveFilters(filters);

  const creators = useMemo(() => creatorCounts(workouts), [workouts]);
  // The grid is fixed and learnable (spec §5.1); what the library cannot
  // currently produce is dimmed rather than dropped.
  const availableEquipment = useMemo(() => {
    const s = new Set<string>();
    for (const w of workouts) {
      for (const e of w.derivedEquipment) s.add(e);
      if (w.isBodyweight) s.add("Bodyweight");
    }
    return s;
  }, [workouts]);
  // The sheet's live "Show N" count: the draft, composed with the header
  // search exactly as the applied list is.
  const countFor = useCallback(
    (draft: WorkoutFilters) => applyFiltersAndSearch(workouts, draft, completions, searchQuery).length,
    [workouts, completions, searchQuery],
  );

  // Opening the Creator page is the moment to catch a long-idle creator
  // whose avatar no capture has refreshed, or one Instagram walled off
  // yesterday. Fire-and-forget, once per handle per session; the function
  // itself skips anything fresh. The Instagram page reads happen on this
  // phone (creatorProfile.ts), so they run together, not one by one.
  const refreshStaleCreators = useCallback(() => {
    const due = workouts
      .filter((w) => w.source?.posterHandle && (w.source.platform === "instagram" || w.source.platform === "tiktok"))
      .map((w) => ({ platform: w.source!.platform as "instagram" | "tiktok", handle: normaliseHandle(w.source!.posterHandle!) }))
      .filter(({ handle }) => {
        if (!handle || refreshed.current.has(handle)) return false;
        const known = avatars[handle];
        return isAvatarStale(known?.fetchedAt ?? null, (known?.avatarUrl ?? null) !== null);
      });
    const unique = [...new Map(due.map((d) => [d.handle, d])).values()];
    if (unique.length === 0) return;
    unique.forEach((d) => refreshed.current.add(d.handle));
    Promise.all(unique.map((d) => refreshCreatorFromPhone(d.platform, d.handle))).then((rows) => {
      const fresh = rows.filter((r): r is NonNullable<typeof r> => r !== null);
      if (fresh.length === 0) return;
      setAvatars((prev) => {
        const next = { ...prev };
        for (const r of fresh) next[r.handle] = r;
        return next;
      });
    });
  }, [workouts, avatars]);

  // Only when the list is empty because of us, not because the library is.
  const rescue = useMemo(
    () => (workouts.length > 0 && filtered.length === 0 && activeCount > 0
      ? mostRestrictiveAxis(workouts, filters, completions, searchQuery)
      : null),
    [workouts, filtered.length, activeCount, filters, completions, searchQuery],
  );

  // The loading spinner sits inside the container, not in place of it, so the
  // capture button never blinks out from under your thumb.
  return (
    <GestureHandlerRootView style={styles.container}>
      {/* The rail waits with the list: a sort or filter tapped before the
          remembered ones arrive would be overwritten by them, and a count
          line over an empty library reads "0 of 0" until the rows land. */}
      {prefsReady && !loading && (
      <WorkoutsRail
        sortLabel={SORT_LABELS[sort]}
        onOpenSort={() => setSortOpen(true)}
        // Chips, not raw values: a collapsed muscle group is one thing to the
        // eye, so the badge counts what the row beneath shows.
        activeCount={chips.length}
        onOpenFilters={() => setFiltersOpen(true)}
        chips={chips}
        onRemoveChip={(chip) => applyFilters(removeChip(filters, chip))}
        onClearAll={() => applyFilters(EMPTY_FILTERS)}
        shown={filtered.length}
        total={workouts.length}
      />
      )}

      {loading || !prefsReady ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
      // The wrapper is what the indicator floats against, so a pull draws it
      // over the list and not over the rail. iOS never draws RefreshControl's
      // own spinner, so this is the only sign a refresh is happening.
      <View style={styles.listWrap}>
      <RefreshIndicator visible={refreshing} />
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
            {workouts.length === 0 ? (
              <>
                <Text style={styles.emptyTitle}>No workouts captured yet</Text>
                <Text style={styles.emptyText}>
                  When a post lays out a full session — movements with reps and rounds — it lands here, kept the way the creator wrote it.
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.emptyTitle}>Nothing matches</Text>
                <Text style={styles.emptyText}>
                  {activeCount > 0
                    ? `No workout matches all of ${listed([
                        ...chips.map((c) => c.label),
                        ...(searchQuery.trim() ? [`“${searchQuery.trim()}”`] : []),
                      ])}.`
                    : "Change the search."}
                </Text>
                {rescue && (
                  <TouchableOpacity style={styles.rescue} onPress={() => applyFilters(clearAxis(filters, rescue.axis))}
                    accessibilityRole="button">
                    <Text style={styles.rescueText}>
                      Drop “{rescue.label}” · {rescue.count} {rescue.count === 1 ? "workout" : "workouts"}
                    </Text>
                  </TouchableOpacity>
                )}
                {activeCount > 0 && (
                  <TouchableOpacity style={styles.rescueGhost} onPress={() => applyFilters(EMPTY_FILTERS)}
                    accessibilityRole="button">
                    <Text style={styles.rescueGhostText}>Clear all filters</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        }
      />
      </View>
      )}

      <SortSheet visible={sortOpen} value={sort} onSelect={applySort} onClose={() => setSortOpen(false)} />

      <WorkoutFiltersSheet
        visible={filtersOpen}
        applied={filters}
        creators={creators}
        avatars={avatars}
        onCreatorsOpen={refreshStaleCreators}
        countFor={countFor}
        availableEquipment={availableEquipment}
        onApply={applyFilters}
        onClose={() => setFiltersOpen(false)}
      />

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
  listWrap: { flex: 1 },
  listContent: { padding: 16 },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  rescue: {
    marginTop: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 8, alignSelf: "stretch",
    backgroundColor: colors.primary, alignItems: "center", justifyContent: "center",
  },
  rescueText: { fontSize: 15, fontWeight: "600", color: colors.primaryForeground, textAlign: "center" },
  rescueGhost: { marginTop: 4, height: 36, alignItems: "center", justifyContent: "center" },
  rescueGhostText: { fontSize: 14, color: colors.mutedForeground },
});
