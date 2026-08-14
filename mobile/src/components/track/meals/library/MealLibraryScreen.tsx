// The Meal Library as a catalog — every meal you have ever eaten.
//
// Two postures behind one control, because the page answers two different
// questions and they want different shapes:
//
//   Available (the default)  "what can I eat right now?"  → shelves. A browse.
//                            Favourites first, then the food that needs using
//                            up, then the categories.
//   All / Archive            "what have I ever eaten?"    → rows, carrying the
//                            whole record: what's missing, what got swapped in
//                            this week, how often you eat it, where it's from.
//
// Search always lands in rows whatever the segment: results are a lookup, not
// a browse, and density is what a lookup wants.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowUpDown,
  BookOpen,
  ChevronLeft,
  Plus,
  ScanBarcode,
  Search,
  Star,
  X,
} from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Button, Card, EmptyState, IconButton, LoadingState, TabBand } from "@/src/components/ui";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import {
  buildShelves,
  filterLibrary,
  libraryCounts,
  libraryEmptyMessage,
  sortLibrary,
  SORT_LABELS,
  type LibrarySegment,
  type LibrarySort,
  type MealCard,
} from "@/src/lib/mealLibraryView";
import {
  CATEGORY_LABELS,
  CATEGORY_SECTION_ORDER,
  type MealCategory,
} from "@/src/types/meal-library";
import { promoteAdHocMeal, setMealFavorite } from "@/src/lib/supabase/mealLibrary";
import { AdHocSection } from "./AdHocSection";
import { addMealGapToShoppingList } from "@/src/lib/supabase/shopping";
import { supabase } from "@/src/lib/supabase";
import { useMealLibraryCards } from "./useMealLibraryCards";
import { MealLibraryRow } from "./MealLibraryRow";
import { MealShelfCard } from "./MealShelfCard";

/** Same 48pt bar Fuel and Food Inventory fold into. */
const SLIM_BAR_HEIGHT = 48;

const SEGMENTS: LibrarySegment[] = ["available", "all", "archive"];
const SEGMENT_LABELS: Record<LibrarySegment, string> = {
  available: "Available",
  all: "All",
  archive: "Archive",
};
const SORTS: LibrarySort[] = ["score", "most_eaten", "recent", "protein", "name"];

/** The "no category filter" tab. Not a MealCategory, so it needs its own key. */
const ALL_CATEGORIES = "__all__";

interface MealLibraryScreenProps {
  onBack: () => void;
  onOpenMeal: (card: MealCard) => void;
  onNewMeal: () => void;
  onLogMeal: (card: MealCard) => Promise<void> | void;
  /** Scanning here asks "which meals use this product?" rather than adding a
   *  food — the library's own reading of a barcode. */
  onScan: () => void;
  /** Bumped by the host after a write elsewhere (logging, editing a meal). */
  refreshKey?: number;
}

export function MealLibraryScreen({
  onBack,
  onOpenMeal,
  onNewMeal,
  onLogMeal,
  onScan,
  refreshKey,
}: MealLibraryScreenProps) {
  const insets = useSafeAreaInsets();
  const { cards, adHoc, loading, failed, reload } = useMealLibraryCards();

  const [segment, setSegment] = useState<LibrarySegment>("available");
  const [category, setCategory] = useState<MealCategory | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sort, setSort] = useState<LibrarySort>("score");
  const [sortOpen, setSortOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [busyMealId, setBusyMealId] = useState<string | null>(null);

  const searchRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (refreshKey === undefined) return;
    reload({ force: true });
  }, [refreshKey, reload]);

  // ── Collapsing header, the mechanism Fuel and Food Inventory share ───────
  const scrollY = useRef(new Animated.Value(0)).current;
  const [collapsibleHeight, setCollapsibleHeight] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const collapseDistance = Math.max(0, collapsibleHeight - SLIM_BAR_HEIGHT);
  const headerTranslate = collapseDistance > 0
    ? scrollY.interpolate({
        inputRange: [0, collapseDistance],
        outputRange: [0, -collapseDistance],
        extrapolate: "clamp",
      })
    : 0;
  const slimBarOpacity = collapseDistance > 0
    ? scrollY.interpolate({
        inputRange: [collapseDistance / 2, collapseDistance],
        outputRange: [0, 1],
        extrapolate: "clamp",
      })
    : 0;
  useEffect(() => {
    if (collapseDistance <= 0) return;
    const id = scrollY.addListener(({ value }) => {
      const next = value >= collapseDistance - 1;
      setCollapsed((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [collapseDistance, scrollY]);

  const openSearch = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setTimeout(() => searchRef.current?.focus(), 300);
  };

  // ── Derivation ──────────────────────────────────────────────────────────
  const counts = useMemo(() => libraryCounts(cards), [cards]);
  const searching = query.trim().length > 0;
  // The posture. Search forces rows even in Available: a lookup wants density.
  const showShelves = segment === "available" && !searching;

  const visible = useMemo(
    () =>
      sortLibrary(
        filterLibrary({ cards, segment, category: showShelves ? null : category, favoritesOnly, query }),
        sort,
      ),
    [cards, segment, category, favoritesOnly, query, sort, showShelves],
  );

  const shelves = useMemo(
    () => (showShelves ? buildShelves(visible, CATEGORY_SECTION_ORDER, CATEGORY_LABELS) : []),
    [showShelves, visible],
  );

  // ── Actions ─────────────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await reload({ force: true });
    setRefreshing(false);
  }, [reload]);

  const handleToggleFavorite = useCallback(
    async (card: MealCard) => {
      try {
        await setMealFavorite(card.meal.id, !card.isFavorite);
        await reload({ force: true });
      } catch (e) {
        console.error("toggle favorite:", e);
        Alert.alert("Couldn't save that", "The star didn't stick — try again.");
      }
    },
    [reload],
  );

  const handleLog = useCallback(
    async (card: MealCard) => {
      if (busyMealId) return;
      setBusyMealId(card.meal.id);
      try {
        await onLogMeal(card);
        await reload({ force: true });
      } finally {
        setBusyMealId(null);
      }
    },
    [busyMealId, onLogMeal, reload],
  );

  const handleAddMissing = useCallback(
    async (card: MealCard) => {
      if (busyMealId || card.missing.length === 0) return;
      setBusyMealId(card.meal.id);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        // Names come back from the assemblability verdict, which reports
        // display names; map them to the ids the provenance columns want.
        const byName = new Map(
          card.meal.items.map((it) => [it.savedFood.name, it.saved_food_id]),
        );
        await addMealGapToShoppingList(
          user.id,
          { id: card.meal.id, name: card.meal.name },
          card.missing.map((name) => ({ name, savedFoodId: byName.get(name) ?? null })),
        );
        Alert.alert(
          "Added to your shopping list",
          `${card.missing.join(", ")} — for ${card.meal.name}.`,
        );
      } catch (e) {
        console.error("add missing to list:", e);
        Alert.alert("Couldn't add to the list", "Nothing was added — try again.");
      } finally {
        setBusyMealId(null);
      }
    },
    [busyMealId],
  );

  const handlePromote = useCallback(
    async (
      candidate: Parameters<React.ComponentProps<typeof AdHocSection>["onPromote"]>[0],
      meta: Parameters<React.ComponentProps<typeof AdHocSection>["onPromote"]>[1],
    ) => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not signed in");
        await promoteAdHocMeal(user.id, candidate, meta);
        await reload({ force: true });
      } catch (e) {
        console.error("promote ad-hoc meal:", e);
        Alert.alert(
          "Couldn't save that as a meal",
          e instanceof Error ? e.message : "Try again.",
        );
      }
    },
    [reload],
  );

  // ── Render ──────────────────────────────────────────────────────────────
  const empty = libraryEmptyMessage({ segment, counts, query, favoritesOnly, category });

  const categoryTabs = CATEGORY_SECTION_ORDER.filter((c) => (counts.byCategory.get(c) ?? 0) > 0);

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[s.container, { paddingTop: insets.top }]}>
        <Animated.View
          onLayout={(e) => setCollapsibleHeight(e.nativeEvent.layout.height)}
          style={{ transform: [{ translateY: headerTranslate }] }}
        >
          <View style={s.header}>
            <TouchableOpacity onPress={onBack} style={s.backButton} accessibilityRole="button" accessibilityLabel="Back">
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
            <View style={s.searchBar}>
              <Search size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
              <TextInput
                ref={searchRef}
                style={s.searchInput}
                value={query}
                onChangeText={setQuery}
                placeholder="Search meals..."
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query.length > 0 ? (
                <TouchableOpacity onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel="Clear search">
                  <X size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={onScan} accessibilityRole="button" accessibilityLabel="Scan a product to find meals that use it">
                  <ScanBarcode size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                </TouchableOpacity>
              )}
            </View>
            <IconButton icon={Plus} onPress={onNewMeal} accessibilityLabel="New meal" />
          </View>

          <View style={s.titleRow}>
            <BookOpen size={icons.xl} color={colors.accents.meals} strokeWidth={icons.strokeWidth} />
            <Text style={s.pageTitle}>Meal Library</Text>
          </View>
        </Animated.View>

        <RefreshIndicator visible={refreshing} />

        <Animated.ScrollView
          ref={scrollRef}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          style={[
            s.scroll,
            { marginBottom: -collapseDistance, transform: [{ translateY: headerTranslate }] },
          ]}
          contentContainerStyle={[s.scrollContent, { paddingBottom: insets.bottom + spacing.xxl }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={["transparent"]}
            />
          }
        >
          {/* Category tabs belong to rows mode only: in shelf mode the
              shelves ARE the categories, and two controls fighting over one
              job is worse than one. A search ignores the category, so the tabs
              step aside rather than sit there looking as if they still bite. */}
          {!showShelves && !searching && categoryTabs.length > 0 && (
            <TabBand
              items={[
                {
                  key: ALL_CATEGORIES,
                  label: "All Meals",
                  count: segment === "archive" ? counts.archive : counts.all,
                },
                ...categoryTabs.map((c) => ({
                  key: c,
                  label: CATEGORY_LABELS[c],
                  count: counts.byCategory.get(c) ?? 0,
                })),
              ]}
              selectedKey={category ?? ALL_CATEGORIES}
              onSelect={(key) =>
                // Tapping the open category closes it, which lands you back on
                // All — the same place the first tab goes.
                setCategory(
                  key === ALL_CATEGORIES || key === category ? null : (key as MealCategory),
                )
              }
              countNoun="meals"
              style={s.tabsBand}
            />
          )}

          <View style={s.lane}>
            {searching ? (
              // The segment strip is gone rather than disabled: with a query in
              // the field it names three subsets none of which is what you are
              // looking at. What replaces it has to say so out loud, or the
              // pills simply vanishing reads as a bug.
              <Text style={s.scopeNote} accessibilityLiveRegion="polite">
                Searching all {counts.all + counts.archive} meals
              </Text>
            ) : (
              <View style={s.segTrack}>
                {SEGMENTS.map((seg) => {
                const active = segment === seg;
                const n = seg === "available" ? counts.available : seg === "all" ? counts.all : counts.archive;
                return (
                  <TouchableOpacity
                    key={seg}
                    style={[s.segment, active && s.segmentActive]}
                    onPress={() => {
                      setSegment(seg);
                      setCategory(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${SEGMENT_LABELS[seg]}, ${n} meals`}
                  >
                    <Text style={[s.segmentText, active && s.segmentTextActive]} numberOfLines={1}>
                      {SEGMENT_LABELS[seg]} ({n})
                    </Text>
                  </TouchableOpacity>
                );
                })}
              </View>
            )}
            {/* Favourites narrows, so it stands aside with the rest of them.
                Sort only reorders what is already on screen, and a long list of
                matches still wants ordering — so it stays. Both are rows-mode
                ideas anyway: the shelf view leads with a favourites shelf and
                has one fixed order. */}
            {!showShelves && !searching && (
              <TouchableOpacity
                style={[s.toolButton, favoritesOnly && s.toolButtonActive]}
                onPress={() => setFavoritesOnly((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ selected: favoritesOnly }}
                accessibilityLabel="Show favorites only"
              >
                <Star
                  size={icons.sm}
                  color={favoritesOnly ? colors.brand : colors.textMuted}
                  fill={favoritesOnly ? colors.brand : "transparent"}
                  strokeWidth={icons.strokeWidth}
                />
              </TouchableOpacity>
            )}
            {!showShelves && (
              <TouchableOpacity
                style={s.toolButton}
                onPress={() => setSortOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Sort meals, currently ${SORT_LABELS[sort]}`}
              >
                <ArrowUpDown size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              </TouchableOpacity>
            )}
          </View>

          {loading && cards.length === 0 ? (
            <LoadingState label="Loading your meals…" />
          ) : failed && cards.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="Couldn't load your Meal Library."
              action={{ label: "Retry", onPress: () => reload({ force: true }) }}
            />
          ) : visible.length === 0 ? (
            <View style={s.emptyWrap}>
              <EmptyState icon={BookOpen} title={empty.title} body={empty.body} />
            </View>
          ) : showShelves ? (
            shelves.map((shelf) => (
              <View key={shelf.key} style={s.shelf}>
                <View style={s.shelfHead}>
                  <Text style={[s.shelfTitle, shelf.kind === "use_it_up" && s.shelfTitleWarn]}>
                    {shelf.kind === "favorites" ? "★ " : shelf.kind === "use_it_up" ? "⏱ " : ""}
                    {shelf.title}
                  </Text>
                  <Text style={s.shelfCount}>{shelf.cards.length}</Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.hScroller}
                  contentContainerStyle={s.shelfCards}
                >
                  {shelf.cards.map((card) => (
                    <MealShelfCard
                      key={`${shelf.key}-${card.meal.id}`}
                      card={card}
                      onPress={onOpenMeal}
                      onToggleFavorite={handleToggleFavorite}
                      onLog={handleLog}
                      busyMealId={busyMealId}
                    />
                  ))}
                </ScrollView>
              </View>
            ))
          ) : (
            <View style={s.rows}>
              {visible.map((card) => (
                <MealLibraryRow
                  key={card.meal.id}
                  card={card}
                  onPress={onOpenMeal}
                  onToggleFavorite={handleToggleFavorite}
                  onLog={handleLog}
                  onAddMissing={handleAddMissing}
                  busyMealId={busyMealId}
                  markArchived={searching}
                />
              ))}
            </View>
          )}

          {/* Only under All, and only unfiltered: this is the catalog
              admitting what it is missing, which would be a non-sequitur
              under a category tab or a search. */}
          {segment === "all" && !searching && !favoritesOnly && category === null && (
            <AdHocSection candidates={adHoc} onPromote={handlePromote} />
          )}
        </Animated.ScrollView>
      </View>

      {/* Condensed bar — sibling of the container so top:0 is the true top. */}
      <Animated.View
        style={[s.slimBar, { paddingTop: insets.top, opacity: slimBarOpacity }]}
        pointerEvents={collapsed ? "auto" : "none"}
      >
        <View style={s.slimBarRow}>
          <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
          <Text style={s.slimBarTitle} numberOfLines={1}>Meal Library</Text>
          <TouchableOpacity onPress={openSearch} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="Search meals">
            <Search size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onNewMeal} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel="New meal">
            <Plus size={icons.md} color={colors.brand} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Sort sheet — the house centred-sheet recipe. */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={() => setSortOpen(false)}>
        <View style={s.backdrop}>
          <Card variant="panel" style={s.sortCard}>
            <Text style={s.sortTitle}>Sort meals</Text>
            {SORTS.map((key) => {
              const active = sort === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[s.sortOption, active && s.sortOptionActive]}
                  onPress={() => {
                    setSort(key);
                    setSortOpen(false);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Text style={[s.sortLabel, active && s.sortLabelActive]}>{SORT_LABELS[key]}</Text>
                </TouchableOpacity>
              );
            })}
            <Button variant="secondary" label="Cancel" onPress={() => setSortOpen(false)} fluid />
          </Card>
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: { padding: spacing.xs },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text }, // §4.5 has no input token
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  pageTitle: { ...typography.titleRoot, color: colors.text },

  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },

  /** See the note at the call sites: horizontal scrollers must not absorb
   *  the vertical space `flexGrow: 1` hands out. */
  hScroller: { flexGrow: 0 },
  /** The band itself is `ui/TabBand`; this only spaces it from what follows. */
  tabsBand: { marginBottom: spacing.md },

  lane: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter,
    paddingBottom: spacing.md,
  },
  // Takes the segment strip's place in the lane, so the sort button beside it
  // does not jump when a query starts or ends.
  scopeNote: { ...typography.caption, color: colors.textMuted, flex: 1 },
  segTrack: {
    flex: 1,
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: spacing.xs,
    gap: spacing.xs / 2,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    paddingHorizontal: 2,
    borderRadius: radii.control - 2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  toolButton: {
    width: 34,
    height: 34,
    borderRadius: radii.control,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  toolButtonActive: { backgroundColor: tint(colors.brand), borderColor: colors.brand },

  shelf: { marginBottom: spacing.xl },
  shelfHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter,
    marginBottom: spacing.sm,
  },
  shelfTitle: { ...typography.section },
  shelfTitleWarn: { color: colors.warning },
  shelfCount: { ...typography.caption, color: colors.textFaint, fontWeight: "600" },
  shelfCards: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.screenGutter },

  rows: { paddingHorizontal: spacing.screenGutter },
  // `EmptyState` is flex:1; the scroller's flexGrow chain reaches it through
  // this box (rule 25).
  emptyWrap: { flexGrow: 1, paddingHorizontal: spacing.screenGutter },

  slimBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  slimBarRow: {
    height: SLIM_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.screenGutter,
  },
  slimBarTitle: { ...typography.titleBar, color: colors.text, flex: 1 },

  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  sortCard: { width: "100%", gap: spacing.sm },
  sortTitle: { ...typography.titleBar, color: colors.text, marginBottom: spacing.sm },
  sortOption: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sortOptionActive: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  sortLabel: { ...typography.body, color: colors.text },
  sortLabelActive: { color: colors.brand, fontWeight: "600" },
});
