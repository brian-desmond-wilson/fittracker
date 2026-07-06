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
import {
  ChevronLeft,
  ChevronRight,
  Utensils,
  Calendar,
  Plus,
  Share2,
  Zap,
  BarChart3,
  Search,
  ScanBarcode,
  X,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";
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
import { RecentFoodsRow } from "./meals/RecentFoodsRow";
import { ManualFoodEntryModal } from "./meals/ManualFoodEntryModal";
import { MealsNutritionCard } from "./MealsNutritionCard";
import { sumNutrition } from "@/src/lib/mealMacros";
import { MealLogEditorModal } from "./MealLogEditorModal";
import { MealTemplatesModal } from "./MealTemplatesModal";
import { MealsInsightsCard } from "./MealsInsightsCard";
import {
  buildDailyTotalsByDate,
  computeMacroStreak,
  computeMacroBestStreak,
  computeMealsRollingStats,
  buildMealsSeries,
} from "@/src/lib/mealStats";
import { computeMealPace, MealPaceState } from "@/src/lib/mealPace";
import { MealsPaceLines } from "./MealsPaceLines";
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
import { styles } from "./meals/mealsScreenStyles";
import {
  getLocalDateString,
  formatViewingDate,
  getNutritionLabel,
} from "./meals/mealsHelpers";
import { useMacroGoals } from "./meals/useMacroGoals";
import { useRecentAndFavorites } from "./meals/useRecentAndFavorites";
import { useSavedFoodsSearch } from "./meals/useSavedFoodsSearch";
import { useHistoricalMeals } from "./meals/useHistoricalMeals";
import { useMealAddForm } from "./meals/useMealAddForm";
import { MealsDayList } from "./meals/MealsDayList";
import { MealAddForm } from "./meals/MealAddForm";

interface MealsScreenProps {
  onClose: () => void;
}

export function MealsScreen({ onClose }: MealsScreenProps) {
  const insets = useSafeAreaInsets();
  const [showAddForm, setShowAddForm] = useState(false);

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
  const { goals, windowStart, windowEnd, breakfastTime, lunchTime, dinnerTime } =
    useMacroGoals();

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

  // Templates modal + savedFoods cache
  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [allSavedFoods, setAllSavedFoods] = useState<SavedFood[]>([]);

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
    loadingRecent,
    refetch: fetchRecentAndFavorites,
  } = useRecentAndFavorites();
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Debounced saved-foods search results, derived from searchQuery.
  const { searchResults, searching } = useSavedFoodsSearch(searchQuery);

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

  // Fetch all saved foods once (for the template picker)
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
    if (activeTab !== "today" && (searchQuery.trim().length >= 2 || showAddForm)) {
      setActiveTab("today");
    }
  }, [activeTab, searchQuery, showAddForm]);

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
        useInventory && !!inventoryMatch && (inventoryMatch.quantity ?? 0) > 0;
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

      if (willUseInventory && inventoryMatch) {
        await consumeOneInventoryUnit(inventoryMatch.id);
      }

      // Clear state
      setShowFoodPreview(false);
      setPreviewFood(null);
      setScannedBarcode(null);
      setInventoryMatch(null);

      // Trigger undo snackbar
      if (inserted?.id) {
        const label = scaledCalories
          ? `Logged ${name} · ${scaledCalories} cal`
          : `Logged ${name}`;
        showUndoFor(
          inserted.id,
          label,
          willUseInventory && inventoryMatch ? inventoryMatch.id : null,
        );
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

      // Clear state
      setShowManualEntry(false);
      setScannedBarcode(null);

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

  // Handle recent food selection
  const handleRecentFoodPress = (food: SavedFood) => {
    setPreviewFood(food);
    setPreviewSource("saved");
    setScannedBarcode(food.barcode);
    setPreviewWasEdited(false);
    setShowFoodPreview(true);
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

  // Open form with viewing date as default
  const handleOpenAddForm = () => {
    addForm.setSelectedDate(viewingDate);
    setShowAddForm(true);
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
        logged_at: new Date().toISOString(),
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
      setShowAddForm(false);

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

  const handleSaveMealEdit = async (updates: {
    name: string;
    meal_type: MealType;
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fats: number | null;
    sugars: number | null;
    sodium_mg: number | null;
    fiber_g: number | null;
  }) => {
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

  // Pace coach for today's view only. (`isViewingToday` is a function
  // defined above; cache its result here for memo deps.)
  const viewingToday = viewingDateStr === todayStr;
  const mealTimes = useMemo(
    () => ({ breakfast: breakfastTime, lunch: lunchTime, dinner: dinnerTime }),
    [breakfastTime, lunchTime, dinnerTime]
  );
  const caloriePace: MealPaceState | null = useMemo(() => {
    if (!viewingToday) return null;
    return computeMealPace({
      currentValue: dayTotals.calories,
      goal: goals.calories,
      windowStart,
      windowEnd,
      mealTimes,
      macro: "calories",
    });
  }, [viewingToday, dayTotals.calories, goals.calories, windowStart, windowEnd, mealTimes]);
  const proteinPace: MealPaceState | null = useMemo(() => {
    if (!viewingToday) return null;
    return computeMealPace({
      currentValue: dayTotals.protein,
      goal: goals.protein,
      windowStart,
      windowEnd,
      mealTimes,
      macro: "protein",
    });
  }, [viewingToday, dayTotals.protein, goals.protein, windowStart, windowEnd, mealTimes]);

  // Search-filtered subset of dayMeals (used for the list rendering only).
  const filteredDayMeals = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q === "") return dayMeals;
    return dayMeals.filter((m) => m.name.toLowerCase().includes(q));
  }, [dayMeals, searchQuery]);

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

  // Group meals by meal type
  const getMealsGroupedByType = (): Record<MealType, MealLog[]> => {
    const grouped: Record<MealType, MealLog[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
      dessert: [],
    };

    filteredDayMeals.forEach((meal) => {
      grouped[meal.meal_type].push(meal);
    });

    return grouped;
  };

  const groupedMealsByType = getMealsGroupedByType();

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header — back, search (with barcode), add — mirrors Food Inventory */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.searchBar}>
            <Search size={20} color={colors.mutedForeground} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search foods..."
              placeholderTextColor={colors.mutedForeground}
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
                <X size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => setShowBarcodeScanner(true)}
                activeOpacity={0.7}
                style={styles.searchActionButton}
              >
                <ScanBarcode size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={styles.headerAddButton}
            onPress={handleOpenAddForm}
            activeOpacity={0.7}
            disabled={showAddForm}
          >
            <Plus size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Fixed Refresh Indicator */}
        {refreshing && (
          <View style={styles.refreshIndicator}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        )}

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="transparent"
              colors={["transparent"]}
            />
          }
        >
          {/* Title (Share moved here from header) */}
          <View style={styles.titleContainer}>
            <Utensils size={32} color="#F97316" strokeWidth={2} />
            <Text style={styles.pageTitle}>Meals & Snacks</Text>
            <TouchableOpacity
              onPress={handleExportCsv}
              disabled={exporting}
              style={styles.titleShareButton}
              activeOpacity={0.7}
            >
              <Share2
                size={22}
                color={exporting ? colors.mutedForeground : colors.foreground}
              />
            </TouchableOpacity>
          </View>

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
                <ChevronLeft size={28} color={colors.foreground} />
              </TouchableOpacity>

              <Text style={styles.dateText}>{formatViewingDate(viewingDate)}</Text>

              <TouchableOpacity
                onPress={goToNextDay}
                style={[styles.navArrow, !canGoForward() && styles.navArrowDisabled]}
                activeOpacity={0.7}
                disabled={!canGoForward()}
              >
                <ChevronRight
                  size={28}
                  color={canGoForward() ? colors.foreground : colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>
          </Animated.View>

            {/* Jump to Today Button */}
            {!isViewingToday() && (
              <TouchableOpacity
                style={styles.jumpToTodayButton}
                onPress={goToToday}
                activeOpacity={0.7}
              >
                <Calendar size={16} color="#FFFFFF" />
                <Text style={styles.jumpToTodayText}>Jump to Today</Text>
              </TouchableOpacity>
            )}

            {/* Tab pills: Today / Insights. Hidden while the add form is
                up — that flow takes over the surface. */}
            {!showAddForm && (
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

            {/* ── TODAY TAB ── logging surface */}
            {!showAddForm && activeTab === "today" && (
              <>
                {/* Nutrition Summary (rings + bars + compact tier C) */}
                <MealsNutritionCard
                  label={getNutritionLabel(viewingDate)}
                  totals={dayTotals}
                  goals={goals}
                />

                {/* Pace coach (today only) */}
                {viewingToday && (
                  <View style={{ marginHorizontal: 20, marginBottom: 12 }}>
                    <MealsPaceLines
                      caloriePace={caloriePace}
                      proteinPace={proteinPace}
                    />
                  </View>
                )}

                {/* Search Results — from your saved foods library */}
                {searchQuery.trim().length >= 2 && (
                  <View style={styles.searchResults}>
                    <Text style={styles.searchResultsHeader}>
                      {searching
                        ? "Searching…"
                        : searchResults.length === 0
                          ? `No saved foods match "${searchQuery.trim()}". Scan a barcode or tap + to add it.`
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
                  </View>
                )}

                {/* Recent Foods (Quick Add) — promoted above meal sections
                    so the fastest path to logging is one tap from here. */}
                <RecentFoodsRow
                  recentFoods={recentFoods}
                  favorites={favorites}
                  onFoodPress={handleRecentFoodPress}
                  onFoodLongPress={handleToggleFavorite}
                  loading={loadingRecent}
                />

                {/* My Meals (templates) entry point */}
                <TouchableOpacity
                  onPress={() => setTemplatesVisible(true)}
                  style={styles.templatesButton}
                  activeOpacity={0.7}
                >
                  <Utensils size={16} color="#3B82F6" />
                  <Text style={styles.templatesButtonText}>My Meals — log a saved template</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── INSIGHTS TAB ── reflective stats */}
            {!showAddForm && activeTab === "insights" && (
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

                <TouchableOpacity
                  onPress={() => setWeeklySummaryVisible(true)}
                  style={styles.weeklySummaryButton}
                  activeOpacity={0.7}
                >
                  <BarChart3 size={16} color="#F97316" />
                  <Text style={styles.weeklySummaryButtonText}>
                    Weekly Summary
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setQuickAdjustVisible(true)}
                  style={styles.quickAdjustButton}
                  activeOpacity={0.7}
                >
                  <Zap size={16} color="#F97316" />
                  <Text style={styles.quickAdjustButtonText}>
                    Quick Adjustment — calories only
                  </Text>
                </TouchableOpacity>
              </>
            )}

          {/* Add Form */}
          {showAddForm && (
            <MealAddForm
              form={addForm}
              recentFoods={recentFoods}
              favorites={favorites}
              onChipPress={addForm.fillFromChip}
              onCancel={() => {
                resetForm();
                setShowAddForm(false);
              }}
              onSubmit={handleAddMeal}
            />
          )}

            {/* Meals Section - Grouped by Type (Today tab only; on Insights
                the logged-food list is hidden to keep that view reflective) */}
            {(showAddForm || activeTab === "today") && (
              <MealsDayList
                loadingDay={loadingDay}
                dayMeals={dayMeals}
                groupedMealsByType={groupedMealsByType}
                onEditMeal={setEditingMeal}
                onDeleteMeal={handleDeleteMeal}
              />
            )}

            {/* Bottom Spacing */}
            <View style={{ height: 40 }} />
          </ScrollView>
      </View>

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
        onClose={() => setEditingMeal(null)}
        onSave={handleSaveMealEdit}
      />

      {/* Templates Modal */}
      <MealTemplatesModal
        visible={templatesVisible}
        savedFoods={allSavedFoods}
        todayDate={viewingDateStr}
        onClose={() => setTemplatesVisible(false)}
        onLogged={async () => {
          setMealsCache((prev) => {
            const next = new Map(prev);
            next.delete(viewingDateStr);
            return next;
          });
          await fetchMealsForDate(viewingDate, true);
          await fetchRecentAndFavorites();
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

      {/* Undo snackbar */}
      <MealUndoSnackbar
        visible={lastLogId !== null}
        label={lastLogLabel}
        onUndo={handleUndoLastLog}
      />
    </>
  );
}
