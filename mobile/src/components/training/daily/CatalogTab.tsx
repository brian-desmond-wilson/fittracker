// mobile/src/components/training/daily/CatalogTab.tsx
// The captured Exercises tab: the Workouts rail-and-sheet over the exercise
// catalog. Spec: docs/superpowers/specs/2026-09-10-exercises-tab-filters-design.md
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { AlertCircle, ChevronRight } from "lucide-react-native";
import { colors } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { fetchCatalog } from "@/src/lib/supabase/capture";
import { fetchPendingReviewCount } from "@/src/lib/supabase/matchReviews";
import { fetchCreators } from "@/src/lib/supabase/creators";
import type { CreatorAvatarMap } from "@/src/lib/supabase/creators";
import {
  applyExerciseFiltersAndSearch, activeExerciseFilterChips, countActiveExerciseFilters,
  removeExerciseChip, clearExerciseAxis, mostRestrictiveExerciseAxis,
  exerciseCreatorCounts, catalogEquipmentNames, catalogGoalTypes,
} from "@/src/lib/exerciseFilters";
import { sortExercises } from "@/src/lib/exerciseSort";
import { loadExercisePrefs, saveExercisePrefs } from "@/src/lib/exerciseFilterStore";
import {
  EMPTY_EXERCISE_FILTERS, DEFAULT_EXERCISE_SORT, EXERCISE_SORT_LABELS, EXERCISE_SORT_GROUPS,
} from "@/src/types/exerciseFilters";
import type { ExerciseFilters, ExerciseSort } from "@/src/types/exerciseFilters";
import { CaptureFab } from "./CaptureFab";
import { MatchReviewSheet } from "./MatchReviewSheet";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { SwipeableCatalogCard } from "./SwipeableCatalogCard";
import { FilterRail } from "./FilterRail";
import { SortSheet } from "./SortSheet";
import { ExerciseFiltersSheet } from "./ExerciseFiltersSheet";
import type { CatalogEntry } from "@/src/types/capture";

interface CatalogTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
}

/** "a", "a and b", "a, b and c" — labels verbatim. */
const listed = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export default function CatalogTab({ searchQuery, onCountUpdate }: CatalogTabProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [avatars, setAvatars] = useState<CreatorAvatarMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<ExerciseFilters>(EMPTY_EXERCISE_FILTERS);
  const [sort, setSort] = useState<ExerciseSort>(DEFAULT_EXERCISE_SORT);
  // Prefs are read before the first list paint so the list does not flash
  // from unfiltered to filtered (spec §7). The ref remembers WHOSE prefs are
  // loaded, so a different user signing in on a surviving tab gets their own.
  const prefsFor = useRef<string | null>(null);
  const [prefsReady, setPrefsReady] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  // The match-review queue's entry point: captures park unmatched names in
  // exercise_match_reviews, and this banner is where they get resolved.
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingReviews, setPendingReviews] = useState(0);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    if (prefsFor.current !== user.id) {
      prefsFor.current = user.id;
      const prefs = await loadExercisePrefs(user.id);
      setFilters(prefs.filters);
      setSort(prefs.sort);
      setPrefsReady(true);
    }
    // Creators ride along: the picker is decoration on the list, and a
    // missing map just means letters.
    const [list, pending, faces] = await Promise.all([
      fetchCatalog(user.id),
      fetchPendingReviewCount(user.id),
      fetchCreators(),
    ]);
    setEntries(list);
    setPendingReviews(pending);
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

  const applyFilters = useCallback((next: ExerciseFilters) => {
    setFilters(next);
    if (userId) saveExercisePrefs(userId, { filters: next, sort });
  }, [userId, sort]);

  const applySort = useCallback((next: ExerciseSort) => {
    setSort(next);
    if (userId) saveExercisePrefs(userId, { filters, sort: next });
  }, [userId, filters]);

  const filtered = useMemo(
    () => sortExercises(applyExerciseFiltersAndSearch(entries, filters, searchQuery), sort),
    [entries, filters, searchQuery, sort],
  );

  const chips = useMemo(() => activeExerciseFilterChips(filters), [filters]);
  const activeCount = countActiveExerciseFilters(filters);
  const creators = useMemo(() => exerciseCreatorCounts(entries), [entries]);
  // Tiles come from the catalog itself, so every tile is one some exercise
  // uses; the dimmed state exists for the shared grid, not for this tab.
  const equipmentTiles = useMemo(() => catalogEquipmentNames(entries), [entries]);
  const availableEquipment = useMemo(() => new Set(equipmentTiles.map((t) => t.name)), [equipmentTiles]);
  const goalTypes = useMemo(() => catalogGoalTypes(entries), [entries]);
  // The sheet's live "Show N" count: the draft, composed with the header
  // search exactly as the applied list is.
  const countFor = useCallback(
    (draft: ExerciseFilters) => applyExerciseFiltersAndSearch(entries, draft, searchQuery).length,
    [entries, searchQuery],
  );

  // Only when the list is empty because of us, not because the catalog is.
  const rescue = useMemo(
    () => (entries.length > 0 && filtered.length === 0 && activeCount > 0
      ? mostRestrictiveExerciseAxis(entries, filters, searchQuery)
      : null),
    [entries, filtered.length, activeCount, filters, searchQuery],
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* The rail waits with the list: a sort or filter tapped before the
          remembered ones arrive would be overwritten by them. */}
      {prefsReady && !loading && (
        <FilterRail
          sortLabel={EXERCISE_SORT_LABELS[sort]}
          onOpenSort={() => setSortOpen(true)}
          activeCount={chips.length}
          onOpenFilters={() => setFiltersOpen(true)}
          chips={chips}
          onRemoveChip={(chip) => applyFilters(removeExerciseChip(filters, chip))}
          onClearAll={() => applyFilters(EMPTY_EXERCISE_FILTERS)}
          shown={filtered.length}
          total={entries.length}
          noun={["exercise", "exercises"]}
        />
      )}

      {pendingReviews > 0 && !loading && (
        <TouchableOpacity
          style={styles.reviewBanner}
          onPress={() => setReviewSheetOpen(true)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${pendingReviews} captured names need review`}
        >
          <AlertCircle size={16} color={colors.brand} />
          <Text style={styles.reviewBannerText}>
            {pendingReviews === 1
              ? "1 captured name needs review"
              : `${pendingReviews} captured names need review`}
          </Text>
          <ChevronRight size={16} color={colors.textMuted} />
        </TouchableOpacity>
      )}

      {loading || !prefsReady ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
        </View>
      ) : (
        // The wrapper is what the indicator floats against, so a pull draws
        // it over the list and not over the rail. iOS never draws
        // RefreshControl's own spinner.
        <View style={styles.listWrap}>
        <RefreshIndicator visible={refreshing} />
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.exerciseId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={colors.brand} colors={[colors.brand]} />
          }
          renderItem={({ item }) => (
            <SwipeableCatalogCard
              entry={item}
              onPress={() =>
                router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
              }
              onDeleted={load}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              {entries.length === 0 ? (
                <>
                  <Text style={styles.emptyTitle}>Nothing captured yet</Text>
                  <Text style={styles.emptyText}>
                    See an exercise on Instagram or TikTok? Paste its link here with the + button.
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.emptyTitle}>Nothing matches</Text>
                  <Text style={styles.emptyText}>
                    {activeCount > 0
                      ? `No exercise matches all of ${listed([
                          ...chips.map((c) => c.label),
                          ...(searchQuery.trim() ? [`“${searchQuery.trim()}”`] : []),
                        ])}.`
                      : "Change the search."}
                  </Text>
                  {rescue && (
                    <TouchableOpacity style={styles.rescue} onPress={() => applyFilters(clearExerciseAxis(filters, rescue.axis))}
                      accessibilityRole="button">
                      <Text style={styles.rescueText}>
                        Drop “{rescue.label}” · {rescue.count} {rescue.count === 1 ? "exercise" : "exercises"}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {activeCount > 0 && (
                    <TouchableOpacity style={styles.rescueGhost} onPress={() => applyFilters(EMPTY_EXERCISE_FILTERS)}
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

      <SortSheet visible={sortOpen} value={sort} groups={EXERCISE_SORT_GROUPS} labels={EXERCISE_SORT_LABELS}
        onSelect={applySort} onClose={() => setSortOpen(false)} />

      <ExerciseFiltersSheet
        visible={filtersOpen}
        applied={filters}
        creators={creators}
        avatars={avatars}
        countFor={countFor}
        equipmentTiles={equipmentTiles}
        availableEquipment={availableEquipment}
        goalTypes={goalTypes}
        onApply={applyFilters}
        onClose={() => setFiltersOpen(false)}
      />

      <CaptureFab onSaved={load} />

      <MatchReviewSheet
        visible={reviewSheetOpen}
        userId={userId}
        onClose={() => setReviewSheetOpen(false)}
        onResolved={load}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  reviewBanner: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 10, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.surface2, borderRadius: 10,
    borderWidth: 1, borderColor: colors.border,
  },
  reviewBannerText: { flex: 1, fontSize: 14, fontWeight: "600", color: colors.text },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  // The card's own gap lives on its swipe container, so `gap` here would
  // double it.
  listWrap: { flex: 1 },
  listContent: { padding: 16 },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  rescue: {
    marginTop: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 8, alignSelf: "stretch",
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  rescueText: { fontSize: 15, fontWeight: "600", color: colors.onBrand, textAlign: "center" },
  rescueGhost: { marginTop: 4, height: 36, alignItems: "center", justifyContent: "center" },
  rescueGhostText: { fontSize: 14, color: colors.textMuted },
});
