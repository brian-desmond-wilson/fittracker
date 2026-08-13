import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  PanResponder,
  Animated,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// `useLocalSearchParams`, NOT `useGlobalSearchParams`: the deep link below
// clears its param with `router.setParams({ suggestMealId: undefined })`, and
// React Navigation shallow-merges params — it cannot delete a key. Only
// `useLocalSearchParams` hides an `undefined` value again on read
// (expo-router 6.0.24, `build/hooks.js:150-160`, with the library's own
// comment saying exactly that); the global hook returns
// `useRouteInfo().params` raw. Same choice, for the same reason, as the
// `?modal=nutrition` link in `app/(tabs)/profile.tsx:67`.
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import {
  ChevronLeft,
  ChevronRight,
  Utensils,
  BookOpen,
  Calendar,
  Plus,
  Share2,
  BarChart3,
  Search,
  ScanBarcode,
  X,
} from "lucide-react-native";
import { colors, icons, spacing } from "@/src/theme/tokens";
import { Button, Card, EmptyState, IconButton } from "@/src/components/ui";
import { RefreshIndicator } from "@/src/components/ui/RefreshIndicator";
import { MealLog, MealType, SavedFood } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import {
  getProductByBarcode,
  OpenFoodFactsError,
  ProductData,
} from "@/src/services/openFoodFactsApi";
import {
  getSavedFoodByBarcode,
  createSavedFood,
  getSavedFoods,
  toggleFavorite,
} from "@/src/services/savedFoodsService";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { FoodPreviewModal } from "./FoodPreviewModal";
import { ManualFoodEntryModal } from "./meals/ManualFoodEntryModal";
import { MealsNutritionCard } from "./MealsNutritionCard";
import { sumNutrition } from "@/src/lib/mealMacros";
import { MealLogEditorModal, type MealLogEdit } from "./MealLogEditorModal";
import {
  confirmConceptRating,
  fetchMealLibrary,
  logMeal,
  undoMealLog,
  MealLoggedButDecrementFailed,
} from "@/src/lib/supabase/mealLibrary";
import { tasteAskFor } from "@/src/lib/tasteAsk";
import { markSuggestionActedOn } from "@/src/lib/supabase/eatNextLog";
import type { ConceptRating } from "@/src/types/nutrition-preferences";
import { defaultMealTypeFor } from "@/src/types/meal-library";
import { MealsInsightsCard } from "./MealsInsightsCard";
import {
  buildDailyTotalsByDate,
  computeMacroStreak,
  computeMacroBestStreak,
  computeMealsRollingStats,
  buildMealsSeries,
} from "@/src/lib/mealStats";
import { useFuelPlan } from "@/src/hooks/useFuelPlan";
import { FuelVerdictStrip } from "./meals/FuelVerdictStrip";
import { FuelRail } from "./meals/FuelRail";
import { mealTypeForMinutes, type FuelWindow } from "@/src/lib/fuelPlan";
import { MealUndoSnackbar } from "./MealUndoSnackbar";
import { QuickAdjustmentModal } from "./QuickAdjustmentModal";
import { MealsDistributionBar } from "./MealsDistributionBar";
import { MealsWeeklySummaryModal } from "./MealsWeeklySummaryModal";
import {
  findInventoryMatchByBarcode,
  consumeOneInventoryUnit,
  refundOneInventoryUnit,
  InventoryMatchSummary,
} from "@/src/services/foodInventoryMatchService";
import { Share } from "react-native";
import { SLIM_BAR_HEIGHT, styles } from "./meals/mealsScreenStyles";
import {
  getLocalDateString,
  formatViewingDate,
  getNutritionLabel,
} from "./meals/mealsHelpers";
import { useMacroGoals } from "./meals/useMacroGoals";
import { useRecentAndFavorites } from "./meals/useRecentAndFavorites";
import { useSavedFoodsSearch } from "./meals/useSavedFoodsSearch";
import { useMealSearch } from "./meals/useMealSearch";
import { useHistoricalMeals } from "./meals/useHistoricalMeals";
import { useMealAddForm } from "./meals/useMealAddForm";
import { LogMealSheet } from "./meals/LogMealSheet";
import { useEatNext } from "@/src/hooks/useEatNext";
import { syncEatNudge } from "@/src/services/eatNudgeService";

interface MealsScreenProps {
  onClose: () => void;
}

export function MealsScreen({ onClose }: MealsScreenProps) {
  const insets = useSafeAreaInsets();

  // Date navigation state
  const [viewingDate, setViewingDate] = useState(new Date());
  const [mealsCache, setMealsCache] = useState<Map<string, MealLog[]>>(new Map());
  const [loadingDay, setLoadingDay] = useState(true);

  // Swipe animation
  const translateX = useRef(new Animated.Value(0)).current;
  const SWIPE_THRESHOLD = 50;

  // Manual "Log Meal" form field state (bundled in a hook).
  const addForm = useMealAddForm();

  // Macro goals + eating-window / meal times from profile (loaded on mount).
  // Times and window bounds now live inside useFuelPlan's own profile read;
  // this screen only needs the goals.
  const { goals } = useMacroGoals();

  // Edit-meal modal
  const [editingMeal, setEditingMeal] = useState<MealLog | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  // Quick adjustment modal
  const [quickAdjustVisible, setQuickAdjustVisible] = useState(false);
  const [savingQuickAdjust, setSavingQuickAdjust] = useState(false);

  // Weekly summary modal
  const [weeklySummaryVisible, setWeeklySummaryVisible] = useState(false);

  // Undo snackbar
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [lastLogLabel, setLastLogLabel] = useState<string>("");
  const [lastLogInventoryId, setLastLogInventoryId] = useState<string | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CSV export
  const [exporting, setExporting] = useState(false);

  // Inventory match for the currently previewed food
  const [inventoryMatch, setInventoryMatch] =
    useState<InventoryMatchSummary | null>(null);

  // Tracks whether the currently-previewed food has been corrected in
  // this session — surfaces user_corrected=true when an api-source food
  // gets persisted to saved_foods at log time.
  const [previewWasEdited, setPreviewWasEdited] = useState(false);

  // Today / Insights tab. Today is the logging surface (macros + recents
  // + logged meals); Insights is reflective (charts, streaks, weekly
  // summary, quick adjustment). Defaults to Today on mount; auto-switches
  // to Today when the user starts searching or opens the add form so the
  // input/results land where they expect.
  const [activeTab, setActiveTab] = useState<"today" | "insights">("today");

  const [allSavedFoods, setAllSavedFoods] = useState<SavedFood[]>([]);

  // The library and a meal within it are pushed routes, not sheets raised over
  // this screen: one library, one back button, and the stack says where you
  // are. Everything that used to open a modal here navigates instead.
  const openLibrary = useCallback(() => router.push("/(tabs)/track/meal-library"), []);
  const openMeal = useCallback(
    (mealId: string) => router.push(`/(tabs)/track/meal-library/${mealId}`),
    [],
  );

  // Eat Next recommender (spec §7.2). Declared here rather than beside the
  // pace `useMemo`s further down because `fetchMealsForDate` below reads
  // `eatNext.refetch` — same shape as `useHistoricalMeals`'s `refreshHistory`
  // just below, which that function already calls. No `refreshKey`: the hook's
  // own mount effect is the single initial load, and every subsequent reload
  // comes from the write path in `fetchMealsForDate`. The focus reload added
  // further down goes through that same function and deliberately skips the
  // first focus, so nothing here double-loads the way Task 8's card could.
  const eatNext = useEatNext();

  // Deep link from `EatNextHomeCard` (spec §7.1: `router.push({ pathname:
  // "/(tabs)/track/fuel", params: { suggestMealId: top.mealId } })`) and the
  // target of the "Suggested now" chips below — both land on a meal's page.
  const params = useLocalSearchParams<{ suggestMealId?: string }>();
  useEffect(() => {
    if (params.suggestMealId) {
      openMeal(params.suggestMealId);
      // Consume once, so returning to this screen later doesn't re-open the
      // meal. Settles in one extra render rather than looping: the effect
      // re-fires when `params.suggestMealId` flips to `undefined`, and the
      // guard above is then false (the identical lifecycle Task 9 traced for
      // `?modal=nutrition`).
      router.setParams({ suggestMealId: undefined });
    }
  }, [params.suggestMealId, openMeal]);

  // Historical meals (last 365 days) for insights/streaks/chart. refreshHistory
  // is called on writes so insights refetch, but NOT on plain date navigation.
  const { historicalLogs, refreshHistory } = useHistoricalMeals();

  // Barcode scanner state. handlingBarcodeRef guards against the camera
  // firing onBarcodeScanned multiple times for the same scan — without it,
  // 4–5 parallel handlers race, the saved-foods path opens a preview AND
  // the API path hits rate-limits, and queued alerts make "OK" seem stuck.
  const handlingBarcodeRef = useRef(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showFoodPreview, setShowFoodPreview] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [previewFood, setPreviewFood] = useState<SavedFood | ProductData | null>(null);
  const [previewSource, setPreviewSource] = useState<"api" | "saved">("saved");
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // Recent foods & favorites (fetched on mount, refetched on writes).
  const {
    recentFoods,
    favorites,
    refetch: fetchRecentAndFavorites,
  } = useRecentAndFavorites();
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  // Bumped after every forced day refetch so the Fuel sources (library,
  // profile, windows, prep budget) reload alongside the logs they plan over.
  const [fuelRefreshKey, setFuelRefreshKey] = useState(0);
  // The sheet's own state: which slot and instant a log will land on. Set by
  // whoever opened it — the header, a missed window's ghost, a quick chip —
  // so the form never asks for what the entry point already knew.
  const [logSheetOpen, setLogSheetOpen] = useState(false);
  const [logSheetManual, setLogSheetManual] = useState(false);
  const [logSheetAt, setLogSheetAt] = useState<Date>(new Date());
  const [logSheetQuery, setLogSheetQuery] = useState("");
  const [loggingFoodId, setLoggingFoodId] = useState<string | null>(null);
  // The bottom chip row's Search chip focuses this instead of duplicating a
  // second search field.
  const searchInputRef = useRef<TextInput>(null);

  // Collapsing header, the same mechanism Food Inventory uses: the search row
  // and the title slide up under a condensed bar as you scroll, handing their
  // space to the day. Transform only, never height — `useNativeDriver` cannot
  // animate height, and a JS-driven height on a scrolling list is where jank
  // comes from. The scroller translates by the same amount and is extended
  // past the bottom edge by that distance, so it gains real estate rather
  // than dragging a gap up behind it.
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
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
  // Fades in over the back half of the travel, so the condensed bar arrives
  // just as the rows it replaces finish disappearing behind it.
  const slimBarOpacity = collapseDistance > 0
    ? scrollY.interpolate({
        inputRange: [collapseDistance / 2, collapseDistance],
        outputRange: [0, 1],
        extrapolate: "clamp",
      })
    : 0;

  // The bar must not swallow taps while it is invisible. One boolean flipped
  // at the threshold — not a per-frame state update.
  useEffect(() => {
    if (collapseDistance <= 0) return;
    const id = scrollY.addListener(({ value }) => {
      const next = value >= collapseDistance - 1;
      setCollapsed((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [collapseDistance, scrollY]);

  // Search lives in the row that scrolls away, so the condensed bar's search
  // icon brings it back rather than duplicating the field.
  const openSearch = () => {
    scrollRef.current?.scrollTo({ y: 0, animated: true });
    setTimeout(() => searchInputRef.current?.focus(), 300);
  };

  // Debounced saved-foods search results, derived from searchQuery.
  const { searchResults, searching } = useSavedFoodsSearch(searchQuery);
  const { mealResults } = useMealSearch(searchQuery);
  // The sheet searches the same two sources through its own query, so typing
  // in it never leaves results behind on the page when it closes.
  const { searchResults: sheetFoodResults, searching: sheetSearching } =
    useSavedFoodsSearch(logSheetQuery);
  const { mealResults: sheetMealResults } = useMealSearch(logSheetQuery);

  // Get the string for viewing date
  const viewingDateStr = getLocalDateString(viewingDate);
  const todayStr = getLocalDateString(new Date());

  // Date navigation helper functions
  const goToPreviousDay = () => {
    const prevDate = new Date(viewingDate);
    prevDate.setDate(prevDate.getDate() - 1);
    setViewingDate(prevDate);
  };

  const goToNextDay = () => {
    if (!canGoForward()) return;
    const nextDate = new Date(viewingDate);
    nextDate.setDate(nextDate.getDate() + 1);
    setViewingDate(nextDate);
  };

  const goToToday = () => {
    setViewingDate(new Date());
  };

  const isViewingToday = () => {
    return viewingDateStr === todayStr;
  };

  const canGoForward = () => {
    const nextDate = new Date(viewingDate);
    nextDate.setDate(nextDate.getDate() + 1);
    return getLocalDateString(nextDate) <= todayStr;
  };

  // Fetch meals for a specific date
  const fetchMealsForDate = async (date: Date, force = false) => {
    const dateStr = getLocalDateString(date);

    // Check cache first. Mutation paths pass force=true because the cache
    // delete they queue hasn't committed yet in this closure — without it the
    // guard reads the stale Map, early-returns, and the refetch is skipped.
    if (!force && mealsCache.has(dateStr)) {
      setLoadingDay(false);
      return;
    }

    try {
      setLoadingDay(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to track meals");
        return;
      }

      const { data, error } = await supabase
        .from("meal_logs")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", dateStr)
        .order("logged_at", { ascending: true });

      if (error) throw error;

      setMealsCache((prev) => new Map(prev).set(dateStr, data || []));
      // A forced fetch means the day was just written to (or pulled to
      // refresh) — refresh the insights history too. Plain navigation doesn't.
      if (force) refreshHistory();
      // Same trigger, for the Eat Next recommender (spec §7.2: "refreshed by
      // the screen's existing write-refetch path, so logging a meal
      // immediately updates or clears the suggestion"). This IS that path:
      // every write handler in this file — preview log, manual entry, add
      // form, quick adjustment, edit, delete, undo, and the Meal Library
      // modal's `onLogged` — invalidates the day cache and then calls this
      // function with `force = true`. Narrowed to the day the recommender
      // actually reads (it always computes for TODAY, whatever day is being
      // viewed), so editing a past day doesn't fire a pointless reload.
      // Not awaited, matching `refreshHistory` above: `refetch`'s declared
      // type is `() => void`, and nothing downstream of here depends on the
      // new result — the nudge resync happens in an effect keyed on
      // `eatNext.result`, because the value in THIS closure is the
      // pre-refetch one and would sync a stale decision.
      if (force && dateStr === todayStr) eatNext.refetch();
      // Same trigger for the Fuel rail's sources: a write can change stock
      // (quick-log decrements inventory), which changes picks and rescues.
      if (force) setFuelRefreshKey((k) => k + 1);
    } catch (error: any) {
      console.error("Error fetching meals:", error);
      Alert.alert("Error", "Failed to load meals");
    } finally {
      setLoadingDay(false);
    }
  };

  // Fetch when viewingDate changes
  useEffect(() => {
    fetchMealsForDate(viewingDate);
  }, [viewingDate]);

  // Fetch all saved foods once (for the Meal Library builder's food picker)
  const fetchAllSavedFoods = useCallback(async () => {
    try {
      const all = await getSavedFoods();
      setAllSavedFoods(all);
    } catch (error) {
      console.error("Error fetching saved foods:", error);
    }
  }, []);

  useEffect(() => {
    fetchAllSavedFoods();
  }, [fetchAllSavedFoods]);

  // Pull the user back to Today when they start a logging action — typing
  // in the search bar or opening the add form. Otherwise results/input
  // would land off-screen on the Insights tab.
  useEffect(() => {
    if (activeTab !== "today" && searchQuery.trim().length >= 2) {
      setActiveTab("today");
    }
  }, [activeTab, searchQuery]);

  const handleSearchResultPress = (food: SavedFood) => {
    setPreviewFood(food);
    setPreviewSource("saved");
    setScannedBarcode(food.barcode);
    setPreviewWasEdited(false);
    setShowFoodPreview(true);
    setSearchQuery("");
  };

  // Handle pull-to-refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    // Clear cache for current date to force refetch
    setMealsCache((prev) => {
      const newCache = new Map(prev);
      newCache.delete(viewingDateStr);
      return newCache;
    });
    await Promise.all([
      fetchMealsForDate(viewingDate, true),
      fetchRecentAndFavorites(),
    ]);
    setRefreshing(false);
  }, [viewingDate, viewingDateStr, fetchRecentAndFavorites]);

  // Logging a meal used to happen in a sheet this screen owned, which told it
  // to re-read afterwards. The meal is a pushed route now, so nobody is left to
  // tell it: what it missed while it was off-stack is whatever came back
  // changed. Held in a ref because `fetchMealsForDate` is re-made every render
  // — as a dependency it would re-run this on every render instead of on every
  // focus. The first focus is skipped: the mount fetches already ran, and
  // repeating them here is the double-load the Eat Next hook was written to
  // avoid.
  const refreshAfterReturn = useRef<() => void>(() => {});
  refreshAfterReturn.current = () => {
    setMealsCache((prev) => {
      const next = new Map(prev);
      next.delete(viewingDateStr);
      return next;
    });
    void fetchMealsForDate(viewingDate, true);
    void fetchRecentAndFavorites();
  };
  const focusedBefore = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focusedBefore.current) refreshAfterReturn.current();
      focusedBefore.current = true;
    }, []),
  );

  // Handle barcode scanned
  const handleBarcodeScanned = async (barcode: string) => {
    // Drop repeat events from the camera while we're already processing
    // one. Cleared in the finally block below.
    if (handlingBarcodeRef.current) return;
    handlingBarcodeRef.current = true;
    setShowBarcodeScanner(false);
    setBarcodeLoading(true);

    try {
      // Step 1: Check local saved_foods first (instant)
      const savedFood = await getSavedFoodByBarcode(barcode);
      if (savedFood) {
        const match = await findInventoryMatchByBarcode(barcode);
        setInventoryMatch(match);
        setPreviewFood(savedFood);
        setPreviewSource("saved");
        setScannedBarcode(barcode);
        setPreviewWasEdited(false);
    setShowFoodPreview(true);
        setBarcodeLoading(false);
        return;
      }

      // Step 2: Check Open Food Facts API
      let productData: ProductData | null = null;
      try {
        productData = await getProductByBarcode(barcode);
      } catch (apiErr) {
        // Transient API failure (rate limit / network / 5xx). Surface a
        // try-again message rather than falsely telling the user the
        // food isn't in the database.
        if (apiErr instanceof OpenFoodFactsError && apiErr.rateLimited) {
          Alert.alert(
            "Open Food Facts is busy",
            "Their service is rate-limiting right now. Try the scan again in a moment, or tap + to add this food manually."
          );
        } else {
          Alert.alert(
            "Couldn't reach Open Food Facts",
            "We couldn't look up this barcode online. Check your connection and try again — or tap + to add it manually."
          );
        }
        setBarcodeLoading(false);
        return;
      }

      if (productData) {
        const match = await findInventoryMatchByBarcode(barcode);
        setInventoryMatch(match);
        setPreviewFood(productData);
        setPreviewSource("api");
        setScannedBarcode(barcode);
        setPreviewWasEdited(false);
    setShowFoodPreview(true);
        setBarcodeLoading(false);
        return;
      }

      // Step 3: Genuinely not found in OFF - open manual entry
      setScannedBarcode(barcode);
      setShowManualEntry(true);
    } catch (error) {
      console.error("Error looking up barcode:", error);
      Alert.alert("Error", "Failed to look up barcode");
    } finally {
      setBarcodeLoading(false);
      handlingBarcodeRef.current = false;
    }
  };

  // Undo last log
  const showUndoFor = (
    id: string,
    label: string,
    inventoryItemId: string | null,
  ) => {
    setLastLogId(id);
    setLastLogLabel(label);
    setLastLogInventoryId(inventoryItemId);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setLastLogId(null);
      setLastLogInventoryId(null);
    }, 5000);
  };

  const dismissUndo = () => {
    setLastLogId(null);
    setLastLogInventoryId(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const handleUndoLastLog = async () => {
    if (!lastLogId) return;
    const id = lastLogId;
    const invId = lastLogInventoryId;
    dismissUndo();
    try {
      const { error } = await supabase.from("meal_logs").delete().eq("id", id);
      if (error) throw error;
      if (invId) await refundOneInventoryUnit(invId);
      setMealsCache((prev) => {
        const next = new Map(prev);
        next.delete(viewingDateStr);
        return next;
      });
      await fetchMealsForDate(viewingDate, true);
    } catch (error) {
      console.error("Undo failed:", error);
      Alert.alert("Error", "Failed to undo");
    }
  };

  // Handle log meal from preview
  const handleLogMealFromPreview = async (
    food: SavedFood | ProductData,
    mealTypeSelected: MealType,
    servings: number,
    useInventory: boolean
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log meals");
        return;
      }

      // Normalize food data
      const name = food.name;
      const foodCalories = food.calories;
      const foodProtein = food.protein;
      const foodCarbs = food.carbs;
      const foodFats = food.fats;
      const foodSugars = "sugars" in food ? food.sugars : null;

      // Resolve extended fields (only present on ProductData and the new SavedFood shape)
      const foodSodium =
        "sodium_mg" in food ? (food as any).sodium_mg : null;
      const foodFiber =
        "fiber_g" in food ? (food as any).fiber_g : null;

      // If from API, save to library first
      let savedFoodId: string | null = null;
      if (previewSource === "api" && scannedBarcode) {
        const apiFood = food as ProductData;
        const newSavedFood = await createSavedFood({
          name: apiFood.name,
          brand: apiFood.brand,
          barcode: scannedBarcode,
          calories: apiFood.calories,
          protein: apiFood.protein,
          carbs: apiFood.carbs,
          fats: apiFood.fats,
          sugars: apiFood.sugars,
          sodium_mg: apiFood.sodium_mg,
          fiber_g: apiFood.fiber_g,
          serving_size: apiFood.servingSize,
          image_primary_url: apiFood.imagePrimaryUrl,
          image_front_url: apiFood.imageFrontUrl,
          image_back_url: apiFood.imageBackUrl,
          is_favorite: false,
          user_corrected: previewWasEdited,
          auto_scaled: apiFood.auto_scaled,
        });
        savedFoodId = newSavedFood.id;
      } else if ("id" in food) {
        savedFoodId = food.id;
      }

      // Calculate scaled nutrition
      const scaledCalories = foodCalories
        ? Math.round(foodCalories * servings)
        : null;
      const scaledProtein = foodProtein
        ? Math.round(foodProtein * servings * 10) / 10
        : null;
      const scaledCarbs = foodCarbs
        ? Math.round(foodCarbs * servings * 10) / 10
        : null;
      const scaledFats = foodFats
        ? Math.round(foodFats * servings * 10) / 10
        : null;
      const scaledSugars = foodSugars
        ? Math.round(foodSugars * servings * 10) / 10
        : null;
      const scaledSodium =
        foodSodium != null ? Math.round(foodSodium * servings) : null;
      const scaledFiber =
        foodFiber != null
          ? Math.round(foodFiber * servings * 10) / 10
          : null;

      // Log the meal (with optional pantry decrement)
      const willUseInventory =
        useInventory && !!inventoryMatch && inventoryMatch.quantity > 0;
      const inventoryItems = willUseInventory && inventoryMatch
        ? [{ id: inventoryMatch.id, quantity: 1 }]
        : null;
      const { data: inserted, error } = await supabase
        .from("meal_logs")
        .insert({
          user_id: user.id,
          date: viewingDateStr,
          meal_type: mealTypeSelected,
          name: name,
          calories: scaledCalories,
          protein: scaledProtein,
          carbs: scaledCarbs,
          fats: scaledFats,
          sugars: scaledSugars,
          sodium_mg: scaledSodium,
          fiber_g: scaledFiber,
          saved_food_id: savedFoodId,
          servings: servings,
          uses_inventory: willUseInventory,
          inventory_items: inventoryItems,
          logged_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      // Only the id whose unit was ACTUALLY taken may be armed for refund on
      // Undo. Phase 4 closed the divergence that had this gate reading the
      // legacy food_inventory.quantity cache: `willUseInventory` now projects
      // Σ food_inventory_locations, the same rows the consume RPC prefers, and
      // since the Phase 4 reconcile every item holds at least one location
      // row — so the two now read the same truth.
      // Still arm on outcome, never on intent: the gate is an earlier,
      // separate read (stock can move in between) and the RPC also reports 0
      // for no-such-row / RLS-filtered, while refund credits unconditionally.
      let consumedInventoryId: string | null = null;
      if (willUseInventory && inventoryMatch) {
        const consumed = await consumeOneInventoryUnit(inventoryMatch.id);
        if (consumed) consumedInventoryId = inventoryMatch.id;
      }

      // Clear state. `closeLogSheet` covers the scan-from-the-sheet path:
      // the food is logged, so the sheet that started the scan is done too.
      setShowFoodPreview(false);
      setPreviewFood(null);
      setScannedBarcode(null);
      setInventoryMatch(null);
      closeLogSheet();

      // Trigger undo snackbar
      if (inserted?.id) {
        const label = scaledCalories
          ? `Logged ${name} · ${scaledCalories} cal`
          : `Logged ${name}`;
        // The log row itself is always undoable; only the inventory refund
        // is conditional on a unit having genuinely been consumed.
        showUndoFor(inserted.id, label, consumedInventoryId);
      }

      // Invalidate cache and refetch
      setMealsCache((prev) => {
        const newCache = new Map(prev);
        newCache.delete(viewingDateStr);
        return newCache;
      });
      await fetchMealsForDate(viewingDate, true);

      // Refresh recent foods
      fetchRecentAndFavorites();

      // (snackbar replaces the success alert)
    } catch (error: any) {
      console.error("Error logging meal:", error);
      Alert.alert("Error", "Failed to log meal");
    }
  };

  // Handle save to library from preview
  const handleSaveToLibrary = async (food: ProductData) => {
    if (!scannedBarcode) return;

    try {
      await createSavedFood({
        name: food.name,
        brand: food.brand,
        barcode: scannedBarcode,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fats: food.fats,
        sugars: food.sugars,
        sodium_mg: food.sodium_mg,
        fiber_g: food.fiber_g,
        serving_size: food.servingSize,
        image_primary_url: food.imagePrimaryUrl,
        image_front_url: food.imageFrontUrl,
        image_back_url: food.imageBackUrl,
        is_favorite: false,
        user_corrected: false,
        auto_scaled: food.auto_scaled,
      });

      Alert.alert("Success", "Food saved to your library");
      fetchRecentAndFavorites();
    } catch (error: any) {
      console.error("Error saving to library:", error);
      Alert.alert("Error", "Failed to save to library");
    }
  };

  // Handle toggle favorite
  // Handle nutrition correction from the preview modal. Updates the
  // preview's food in-memory so the user sees the new values immediately.
  // For saved-source foods, persists to saved_foods (and sets
  // user_corrected=true). For api-source foods, the correction is held
  // until log time; the existing log flow then writes the corrected
  // values into saved_foods with user_corrected=true.
  const handleEditPreviewFood = async (next: {
    name: string;
    brand: string | null;
    serving_size: string | null;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
    sugars: number | null;
    sodium_mg: number | null;
    fiber_g: number | null;
  }) => {
    if (!previewFood) return;
    setPreviewWasEdited(true);
    if (previewSource === "saved" && "id" in previewFood) {
      try {
        const { data, error } = await supabase
          .from("saved_foods")
          .update({
            name: next.name,
            brand: next.brand,
            serving_size: next.serving_size,
            calories: next.calories,
            protein: next.protein,
            carbs: next.carbs,
            fats: next.fats,
            sugars: next.sugars,
            sodium_mg: next.sodium_mg,
            fiber_g: next.fiber_g,
            user_corrected: true,
          })
          .eq("id", (previewFood as SavedFood).id)
          .select()
          .single();
        if (error) throw error;
        if (data) setPreviewFood(data as SavedFood);
        // Refresh recents/favorites so the corrected values flow through
        await fetchRecentAndFavorites();
        await fetchAllSavedFoods();
      } catch (error) {
        console.error("Failed to save correction:", error);
        Alert.alert("Error", "Failed to save changes");
        throw error;
      }
    } else {
      // api source — update the in-flight preview only.
      setPreviewFood((prev) => {
        if (!prev) return prev;
        return {
          ...(prev as any),
          name: next.name,
          brand: next.brand,
          servingSize: next.serving_size,
          serving_size: next.serving_size,
          calories: next.calories,
          protein: next.protein,
          carbs: next.carbs,
          fats: next.fats,
          sugars: next.sugars,
          sodium_mg: next.sodium_mg,
          fiber_g: next.fiber_g,
        } as any;
      });
    }
  };

  const handleToggleFavorite = async (food: SavedFood) => {
    try {
      await toggleFavorite(food.id);
      fetchRecentAndFavorites();
    } catch (error: any) {
      console.error("Error toggling favorite:", error);
    }
  };

  // Handle manual food entry save and log
  const handleManualSaveAndLog = async (
    foodData: {
      name: string;
      brand: string | null;
      barcode: string | null;
      calories: number | null;
      protein: number | null;
      carbs: number | null;
      fats: number | null;
      sugars: number | null;
      sodium_mg?: number | null;
      fiber_g?: number | null;
      serving_size: string | null;
    },
    mealTypeSelected: MealType,
    saveToLibrary: boolean
  ) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log meals");
        return;
      }

      let savedFoodId: string | null = null;

      // Save to library if requested
      if (saveToLibrary) {
        const newSavedFood = await createSavedFood({
          name: foodData.name,
          brand: foodData.brand,
          barcode: foodData.barcode,
          calories: foodData.calories,
          protein: foodData.protein,
          carbs: foodData.carbs,
          fats: foodData.fats,
          sugars: foodData.sugars,
          sodium_mg: foodData.sodium_mg ?? null,
          fiber_g: foodData.fiber_g ?? null,
          serving_size: foodData.serving_size,
          image_primary_url: null,
          image_front_url: null,
          image_back_url: null,
          is_favorite: false,
          user_corrected: false,
          auto_scaled: false,
        });
        savedFoodId = newSavedFood.id;
      }

      // Log the meal
      const { data: inserted, error } = await supabase
        .from("meal_logs")
        .insert({
          user_id: user.id,
          date: viewingDateStr,
          meal_type: mealTypeSelected,
          name: foodData.name,
          calories: foodData.calories,
          protein: foodData.protein,
          carbs: foodData.carbs,
          fats: foodData.fats,
          sugars: foodData.sugars,
          sodium_mg: foodData.sodium_mg ?? null,
          fiber_g: foodData.fiber_g ?? null,
          saved_food_id: savedFoodId,
          servings: 1,
          uses_inventory: false,
          inventory_items: null,
          logged_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      if (inserted?.id) {
        const calLabel = foodData.calories
          ? `${foodData.calories} cal`
          : null;
        showUndoFor(
          inserted.id,
          calLabel
            ? `Logged ${foodData.name} · ${calLabel}`
            : `Logged ${foodData.name}`,
          null,
        );
      }

      // Clear state — including the sheet, if this entry began with its
      // "Scan a barcode" on a product the library had never seen.
      setShowManualEntry(false);
      setScannedBarcode(null);
      closeLogSheet();

      // Invalidate cache and refetch
      setMealsCache((prev) => {
        const newCache = new Map(prev);
        newCache.delete(viewingDateStr);
        return newCache;
      });
      await fetchMealsForDate(viewingDate, true);

      // Refresh recent foods if saved
      if (saveToLibrary) {
        fetchRecentAndFavorites();
      }

      // (snackbar replaces the success alert)
    } catch (error: any) {
      console.error("Error logging manual meal:", error);
      Alert.alert("Error", "Failed to log meal");
    }
  };

  // Swipe gesture handler
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          // Only respond to horizontal swipes
          return (
            Math.abs(gestureState.dx) > 10 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy)
          );
        },
        onPanResponderGrant: () => {
          translateX.setOffset(0);
          translateX.setValue(0);
        },
        onPanResponderMove: (_, gestureState) => {
          // Limit swipe distance for visual feedback
          const clampedDx = Math.max(-100, Math.min(100, gestureState.dx));
          translateX.setValue(clampedDx);
        },
        onPanResponderRelease: (_, gestureState) => {
          translateX.flattenOffset();

          if (gestureState.dx > SWIPE_THRESHOLD) {
            // Swiped right - go to previous day
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
            goToPreviousDay();
          } else if (gestureState.dx < -SWIPE_THRESHOLD && canGoForward()) {
            // Swiped left - go to next day
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
            goToNextDay();
          } else {
            // Snap back
            Animated.spring(translateX, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
        },
      }),
    [viewingDate]
  );

  const resetForm = () => addForm.reset(viewingDate);

  /**
   * The one door into logging. Every caller passes what it already knows —
   * the header knows only the day, a missed window's ghost knows the slot and
   * roughly when, a quick chip knows the kind of thing — and the sheet
   * inherits it instead of asking.
   */
  const openLogSheet = (opts: { mealType?: MealType; at?: Date; manual?: boolean } = {}) => {
    resetForm();
    addForm.setSelectedDate(viewingDate);
    // On a past day the clock time is meaningless, so a log lands at midday
    // rather than at whatever o'clock it happens to be now.
    const fallbackAt = viewingToday
      ? new Date()
      : new Date(new Date(viewingDate).setHours(12, 0, 0, 0));
    const at = opts.at ?? fallbackAt;
    // With no slot named by the caller, the clock names one: the window that
    // instant falls in. Otherwise every log would open on breakfast.
    addForm.setMealType(
      opts.mealType ??
        mealTypeForMinutes(
          fuel.model?.windows ?? [],
          at.getHours() * 60 + at.getMinutes(),
        ),
    );
    setLogSheetAt(at);
    setLogSheetQuery("");
    setLogSheetManual(opts.manual ?? false);
    setLogSheetOpen(true);
  };

  const closeLogSheet = () => {
    setLogSheetOpen(false);
    setLogSheetManual(false);
    setLogSheetQuery("");
  };

  const handleAddMeal = async () => {
    const {
      selectedDate,
      mealType,
      mealName,
      calories,
      protein,
      carbs,
      fats,
      sugars,
      sodiumMg,
      fiberG,
    } = addForm;
    if (!mealName.trim()) {
      Alert.alert("Validation Error", "Meal name is required");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log meals");
        return;
      }

      const mealData = {
        user_id: user.id,
        date: getLocalDateString(selectedDate),
        meal_type: mealType,
        name: mealName.trim(),
        calories: calories ? parseInt(calories) : null,
        protein: protein ? parseFloat(protein) : null,
        carbs: carbs ? parseFloat(carbs) : null,
        fats: fats ? parseFloat(fats) : null,
        sugars: sugars ? parseFloat(sugars) : null,
        sodium_mg: sodiumMg ? parseFloat(sodiumMg) : null,
        fiber_g: fiberG ? parseFloat(fiberG) : null,
        uses_inventory: false,
        inventory_items: null,
        // The sheet's own clock — set from the entry point, so a log written
        // through a missed window's ghost lands in that window's slot.
        logged_at: logSheetAt.toISOString(),
      };

      const { data: inserted, error } = await supabase
        .from("meal_logs")
        .insert([mealData])
        .select()
        .single();

      if (error) throw error;

      if (inserted?.id) {
        const calLabel = mealData.calories ? `${mealData.calories} cal` : null;
        showUndoFor(
          inserted.id,
          calLabel
            ? `Logged ${mealData.name} · ${calLabel}`
            : `Logged ${mealData.name}`,
          null,
        );
      }

      // Invalidate cache for the date the meal was added to
      const mealDate = getLocalDateString(selectedDate);
      setMealsCache((prev) => {
        const newCache = new Map(prev);
        newCache.delete(mealDate);
        return newCache;
      });

      resetForm();
      closeLogSheet();

      // Refetch if the meal was added for the viewing date
      if (mealDate === viewingDateStr) {
        await fetchMealsForDate(viewingDate, true);
      }
    } catch (error: any) {
      console.error("Error adding meal:", error);
      Alert.alert("Error", "Failed to log meal");
    }
  };

  // Quick adjustment — log calories+macros without a food.
  const handleQuickAdjustment = async (input: {
    name: string;
    meal_type: MealType;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
  }) => {
    try {
      setSavingQuickAdjust(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in to log meals");
        return;
      }
      const { data: inserted, error } = await supabase
        .from("meal_logs")
        .insert({
          user_id: user.id,
          date: viewingDateStr,
          meal_type: input.meal_type,
          name: input.name,
          calories: input.calories,
          protein: input.protein,
          carbs: input.carbs,
          fats: input.fats,
          sugars: null,
          sodium_mg: null,
          fiber_g: null,
          saved_food_id: null,
          servings: 1,
          uses_inventory: false,
          inventory_items: null,
          logged_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      setMealsCache((prev) => {
        const next = new Map(prev);
        next.delete(viewingDateStr);
        return next;
      });
      await fetchMealsForDate(viewingDate, true);
      setQuickAdjustVisible(false);
      if (inserted?.id) {
        showUndoFor(
          inserted.id,
          `Logged ${input.name} · ${input.calories ?? 0} cal`,
          null,
        );
      }
    } catch (error) {
      console.error("Quick adjustment failed:", error);
      Alert.alert("Error", "Failed to log adjustment");
    } finally {
      setSavingQuickAdjust(false);
    }
  };

  // CSV export — share all meal_logs (last 365 days) via the system Share
  // sheet. Text-based (no native module dependency, same as water).
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      if (historicalLogs.length === 0) {
        Alert.alert("No data", "Log some meals before exporting.");
        return;
      }
      const header =
        "date,time,meal_type,name,calories,protein_g,carbs_g,fats_g,sugars_g,sodium_mg,fiber_g,servings\n";
      const rows = [...historicalLogs]
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
        .map((m) => {
          const dt = new Date(m.logged_at);
          const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
          const esc = (s: string) =>
            s.includes(",") || s.includes("\"") ? `"${s.replace(/"/g, '""')}"` : s;
          return [
            m.date,
            time,
            m.meal_type,
            esc(m.name),
            m.calories ?? "",
            m.protein ?? "",
            m.carbs ?? "",
            m.fats ?? "",
            m.sugars ?? "",
            m.sodium_mg ?? "",
            m.fiber_g ?? "",
            m.servings ?? 1,
          ].join(",");
        })
        .join("\n");
      const csv = header + rows + "\n";
      await Share.share({
        message: csv,
        title: `Meals ${getLocalDateString()}`,
      });
    } catch (error) {
      console.error("CSV export failed:", error);
      Alert.alert("Error", "Failed to export CSV");
    } finally {
      setExporting(false);
    }
  };

  const handleSaveMealEdit = async (updates: MealLogEdit) => {
    if (!editingMeal) return;
    try {
      setSavingEdit(true);
      const { error } = await supabase
        .from("meal_logs")
        .update(updates)
        .eq("id", editingMeal.id);
      if (error) throw error;
      const date = editingMeal.date;
      setEditingMeal(null);
      setMealsCache((prev) => {
        const next = new Map(prev);
        next.delete(date);
        return next;
      });
      await fetchMealsForDate(viewingDate, true);
    } catch (error) {
      console.error("Error editing meal:", error);
      Alert.alert("Error", "Failed to save changes");
    } finally {
      setSavingEdit(false);
    }
  };

  // B3. Accepting a suggestion used to be chip → library modal → detail →
  // Log: three screens to say yes to an answer the app had already computed.
  //
  // Reuses `logMeal` — the same function the library detail calls, with the
  // same two failure branches — rather than reimplementing the write. The
  // meal and the concept maps come from `fetchMealLibrary`, which since D1
  // serves this out of the cache the recommender itself just populated, so
  // this costs no extra round trip in practice.
  const [quickLoggingMealId, setQuickLoggingMealId] = useState<string | null>(null);
  // Fire-and-report: a failed rating must not disturb a log that succeeded.
  const rateConcept = async (conceptId: string, rating: ConceptRating) => {
    try {
      await confirmConceptRating(conceptId, rating);
      eatNext.refetch();
    } catch (e) {
      console.error("confirm concept rating:", e);
      Alert.alert("Couldn't save that rating", "The meal is still logged.");
    }
  };
  const handleQuickLogSuggestion = async (mealId: string) => {
    if (quickLoggingMealId) return;
    setQuickLoggingMealId(mealId);
    try {
      const library = await fetchMealLibrary();
      const meal = library.meals.find((m) => m.id === mealId);
      if (!meal) throw new Error("That meal is no longer in your library.");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const result = await logMeal(user.id, meal, {
        date: viewingDateStr,
        mealType: defaultMealTypeFor(meal),
        conceptIdsBySavedFoodId: library.conceptIdsBySavedFoodId,
        inventory: library.inventory,
      });
      setMealsCache((prev) => {
        const next = new Map(prev);
        next.delete(viewingDateStr);
        return next;
      });
      await fetchMealsForDate(viewingDate, true);
      await fetchRecentAndFavorites();
      eatNext.refetch();
      // C3/E2. The one moment the answer is free: the food is in front of you
      // and the question is one tap. Only fires when exactly one of the meal's
      // concepts has never been rated by hand — see `tasteAskFor` for why the
      // multi-unrated case stays silent.
      const ask = tasteAskFor(
        meal.items
          .flatMap((it) => library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [])
          .map((id) => library.conceptsById.get(id))
          .filter((c): c is NonNullable<typeof c> => !!c)
          .map((c) => ({
            id: c.id,
            name: c.name,
            ratingConfirmedAt: c.rating_confirmed_at ?? null,
          })),
      );
      // Fired from the confirmation's OK, never alongside it: two alerts
      // raised in the same tick stack, and the second covers the first. Not
      // fired after Undo either — undoing means you did not eat it, so there
      // is nothing to have an opinion about.
      const askTaste = () => {
        if (!ask) return;
        Alert.alert(
          `How was ${ask.name}?`,
          "Your answer replaces the rating the app guessed, which is 30% of every meal's score.",
          [
            { text: "Loved it", onPress: () => void rateConcept(ask.id, "love") },
            { text: "Fine", onPress: () => void rateConcept(ask.id, "like") },
            { text: "Not again", style: "destructive", onPress: () => void rateConcept(ask.id, "dislike") },
            { text: "Skip", style: "cancel" },
          ],
        );
      };
      Alert.alert("Logged", `${meal.name} → ${defaultMealTypeFor(meal)}`, [
        {
          text: "Undo",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await undoMealLog(meal.id, result.loggedAt, result.consumedIds);
                await fetchMealsForDate(viewingDate, true);
                eatNext.refetch();
              } catch (e) {
                console.error("undo quick log:", e);
                Alert.alert("Couldn't undo", "The meal is still logged.");
              }
            })();
          },
        },
        { text: "OK", style: "default", onPress: askTaste },
      ]);
    } catch (e) {
      // `MealLoggedButDecrementFailed` carries its own explanatory message and
      // means the log DID commit — never presented as a failure to log.
      if (e instanceof MealLoggedButDecrementFailed) {
        await fetchMealsForDate(viewingDate, true);
        Alert.alert("Logged (inventory not updated)", e.message);
      } else {
        console.error("quick log suggestion:", e);
        Alert.alert("Couldn't log that", e instanceof Error ? e.message : "Unknown error");
      }
    } finally {
      setQuickLoggingMealId(null);
    }
  };

  const handleDeleteMeal = async (mealId: string) => {
    Alert.alert("Delete Meal", "Are you sure you want to delete this meal log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("meal_logs").delete().eq("id", mealId);

            if (error) throw error;

            // Invalidate cache for current viewing date and refetch
            setMealsCache((prev) => {
              const newCache = new Map(prev);
              newCache.delete(viewingDateStr);
              return newCache;
            });
            await fetchMealsForDate(viewingDate, true);
          } catch (error: any) {
            console.error("Error deleting meal:", error);
            Alert.alert("Error", "Failed to delete meal");
          }
        },
      },
    ]);
  };

  // Get meals for current viewing date from cache
  const dayMeals = mealsCache.get(viewingDateStr) || [];

  // Calculate totals for viewing date (includes sodium + fiber).
  // Totals are always over ALL meals (not filtered), so the day's true
  // intake is shown regardless of search query.
  const dayTotals = useMemo(() => sumNutrition(dayMeals), [dayMeals]);

  // (`isViewingToday` is a function defined above; cache its result here for
  // memo deps.)
  const viewingToday = viewingDateStr === todayStr;

  // The Fuel engine: one hook, one clock, rendered-ready rail rows. Replaces
  // the pace-line memos, the rescue row and the Eat Next row this screen used
  // to compose separately — and with them, their three separate clocks.
  const fuel = useFuelPlan(dayMeals, viewingToday, fuelRefreshKey);

  const handleRetro = (w: FuelWindow | null) => {
    if (!w) return openLogSheet();
    // A window's ghost logs into the middle of that window, which is both a
    // fair guess and enough to make the rail file the receipt in the right
    // place — the exact minute is editable in the sheet.
    const mid = Math.round((w.startMinutes + w.endMinutes) / 2);
    const at = new Date(viewingDate);
    at.setHours(Math.floor(mid / 60), mid % 60, 0, 0);
    openLogSheet({ mealType: w.mealType, at });
  };

  /**
   * One tap on a recent or a search result writes the log outright — the
   * whole reason recents come first. Mirrors the preview flow's semantics
   * (one serving, inventory decremented when the barcode matches something in
   * stock, undoable) minus the preview screen in between.
   */
  const handleLogFoodDirect = async (food: SavedFood) => {
    if (loggingFoodId) return;
    setLoggingFoodId(food.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in to log meals");
        return;
      }
      const match = food.barcode ? await findInventoryMatchByBarcode(food.barcode) : null;
      const willUseInventory = !!match && match.quantity > 0;
      const { data: inserted, error } = await supabase
        .from("meal_logs")
        .insert({
          user_id: user.id,
          date: viewingDateStr,
          meal_type: addForm.mealType,
          name: food.name,
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fats: food.fats,
          sugars: food.sugars,
          sodium_mg: (food as { sodium_mg?: number | null }).sodium_mg ?? null,
          fiber_g: (food as { fiber_g?: number | null }).fiber_g ?? null,
          saved_food_id: food.id,
          servings: 1,
          uses_inventory: willUseInventory,
          inventory_items: willUseInventory && match ? [{ id: match.id, quantity: 1 }] : null,
          logged_at: logSheetAt.toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // Armed on outcome, never on intent — same rule as the preview path.
      let consumedInventoryId: string | null = null;
      if (willUseInventory && match) {
        const consumed = await consumeOneInventoryUnit(match.id);
        if (consumed) consumedInventoryId = match.id;
      }

      closeLogSheet();
      if (inserted?.id) {
        showUndoFor(
          inserted.id,
          food.calories ? `Logged ${food.name} · ${food.calories} cal` : `Logged ${food.name}`,
          consumedInventoryId,
        );
      }
      setMealsCache((prev) => {
        const next = new Map(prev);
        next.delete(viewingDateStr);
        return next;
      });
      await fetchMealsForDate(viewingDate, true);
      await fetchRecentAndFavorites();
    } catch (e) {
      console.error("Error logging food:", e);
      Alert.alert("Error", "Failed to log that");
    } finally {
      setLoggingFoodId(null);
    }
  };

  // Receipts borrow their saved food's photo, same as meals borrow their
  // biggest item's (C5) — a rail of grey initials would waste pictures the
  // library already holds.
  const logFaceById = useMemo(() => {
    const foodById = new Map(allSavedFoods.map((f) => [f.id, f.image_primary_url ?? null]));
    const m = new Map<string, string | null>();
    for (const l of dayMeals) {
      m.set(l.id, l.saved_food_id ? (foodById.get(l.saved_food_id) ?? null) : null);
    }
    return m;
  }, [dayMeals, allSavedFoods]);

  // Second of the eat-nudge family's two resync points (spec §8.1; the Home
  // card is the other, covering app open/foreground). Sited here, rather than
  // up with the other effects, because it reads `viewingToday` — a dep array
  // is evaluated during render, so referencing that `const` before the line
  // above would be a TDZ ReferenceError, not a lint nit.
  //
  // Keyed on the hook's state rather than called from the write handlers on
  // purpose: `refetch` resolves asynchronously, so any `eatNext.result` read
  // in a handler's closure is the pre-write decision. This effect therefore
  // covers both the initial load and every post-write reload, and does NOT
  // fire on a failed refetch (the hook is stale-while-revalidate — it leaves
  // `result`'s identity untouched on failure).
  //
  // `result` and `computedAt` are a matched pair from the same load — the
  // hook sets them together on success and neither alone — which is exactly
  // what `syncEatNudge`'s required `sourceDay` demands (`fireAtMinutes` is
  // minutes since local midnight on the day the decision was computed, so
  // resolving it against a fresh `new Date()` is the cross-midnight
  // mis-schedule that parameter exists to make uncompilable). `computedAt` is
  // `Date | null` until the first load resolves; that case has no decision to
  // sync, so skipping it is deliberate. Passed straight through, never
  // mutated — it is the `Date` object held in the hook's state.
  //
  // `viewingToday` only narrows WHEN this runs, never what it schedules: the
  // recommender always computes for today regardless of the viewed date, so
  // browsing a past day merely skips a redundant resync (recoverable at the
  // next one — the same tolerance the service documents for a failed cancel)
  // and cannot cancel or stale-schedule anything. Coming back to today
  // re-syncs.
  //
  // `void` + `.catch`: `syncEatNudge` can reject (`requestPermissions` has no
  // try/catch around its native calls and `syncEatNudgeCore` awaits it
  // outside its own try), and there is no gesture here to surface it on —
  // uncaught, it is a dev yellow-box and silence in prod. Same handling, for
  // the same reason, as `EatNextHomeCard`.
  useEffect(() => {
    if (!viewingToday || !eatNext.result || !eatNext.computedAt) return;
    void syncEatNudge(eatNext.result.nudge, eatNext.computedAt).catch((e) => {
      console.error("MealsScreen nudge resync:", e);
    });
  }, [viewingToday, eatNext.result, eatNext.computedAt]);


  // Insights data — derived from the 365-day historical fetch.
  const totalsByDate = useMemo(
    () => buildDailyTotalsByDate(historicalLogs),
    [historicalLogs]
  );
  const calorieStreak = useMemo(
    () => computeMacroStreak(totalsByDate, goals, "calories"),
    [totalsByDate, goals]
  );
  const calorieBestStreak = useMemo(
    () => computeMacroBestStreak(totalsByDate, goals, "calories"),
    [totalsByDate, goals]
  );
  const proteinStreak = useMemo(
    () => computeMacroStreak(totalsByDate, goals, "protein"),
    [totalsByDate, goals]
  );
  const proteinBestStreak = useMemo(
    () => computeMacroBestStreak(totalsByDate, goals, "protein"),
    [totalsByDate, goals]
  );
  const rolling = useMemo(
    () => computeMealsRollingStats(totalsByDate, goals),
    [totalsByDate, goals]
  );
  const series14 = useMemo(
    () => buildMealsSeries(totalsByDate, 14, goals),
    [totalsByDate, goals]
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* The two rows that stand down while you scroll. */}
        <Animated.View
          onLayout={(e) => setCollapsibleHeight(e.nativeEvent.layout.height)}
          style={{ transform: [{ translateY: headerTranslate }] }}
        >
        {/* Header — back, search (with barcode), add — mirrors Food Inventory */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={icons.lg} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchBar}>
            <Search size={icons.md} color={colors.textMuted} />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search foods..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                activeOpacity={0.7}
                style={styles.searchActionButton}
              >
                <X size={icons.md} color={colors.textMuted} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setShowBarcodeScanner(true)}
                activeOpacity={0.7}
                style={styles.searchActionButton}
              >
                <ScanBarcode size={icons.md} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          {/* B5. The Meal Library is the loop's second station and its door
              was at the bottom of the scroll, below the pace lines, the
              suggestions, the search results and the quick-add row — four
              scrolls from the top. It belongs beside the other two things you
              can do from here. */}
          {/* A book, not a fork: the fork is this page's own identity glyph,
              and a control wearing the screen's mark reads as "you are here"
              rather than "go there". */}
          <IconButton
            icon={BookOpen}
            weight="secondary"
            onPress={openLibrary}
            accessibilityLabel="Open your meal library"
          />
          <IconButton
            icon={Plus}
            onPress={() => openLogSheet()}
            accessibilityLabel="Log a meal"
          />
        </View>

        {/* Title (Share moved here from header). Outside the scroller and
            inside the collapsing group, so it folds into the condensed bar
            rather than merely scrolling out of sight. */}
        <View style={styles.titleContainer}>
          <Utensils
            size={icons.xl}
            color={colors.accents.meals}
            strokeWidth={icons.strokeWidth}
          />
          <Text style={styles.pageTitle}>Fuel</Text>
          <TouchableOpacity
            onPress={handleExportCsv}
            disabled={exporting}
            style={styles.titleShareButton}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Export this day as CSV"
          >
            <Share2
              size={icons.lg}
              color={exporting ? colors.textMuted : colors.text}
            />
          </TouchableOpacity>
        </View>
        </Animated.View>

        {/* App-drawn refresh indicator — the system spinner never renders in
            this app, so the primitive sits as a sibling above the scroll. */}
        <RefreshIndicator visible={refreshing} />

        {/* Rides up with the header. Extended below the screen edge by exactly
            the collapse distance so the day gains that space. */}
        <Animated.ScrollView
          ref={scrollRef}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          style={[
            styles.content,
            { marginBottom: -collapseDistance, transform: [{ translateY: headerTranslate }] },
          ]}
          showsVerticalScrollIndicator={false}
          // `flexGrow: 1` (with the matching grow on `mealsSection`) is what
          // lets the rail region's `EmptyState` — `flex: 1` — resolve to a
          // real height instead of collapsing onto its own padding. Inert
          // once the day has enough content to scroll.
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={["transparent"]}
            />
          }
        >
          {/* Date Navigation - with swipe gesture */}
          <Animated.View
            style={{ transform: [{ translateX }] }}
            {...panResponder.panHandlers}
          >
            <View style={styles.dateNavigation}>
              <TouchableOpacity
                onPress={goToPreviousDay}
                style={styles.navArrow}
                activeOpacity={0.7}
              >
                <ChevronLeft size={icons.lg} color={colors.text} />
              </TouchableOpacity>

              <Text style={styles.dateText}>{formatViewingDate(viewingDate)}</Text>

              <TouchableOpacity
                onPress={goToNextDay}
                style={[styles.navArrow, !canGoForward() && styles.navArrowDisabled]}
                activeOpacity={0.7}
                disabled={!canGoForward()}
              >
                <ChevronRight
                  size={icons.lg}
                  color={canGoForward() ? colors.text : colors.textMuted}
                />
              </TouchableOpacity>
            </View>
          </Animated.View>

            {/* Jump to Today Button */}
            {!isViewingToday() && (
              <View style={styles.actionRow}>
                <Button
                  label="Jump to Today"
                  icon={Calendar}
                  onPress={goToToday}
                  fluid
                />
              </View>
            )}

            {/* Tab pills: Today / Insights. Hidden while the add form is
                up — that flow takes over the surface. */}
            {(
              <View style={styles.tabsContainer}>
                <View style={styles.tabsTrack}>
                  <TouchableOpacity
                    onPress={() => setActiveTab("today")}
                    style={[
                      styles.tabPill,
                      activeTab === "today" && styles.tabPillActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tabPillText,
                        activeTab === "today" && styles.tabPillTextActive,
                      ]}
                    >
                      Today
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setActiveTab("insights")}
                    style={[
                      styles.tabPill,
                      activeTab === "insights" && styles.tabPillActive,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.tabPillText,
                        activeTab === "insights" && styles.tabPillTextActive,
                      ]}
                    >
                      Insights
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── TODAY TAB ── the day's eating plan */}
            {activeTab === "today" && (
              <>
                {/* Today wears the verdict strip — chip, bars, and what the
                    rail below lands the day at. A finished (past) day is a
                    record, not a plan, so it keeps the full nutrition card.
                    While today's plan is still loading this renders NOTHING:
                    falling back to the ring card would flash a different
                    summary of the same day for a beat on every entry, which
                    reads as the page changing its mind. The strip appears
                    when it can be right. The ring card does come back if the
                    plan FAILS — then it is the honest best available. */}
                {viewingToday && fuel.model?.verdict ? (
                  <FuelVerdictStrip
                    verdict={fuel.model.verdict}
                    projection={fuel.model.projection}
                    dayTotals={dayTotals}
                    goals={goals}
                    computedAt={fuel.model.computedAt}
                    paceByMacro={{
                      calories: fuel.model.caloriePace,
                      protein: fuel.model.proteinPace,
                      fiber: fuel.model.fiberPace,
                    }}
                  />
                ) : viewingToday && !fuel.error ? null : (
                  <MealsNutritionCard
                    label={getNutritionLabel(viewingDate)}
                    totals={dayTotals}
                    goals={goals}
                  />
                )}

                {/* Search Results — from your saved foods library */}
                {searchQuery.trim().length >= 2 && (
                  <Card variant="row" style={styles.searchResultsSpacing}>
                    {/* B4. Search used to cover saved foods only, so every meal
                        you had assembled was invisible to it — you could search
                        "oats" and be told nothing matched while Protein Oatmeal
                        Bowl sat two taps away. Both kinds now, each labelled,
                        meals first because a meal is the bigger unit and the
                        one you are usually reaching for. */}
                    {mealResults.length > 0 && (
                      <>
                        <Text style={styles.searchResultsHeader}>
                          {`Meals matching "${searchQuery.trim()}"`}
                        </Text>
                        {mealResults.slice(0, 5).map((m) => (
                          <TouchableOpacity
                            key={m.id}
                            onPress={() => openMeal(m.id)}
                            style={styles.searchResultRow}
                            activeOpacity={0.7}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={styles.searchResultName} numberOfLines={1}>
                                {m.name}
                              </Text>
                              <Text style={styles.searchResultBrand} numberOfLines={1}>
                                {m.items.length} ingredient{m.items.length === 1 ? "" : "s"} · {m.prep_minutes} min
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </>
                    )}
                    <Text style={styles.searchResultsHeader}>
                      {searching
                        ? "Searching…"
                        : searchResults.length === 0
                          ? mealResults.length > 0
                            ? "No saved foods match — scan a barcode or tap + to add one."
                            : `Nothing matches "${searchQuery.trim()}". Scan a barcode or tap + to add it.`
                          : `Saved foods matching "${searchQuery.trim()}"`}
                    </Text>
                    {searchResults.slice(0, 8).map((f) => (
                      <TouchableOpacity
                        key={f.id}
                        onPress={() => handleSearchResultPress(f)}
                        style={styles.searchResultRow}
                        activeOpacity={0.7}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.searchResultName} numberOfLines={1}>
                            {f.name}
                          </Text>
                          {f.brand && (
                            <Text style={styles.searchResultBrand} numberOfLines={1}>
                              {f.brand}
                            </Text>
                          )}
                        </View>
                        {f.calories != null && (
                          <Text style={styles.searchResultCals}>{f.calories} cal</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </Card>
                )}

                {/* Quick add lives BELOW the rail as the mock's chip row —
                    the plan is the page; adding something unplanned is the
                    escape hatch, not the headline. Recent-food one-tap chips
                    still live inside the add form. */}
              </>
            )}

            {/* ── INSIGHTS TAB ── reflective stats */}
            {activeTab === "insights" && (
              <>
                <MealsInsightsCard
                  calorieStreak={calorieStreak}
                  calorieBestStreak={calorieBestStreak}
                  proteinStreak={proteinStreak}
                  proteinBestStreak={proteinBestStreak}
                  avgCalsPerDay={rolling.avgCalsPerDay}
                  daysHit={rolling.daysHit}
                  daysInWindow={rolling.daysInWindow}
                  series14={series14}
                  calorieGoal={goals.calories ?? 0}
                />

                {/* Today's distribution (calories by meal type) */}
                {viewingToday && (
                  <View style={styles.distributionWrap}>
                    <MealsDistributionBar meals={dayMeals} />
                  </View>
                )}

                <View style={styles.actionRow}>
                  <Button
                    variant="secondary"
                    label="Weekly Summary"
                    icon={BarChart3}
                    onPress={() => setWeeklySummaryVisible(true)}
                    fluid
                  />
                </View>

                <View style={styles.actionRow}>
                  {/* No `icon`: at `typography.button` this label already runs
                      ~255pt against a ~220pt content box on a 320pt device, and
                      `Button` neither truncates nor shrinks. Dropping the glyph
                      reclaims 28pt; the copy is user-facing and stays as-is. */}
                  <Button
                    variant="secondary"
                    label="Quick Adjustment — calories only"
                    onPress={() => setQuickAdjustVisible(true)}
                    fluid
                  />
                </View>
              </>
            )}

            {/* The rail — the day in one chronological read. Today: receipts,
                the NOW line, then the plan. Past days: receipts only. */}
            {activeTab === "today" && (
              <View style={styles.mealsSection}>
                {loadingDay && dayMeals.length === 0 ? (
                  <ActivityIndicator color={colors.brand} />
                ) : !viewingToday && dayMeals.length === 0 ? (
                  <EmptyState
                    icon={Utensils}
                    title="No meals logged"
                    body="Nothing was logged on this day."
                  />
                ) : (
                  <FuelRail
                    rows={fuel.model?.rows ?? []}
                    loggingMealId={quickLoggingMealId}
                    logFaceById={logFaceById}
                    onPressLog={(logId) => {
                      const m = dayMeals.find((x) => x.id === logId);
                      if (m) setEditingMeal(m);
                    }}
                    onDeleteLog={handleDeleteMeal}
                    onRetro={handleRetro}
                    onQuickLog={handleQuickLogSuggestion}
                    // The rail asks for a meal, or for the library itself when
                    // it has no pick to point at.
                    onOpenLibrary={(mealId) => (mealId ? openMeal(mealId) : openLibrary())}
                  />
                )}

                {/* Quick add chips — the mock's bottom row. Anything the plan
                    didn't suggest is one tap into the form (R13). */}
                {(
                  <View style={styles.quickChipsRow}>
                    {(
                      [
                        ["Meal", null],
                        ["Snack", "snack"],
                        ["Dessert", "dessert"],
                      ] as Array<[string, MealType | null]>
                    ).map(([label, type]) => (
                      <TouchableOpacity
                        key={label}
                        style={styles.quickChip}
                        onPress={() => openLogSheet(type ? { mealType: type } : {})}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Add a ${label.toLowerCase()}`}
                      >
                        <Plus size={icons.sm} color={colors.text} strokeWidth={icons.strokeWidth} />
                        <Text style={styles.quickChipText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={styles.quickChip}
                      onPress={() => searchInputRef.current?.focus()}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Search foods"
                    >
                      <Search size={icons.sm} color={colors.text} strokeWidth={icons.strokeWidth} />
                      <Text style={styles.quickChipText}>Search</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </Animated.ScrollView>
      </View>

      {/* Condensed bar. A sibling of the container, not a child, so top:0 is
          the true top of the screen and it can own the safe-area inset itself.
          Everything the scrolled-away rows offered is here. */}
      <Animated.View
        style={[styles.slimBar, { paddingTop: insets.top, opacity: slimBarOpacity }]}
        pointerEvents={collapsed ? "auto" : "none"}
      >
        <View style={styles.slimBarRow}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <ChevronLeft size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
          <Text style={styles.slimBarTitle} numberOfLines={1}>Fuel</Text>
          <TouchableOpacity
            onPress={handleExportCsv}
            disabled={exporting}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Export this day as CSV"
          >
            <Share2
              size={icons.md}
              color={exporting ? colors.textMuted : colors.text}
              strokeWidth={icons.strokeWidth}
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openSearch}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Search foods"
          >
            <Search size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={openLibrary}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Open your meal library"
          >
            <BookOpen size={icons.md} color={colors.brand} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => openLogSheet()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Log a meal"
          >
            <Plus size={icons.md} color={colors.brand} strokeWidth={icons.strokeWidth} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={showBarcodeScanner}
        onClose={() => setShowBarcodeScanner(false)}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Food Preview Modal */}
      <FoodPreviewModal
        visible={showFoodPreview}
        food={previewFood}
        source={previewSource}
        inventoryMatch={inventoryMatch}
        onClose={() => {
          setShowFoodPreview(false);
          setPreviewFood(null);
          setScannedBarcode(null);
          setInventoryMatch(null);
        }}
        onLogMeal={handleLogMealFromPreview}
        onSaveToLibrary={previewSource === "api" ? handleSaveToLibrary : undefined}
        onToggleFavorite={previewSource === "saved" ? async (food) => {
          await handleToggleFavorite(food);
          // Update the preview food to reflect the change
          setPreviewFood({ ...food, is_favorite: !food.is_favorite });
        } : undefined}
        onEditFood={handleEditPreviewFood}
      />

      {/* Manual Food Entry Modal */}
      <ManualFoodEntryModal
        visible={showManualEntry}
        barcode={scannedBarcode}
        onClose={() => {
          setShowManualEntry(false);
          setScannedBarcode(null);
        }}
        onSaveAndLog={handleManualSaveAndLog}
      />

      {/* Edit Meal Modal */}
      <MealLogEditorModal
        visible={editingMeal !== null}
        meal={editingMeal}
        saving={savingEdit}
        faceUrl={editingMeal ? (logFaceById.get(editingMeal.id) ?? null) : null}
        dayCalories={dayTotals.calories}
        goalCalories={goals.calories}
        onClose={() => setEditingMeal(null)}
        onSave={handleSaveMealEdit}
        onDelete={(mealId) => {
          setEditingMeal(null);
          handleDeleteMeal(mealId);
        }}
      />

      {/* Quick Adjustment Modal */}
      <QuickAdjustmentModal
        visible={quickAdjustVisible}
        saving={savingQuickAdjust}
        onClose={() => setQuickAdjustVisible(false)}
        onSave={handleQuickAdjustment}
      />

      {/* Weekly Summary Modal */}
      <MealsWeeklySummaryModal
        visible={weeklySummaryVisible}
        historicalLogs={historicalLogs}
        goals={goals}
        onClose={() => setWeeklySummaryVisible(false)}
      />

      {/* Log something — over the rail, never inside it. */}
      <LogMealSheet
        visible={logSheetOpen}
        onClose={closeLogSheet}
        mealType={addForm.mealType}
        onMealTypeChange={addForm.setMealType}
        loggedAt={logSheetAt}
        onLoggedAtChange={setLogSheetAt}
        dayLabel={viewingToday ? "today" : formatViewingDate(viewingDate)}
        recentFoods={recentFoods.map((r) => r.savedFood)}
        favorites={favorites}
        onLogFood={handleLogFoodDirect}
        loggingFoodId={loggingFoodId}
        query={logSheetQuery}
        onQueryChange={setLogSheetQuery}
        searching={sheetSearching}
        searchResults={sheetFoodResults}
        mealResults={sheetMealResults}
        onOpenMeal={(mealId) => {
          closeLogSheet();
          openMeal(mealId);
        }}
        // The scanner is a full-screen modal that covers the sheet anyway, so
        // the sheet stays open underneath it: backing out of the camera
        // returns you to where you were, rather than making you re-open the
        // sheet to try again. The paths that finish the job — logging from
        // the preview, or saving a manual entry — close it themselves.
        onScan={() => setShowBarcodeScanner(true)}
        form={addForm}
        manualOpen={logSheetManual}
        onManualOpenChange={setLogSheetManual}
        onSubmitManual={handleAddMeal}
        submitting={loggingFoodId !== null}
      />

      {/* Undo snackbar */}
      <MealUndoSnackbar
        visible={lastLogId !== null}
        label={lastLogLabel}
        onUndo={handleUndoLastLog}
      />
    </>
  );
}
