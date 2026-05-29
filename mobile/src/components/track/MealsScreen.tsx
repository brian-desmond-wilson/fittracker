import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  Platform,
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
  Trash2,
  Calendar,
  Plus,
  Share2,
  Zap,
  BarChart3,
} from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "@/src/lib/colors";
import { MealLog, MealType, SavedFood, RecentFoodItem } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import {
  getProductByBarcode,
  OpenFoodFactsError,
  ProductData,
} from "@/src/services/openFoodFactsApi";
import {
  getSavedFoodByBarcode,
  createSavedFood,
  getRecentFoods,
  getFavorites,
  getSavedFoods,
  searchSavedFoods,
  toggleFavorite,
} from "@/src/services/savedFoodsService";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { FoodPreviewModal } from "./FoodPreviewModal";
import { QuickActionBar } from "./meals/QuickActionBar";
import { RecentFoodsRow } from "./meals/RecentFoodsRow";
import { RecentFoodChips } from "./meals/RecentFoodChips";
import { ManualFoodEntryModal } from "./meals/ManualFoodEntryModal";
import { MealsNutritionCard } from "./MealsNutritionCard";
import { MacroGoals, sumNutrition } from "@/src/lib/mealMacros";
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

interface MealsScreenProps {
  onClose: () => void;
}

const MEAL_TYPES: { value: MealType; label: string; color: string }[] = [
  { value: "breakfast", label: "Breakfast", color: "#F59E0B" },
  { value: "lunch", label: "Lunch", color: "#10B981" },
  { value: "dinner", label: "Dinner", color: "#3B82F6" },
  { value: "snack", label: "Snack", color: "#8B5CF6" },
  { value: "dessert", label: "Dessert", color: "#EC4899" },
];

// Helper to get local date in YYYY-MM-DD format (not UTC)
const getLocalDateString = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

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

  // Form fields
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [mealName, setMealName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [fiberG, setFiberG] = useState("");

  // Macro goals from profile
  const [goals, setGoals] = useState<MacroGoals>({
    calories: null,
    protein: null,
    carbs: null,
    sodium_mg: null,
    fats: null,
    sugars: null,
    fiber_g: null,
  });

  // Pace window + meal times from profile
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("23:00");
  const [breakfastTime, setBreakfastTime] = useState("08:00");
  const [lunchTime, setLunchTime] = useState("12:00");
  const [dinnerTime, setDinnerTime] = useState("18:00");

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

  // Templates modal + savedFoods cache
  const [templatesVisible, setTemplatesVisible] = useState(false);
  const [allSavedFoods, setAllSavedFoods] = useState<SavedFood[]>([]);

  // Historical meals (last 365 days) for insights/streaks/chart
  const [historicalLogs, setHistoricalLogs] = useState<MealLog[]>([]);

  // Saved-foods search results (debounced from searchQuery)
  const [searchResults, setSearchResults] = useState<SavedFood[]>([]);
  const [searching, setSearching] = useState(false);

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

  // Recent foods & favorites state
  const [recentFoods, setRecentFoods] = useState<RecentFoodItem[]>([]);
  const [favorites, setFavorites] = useState<SavedFood[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

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

  // Format date for display
  const formatViewingDate = (): string => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    if (viewingDateStr === todayStr) {
      return "Today";
    } else if (viewingDateStr === yesterdayStr) {
      return "Yesterday";
    } else {
      return viewingDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  };

  // Get nutrition label based on viewing date
  const getNutritionLabel = (): string => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getLocalDateString(yesterday);

    if (viewingDateStr === todayStr) {
      return "Today's Nutrition";
    } else if (viewingDateStr === yesterdayStr) {
      return "Yesterday's Nutrition";
    } else {
      return `${viewingDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}'s Nutrition`;
    }
  };

  // Fetch meals for a specific date
  const fetchMealsForDate = async (date: Date) => {
    const dateStr = getLocalDateString(date);

    // Check cache first
    if (mealsCache.has(dateStr)) {
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

  // Fetch recent foods and favorites on mount
  const fetchRecentAndFavorites = useCallback(async () => {
    try {
      setLoadingRecent(true);
      const [recentData, favoritesData] = await Promise.all([
        getRecentFoods(5),
        getFavorites(),
      ]);
      setRecentFoods(recentData);
      setFavorites(favoritesData);
    } catch (error) {
      console.error("Error fetching recent/favorites:", error);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentAndFavorites();
  }, [fetchRecentAndFavorites]);

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

  // Fetch last 365 days of meals for insights (streaks/chart). Refetches
  // when the local meals cache for the viewing date is invalidated.
  const fetchHistoricalLogs = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 365);
      const cutoffStr = getLocalDateString(cutoff);
      const { data, error } = await supabase
        .from("meal_logs")
        .select(
          "id, user_id, date, meal_type, name, calories, protein, carbs, fats, sugars, sodium_mg, fiber_g, logged_at, saved_food_id, meal_template_id, servings, uses_inventory, inventory_items"
        )
        .eq("user_id", user.id)
        .gte("date", cutoffStr);
      if (error) throw error;
      setHistoricalLogs((data ?? []) as MealLog[]);
    } catch (error) {
      console.error("Error fetching historical meals:", error);
    }
  }, []);

  useEffect(() => {
    fetchHistoricalLogs();
  }, [fetchHistoricalLogs, mealsCache]);

  // Debounced search across saved_foods (matches name OR brand).
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const hits = await searchSavedFoods(q);
        setSearchResults(hits);
      } catch (error) {
        console.error("Search error:", error);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [searchQuery]);

  const handleSearchResultPress = (food: SavedFood) => {
    setPreviewFood(food);
    setPreviewSource("saved");
    setScannedBarcode(food.barcode);
    setShowFoodPreview(true);
    setSearchQuery("");
  };

  // Fetch macro goals on mount.
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select(
            "target_calories, target_protein_g, target_carbs_g, target_sodium_mg, target_fats_g, target_sugars_g, target_fiber_g, water_window_start, water_window_end, breakfast_time, lunch_time, dinner_time"
          )
          .eq("id", user.id)
          .single();
        if (data) {
          setGoals({
            calories: data.target_calories ?? null,
            protein: data.target_protein_g ?? null,
            carbs: data.target_carbs_g ?? null,
            sodium_mg: data.target_sodium_mg ?? null,
            fats: data.target_fats_g ?? null,
            sugars: data.target_sugars_g ?? null,
            fiber_g: data.target_fiber_g ?? null,
          });
          if (data.water_window_start) setWindowStart(String(data.water_window_start).slice(0, 5));
          if (data.water_window_end) setWindowEnd(String(data.water_window_end).slice(0, 5));
          if (data.breakfast_time) setBreakfastTime(String(data.breakfast_time).slice(0, 5));
          if (data.lunch_time) setLunchTime(String(data.lunch_time).slice(0, 5));
          if (data.dinner_time) setDinnerTime(String(data.dinner_time).slice(0, 5));
        }
      } catch (error) {
        console.error("Error fetching macro goals:", error);
      }
    })();
  }, []);

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
      fetchMealsForDate(viewingDate),
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
      await fetchMealsForDate(viewingDate);
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
      await fetchMealsForDate(viewingDate);

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
      });

      Alert.alert("Success", "Food saved to your library");
      fetchRecentAndFavorites();
    } catch (error: any) {
      console.error("Error saving to library:", error);
      Alert.alert("Error", "Failed to save to library");
    }
  };

  // Handle toggle favorite
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
      await fetchMealsForDate(viewingDate);

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
    setShowFoodPreview(true);
  };

  // Handle recent food chip selection (auto-fill form)
  const handleRecentChipPress = (food: SavedFood) => {
    setMealName(food.name);
    setCalories(food.calories?.toString() || "");
    setProtein(food.protein?.toString() || "");
    setCarbs(food.carbs?.toString() || "");
    setFats(food.fats?.toString() || "");
    setSugars(food.sugars?.toString() || "");
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

  const resetForm = () => {
    setSelectedDate(viewingDate);
    setMealType("breakfast");
    setMealName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setSugars("");
    setSodiumMg("");
    setFiberG("");
  };

  // Open form with viewing date as default
  const handleOpenAddForm = () => {
    setSelectedDate(viewingDate);
    setShowAddForm(true);
  };

  const handleAddMeal = async () => {
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
        await fetchMealsForDate(viewingDate);
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
      await fetchMealsForDate(viewingDate);
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
      await fetchMealsForDate(viewingDate);
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
            await fetchMealsForDate(viewingDate);
          } catch (error: any) {
            console.error("Error deleting meal:", error);
            Alert.alert("Error", "Failed to delete meal");
          }
        },
      },
    ]);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  const getMealTypeColor = (type: MealType) => {
    return MEAL_TYPES.find((t) => t.value === type)?.color || "#6B7280";
  };

  const getMealTypeLabel = (type: MealType) => {
    return MEAL_TYPES.find((t) => t.value === type)?.label || type;
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
  const MEAL_TYPE_ORDER: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

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
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Track</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleExportCsv}
            disabled={exporting}
            style={styles.headerActionButton}
            activeOpacity={0.7}
          >
            <Share2
              size={20}
              color={exporting ? colors.mutedForeground : colors.foreground}
            />
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
          {/* Title */}
          <View style={styles.titleContainer}>
            <Utensils size={32} color="#F97316" strokeWidth={2} />
            <Text style={styles.pageTitle}>Meals & Snacks</Text>
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

              <Text style={styles.dateText}>{formatViewingDate()}</Text>

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

            {/* Nutrition Summary (rings + bars + compact tier C) */}
            <MealsNutritionCard
              label={getNutritionLabel()}
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

            {/* Today's distribution (calories by meal type) */}
            {viewingToday && (
              <View style={styles.distributionWrap}>
                <MealsDistributionBar meals={dayMeals} />
              </View>
            )}

            {/* Insights (streaks + 14-day charts) + Weekly Summary entry */}
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

            {/* Quick Action Bar - Barcode, Search, Add */}
            {!showAddForm && (
              <QuickActionBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onBarcodePress={() => setShowBarcodeScanner(true)}
                onAddPress={handleOpenAddForm}
              />
            )}

            {/* Quick Adjustment — log cal without picking a food */}
            {!showAddForm && (
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
            )}

            {/* Search Results — from your saved foods library */}
            {!showAddForm && searchQuery.trim().length >= 2 && (
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

            {/* Recent Foods Row */}
            {!showAddForm && (
              <RecentFoodsRow
                recentFoods={recentFoods}
                favorites={favorites}
                onFoodPress={handleRecentFoodPress}
                onFoodLongPress={handleToggleFavorite}
                loading={loadingRecent}
              />
            )}

            {/* My Meals (templates) entry point */}
            {!showAddForm && (
              <TouchableOpacity
                onPress={() => setTemplatesVisible(true)}
                style={styles.templatesButton}
                activeOpacity={0.7}
              >
                <Utensils size={16} color="#3B82F6" />
                <Text style={styles.templatesButtonText}>My Meals — log a saved template</Text>
              </TouchableOpacity>
            )}

          {/* Add Form */}
          {showAddForm && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Log Meal</Text>

              {/* Date Selector */}
              <View style={styles.field}>
                <Text style={styles.label}>Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Calendar size={16} color={colors.foreground} />
                  <Text style={styles.dateButtonText}>
                    {selectedDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (date) {
                      setSelectedDate(date);
                    }
                  }}
                  maximumDate={new Date()}
                />
              )}

              {/* Meal Type Selector */}
              <View style={styles.field}>
                <Text style={styles.label}>Meal Type</Text>
                <View style={styles.mealTypeButtons}>
                  {MEAL_TYPES.map((type) => (
                    <TouchableOpacity
                      key={type.value}
                      style={[
                        styles.mealTypeButton,
                        mealType === type.value && {
                          backgroundColor: type.color,
                          borderColor: type.color,
                        },
                      ]}
                      onPress={() => setMealType(type.value)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.mealTypeButtonText,
                          mealType === type.value && styles.mealTypeButtonTextActive,
                        ]}
                      >
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Recent Food Chips for quick fill */}
              <RecentFoodChips
                recentFoods={recentFoods}
                favorites={favorites}
                onChipPress={handleRecentChipPress}
              />

              {/* Meal Name */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Meal Name <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., Grilled chicken with rice"
                  placeholderTextColor={colors.mutedForeground}
                  value={mealName}
                  onChangeText={setMealName}
                />
              </View>

              {/* Nutritional Information */}
              <Text style={styles.subsectionTitle}>Nutrition (optional)</Text>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Calories</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="numeric"
                    value={calories}
                    onChangeText={setCalories}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Protein (g)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={protein}
                    onChangeText={setProtein}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Carbs (g)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={carbs}
                    onChangeText={setCarbs}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Fats (g)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={fats}
                    onChangeText={setFats}
                  />
                </View>
              </View>

              <View style={styles.row}>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Sugars (g)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={sugars}
                    onChangeText={setSugars}
                  />
                </View>
                <View style={styles.halfField}>
                  <Text style={styles.inputLabel}>Sodium (mg)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0"
                    placeholderTextColor={colors.mutedForeground}
                    keyboardType="decimal-pad"
                    value={sodiumMg}
                    onChangeText={setSodiumMg}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.inputLabel}>Fiber (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={fiberG}
                  onChangeText={setFiberG}
                />
              </View>

              {/* Form Buttons */}
              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    resetForm();
                    setShowAddForm(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.saveButton]}
                  onPress={handleAddMeal}
                  activeOpacity={0.7}
                >
                  <Text style={styles.saveButtonText}>Log Meal</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

            {/* Meals Section - Grouped by Type */}
            <View style={styles.mealsSection}>
              {loadingDay ? (
                <Text style={styles.loadingText}>Loading...</Text>
              ) : dayMeals.length === 0 ? (
                <View style={styles.emptyState}>
                  <Utensils size={48} color={colors.mutedForeground} />
                  <Text style={styles.emptyStateText}>No meals logged yet</Text>
                  <Text style={styles.emptyStateSubtext}>
                    Scan a barcode or tap + to add one
                  </Text>
                </View>
              ) : (
                MEAL_TYPE_ORDER.map((mealType) => {
                  const mealsOfType = groupedMealsByType[mealType];
                  if (mealsOfType.length === 0) return null;

                  return (
                    <View key={mealType} style={styles.mealTypeSection}>
                      <View style={styles.mealTypeSectionHeader}>
                        <View
                          style={[
                            styles.mealTypeBadge,
                            { backgroundColor: getMealTypeColor(mealType) },
                          ]}
                        >
                          <Text style={styles.mealTypeBadgeText}>
                            {getMealTypeLabel(mealType)}
                          </Text>
                        </View>
                      </View>
                      {mealsOfType.map((meal) => (
                        <TouchableOpacity
                          key={meal.id}
                          style={styles.mealCard}
                          onPress={() => setEditingMeal(meal)}
                          activeOpacity={0.7}
                        >
                          <View style={styles.mealCardHeader}>
                            <Text style={styles.mealTime}>{formatTime(meal.logged_at)}</Text>
                            <TouchableOpacity
                              onPress={() => handleDeleteMeal(meal.id)}
                              style={styles.deleteButton}
                              activeOpacity={0.7}
                            >
                              <Trash2 size={18} color={colors.mutedForeground} />
                            </TouchableOpacity>
                          </View>
                          <Text style={styles.mealName}>{meal.name}</Text>
                          {(meal.calories || meal.protein || meal.carbs || meal.fats) && (
                            <View style={styles.mealNutrition}>
                              {meal.calories && (
                                <Text style={styles.nutritionText}>{meal.calories} cal</Text>
                              )}
                              {meal.protein && (
                                <Text style={styles.nutritionText}>P: {meal.protein}g</Text>
                              )}
                              {meal.carbs && (
                                <Text style={styles.nutritionText}>C: {meal.carbs}g</Text>
                              )}
                              {meal.fats && (
                                <Text style={styles.nutritionText}>F: {meal.fats}g</Text>
                              )}
                            </View>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })
              )}
            </View>

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
          await fetchMealsForDate(viewingDate);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  refreshIndicator: {
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: colors.foreground,
  },
  content: {
    flex: 1,
  },
  dateNavigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
    marginBottom: 8,
  },
  navArrow: {
    padding: 8,
  },
  navArrowDisabled: {
    opacity: 0.3,
  },
  dateText: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.foreground,
  },
  jumpToTodayButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginHorizontal: 20,
    marginBottom: 16,
  },
  jumpToTodayText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.3)",
  },
  summaryLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 12,
  },
  summaryGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  summaryItem: {
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#F97316",
    marginBottom: 4,
  },
  summaryItemLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  addButtonContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: "#F97316",
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  addSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
    marginTop: 8,
  },
  field: {
    marginBottom: 16,
  },
  halfField: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  dateButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.foreground,
  },
  mealTypeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mealTypeButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mealTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  mealTypeButtonTextActive: {
    color: "#FFFFFF",
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  saveButton: {
    backgroundColor: "#F97316",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  mealsSection: {
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.mutedForeground,
    marginTop: 16,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 8,
  },
  mealTypeSection: {
    marginBottom: 20,
  },
  mealTypeSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  mealCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  mealCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  mealInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mealTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  mealTypeBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  mealTime: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  searchResults: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchResultsHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  searchResultRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.04)",
  },
  searchResultName: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  searchResultBrand: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 1,
  },
  searchResultCals: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginLeft: 8,
  },
  headerActionButton: {
    padding: 6,
  },
  distributionWrap: {
    marginHorizontal: 20,
  },
  weeklySummaryButton: {
    marginHorizontal: 20,
    marginTop: -4,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.3)",
    borderRadius: 10,
    backgroundColor: "rgba(249, 115, 22, 0.06)",
  },
  weeklySummaryButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F97316",
  },
  quickAdjustButton: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#374151",
    borderStyle: "dashed",
    borderRadius: 10,
    backgroundColor: "#1F2937",
  },
  quickAdjustButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#F97316",
  },
  templatesButton: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#374151",
    borderStyle: "dashed",
    borderRadius: 10,
    backgroundColor: "#1F2937",
  },
  templatesButtonText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#3B82F6",
  },
  deleteButton: {
    padding: 4,
  },
  mealName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  mealNutrition: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  nutritionText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
});
