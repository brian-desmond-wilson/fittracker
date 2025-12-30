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
import { ChevronLeft, ChevronRight, Utensils, Trash2, Calendar, Plus } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "@/src/lib/colors";
import { MealLog, MealType, SavedFood, RecentFoodItem } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { getProductByBarcode, ProductData } from "@/src/services/openFoodFactsApi";
import {
  getSavedFoodByBarcode,
  createSavedFood,
  getRecentFoods,
  getFavorites,
  toggleFavorite,
} from "@/src/services/savedFoodsService";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { FoodPreviewModal } from "./FoodPreviewModal";
import { QuickActionBar } from "./meals/QuickActionBar";
import { RecentFoodsRow } from "./meals/RecentFoodsRow";
import { RecentFoodChips } from "./meals/RecentFoodChips";
import { ManualFoodEntryModal } from "./meals/ManualFoodEntryModal";

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

  // Barcode scanner state
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
    setShowBarcodeScanner(false);
    setBarcodeLoading(true);

    try {
      // Step 1: Check local saved_foods first (instant)
      const savedFood = await getSavedFoodByBarcode(barcode);
      if (savedFood) {
        setPreviewFood(savedFood);
        setPreviewSource("saved");
        setScannedBarcode(barcode);
        setShowFoodPreview(true);
        setBarcodeLoading(false);
        return;
      }

      // Step 2: Check Open Food Facts API
      const productData = await getProductByBarcode(barcode);
      if (productData) {
        setPreviewFood(productData);
        setPreviewSource("api");
        setScannedBarcode(barcode);
        setShowFoodPreview(true);
        setBarcodeLoading(false);
        return;
      }

      // Step 3: Not found - open manual entry
      setScannedBarcode(barcode);
      setShowManualEntry(true);
    } catch (error) {
      console.error("Error looking up barcode:", error);
      Alert.alert("Error", "Failed to look up barcode");
    } finally {
      setBarcodeLoading(false);
    }
  };

  // Handle log meal from preview
  const handleLogMealFromPreview = async (
    food: SavedFood | ProductData,
    mealTypeSelected: MealType,
    servings: number
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

      // Log the meal
      const { error } = await supabase.from("meal_logs").insert({
        user_id: user.id,
        date: viewingDateStr,
        meal_type: mealTypeSelected,
        name: name,
        calories: scaledCalories,
        protein: scaledProtein,
        carbs: scaledCarbs,
        fats: scaledFats,
        sugars: scaledSugars,
        saved_food_id: savedFoodId,
        servings: servings,
        uses_inventory: false,
        inventory_items: null,
        logged_at: new Date().toISOString(),
      });

      if (error) throw error;

      // Clear state
      setShowFoodPreview(false);
      setPreviewFood(null);
      setScannedBarcode(null);

      // Invalidate cache and refetch
      setMealsCache((prev) => {
        const newCache = new Map(prev);
        newCache.delete(viewingDateStr);
        return newCache;
      });
      await fetchMealsForDate(viewingDate);

      // Refresh recent foods
      fetchRecentAndFavorites();

      Alert.alert("Success", "Meal logged successfully");
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
          serving_size: foodData.serving_size,
          image_primary_url: null,
          image_front_url: null,
          image_back_url: null,
          is_favorite: false,
        });
        savedFoodId = newSavedFood.id;
      }

      // Log the meal
      const { error } = await supabase.from("meal_logs").insert({
        user_id: user.id,
        date: viewingDateStr,
        meal_type: mealTypeSelected,
        name: foodData.name,
        calories: foodData.calories,
        protein: foodData.protein,
        carbs: foodData.carbs,
        fats: foodData.fats,
        sugars: foodData.sugars,
        saved_food_id: savedFoodId,
        servings: 1,
        uses_inventory: false,
        inventory_items: null,
        logged_at: new Date().toISOString(),
      });

      if (error) throw error;

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

      Alert.alert("Success", "Meal logged successfully");
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
        uses_inventory: false,
        inventory_items: null,
        logged_at: new Date().toISOString(),
      };

      const { error } = await supabase.from("meal_logs").insert([mealData]);

      if (error) throw error;

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

      Alert.alert("Success", "Meal logged successfully");
    } catch (error: any) {
      console.error("Error adding meal:", error);
      Alert.alert("Error", "Failed to log meal");
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

  // Calculate totals for viewing date
  const dayTotals = dayMeals.reduce(
    (acc, meal) => ({
      calories: acc.calories + (meal.calories || 0),
      protein: acc.protein + (meal.protein || 0),
      carbs: acc.carbs + (meal.carbs || 0),
      fats: acc.fats + (meal.fats || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fats: 0 }
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

    dayMeals.forEach((meal) => {
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

            {/* Nutrition Summary */}
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>{getNutritionLabel()}</Text>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{dayTotals.calories}</Text>
                  <Text style={styles.summaryItemLabel}>Calories</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{dayTotals.protein.toFixed(1)}g</Text>
                  <Text style={styles.summaryItemLabel}>Protein</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{dayTotals.carbs.toFixed(1)}g</Text>
                  <Text style={styles.summaryItemLabel}>Carbs</Text>
                </View>
                <View style={styles.summaryItem}>
                  <Text style={styles.summaryValue}>{dayTotals.fats.toFixed(1)}g</Text>
                  <Text style={styles.summaryItemLabel}>Fats</Text>
                </View>
              </View>
            </View>

            {/* Quick Action Bar - Barcode, Search, Add */}
            {!showAddForm && (
              <QuickActionBar
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                onBarcodePress={() => setShowBarcodeScanner(true)}
                onAddPress={handleOpenAddForm}
              />
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

              <View style={styles.field}>
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
                        <View key={meal.id} style={styles.mealCard}>
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
                        </View>
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
        onClose={() => {
          setShowFoodPreview(false);
          setPreviewFood(null);
          setScannedBarcode(null);
        }}
        onLogMeal={handleLogMealFromPreview}
        onSaveToLibrary={previewSource === "api" ? handleSaveToLibrary : undefined}
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
