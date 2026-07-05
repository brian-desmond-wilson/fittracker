import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Image,
  StatusBar,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X, Star, Minus, Plus, Package, Pencil } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { SavedFood, MealType } from "@/src/types/track";
import { ProductData } from "@/src/services/openFoodFactsApi";
import { InventoryMatchSummary } from "@/src/services/foodInventoryMatchService";
import {
  FoodCorrectionModal,
  FoodCorrectionValues,
} from "./FoodCorrectionModal";

const MEAL_TYPES: { value: MealType; label: string; color: string }[] = [
  { value: "breakfast", label: "Breakfast", color: "#F59E0B" },
  { value: "lunch", label: "Lunch", color: "#10B981" },
  { value: "dinner", label: "Dinner", color: "#3B82F6" },
  { value: "snack", label: "Snack", color: "#8B5CF6" },
  { value: "dessert", label: "Dessert", color: "#EC4899" },
];

const SERVING_PRESETS = [0.5, 1, 1.5, 2];

interface FoodPreviewModalProps {
  visible: boolean;
  food: SavedFood | ProductData | null;
  source: "saved" | "api";
  inventoryMatch?: InventoryMatchSummary | null;
  onClose: () => void;
  onLogMeal: (
    food: SavedFood | ProductData,
    mealType: MealType,
    servings: number,
    useInventory: boolean
  ) => void;
  onSaveToLibrary?: (food: ProductData) => void;
  onToggleFavorite?: (food: SavedFood) => void;
  // Called when the user edits nutrition info via the correction modal.
  // The parent should:
  //   - Update the in-flight preview's food prop with the new values
  //   - For saved-source foods, persist the changes to saved_foods
  //     (setting user_corrected=true)
  // For api-source foods, the existing log path already calls
  // createSavedFood, which will pick up the corrected values from the
  // food prop and persist user_corrected=true at that time.
  onEditFood?: (next: FoodCorrectionValues) => Promise<void> | void;
}

export function FoodPreviewModal({
  visible,
  food,
  source,
  inventoryMatch,
  onClose,
  onLogMeal,
  onSaveToLibrary,
  onToggleFavorite,
  onEditFood,
}: FoodPreviewModalProps) {
  const insets = useSafeAreaInsets();
  const [selectedMealType, setSelectedMealType] = useState<MealType>("snack");
  const [servings, setServings] = useState(1);
  // Default the "use from pantry" toggle to on whenever we have a match
  // with stock. Resets on modal open.
  const [useInventory, setUseInventory] = useState(false);
  // Correction modal state
  const [correctionVisible, setCorrectionVisible] = useState(false);
  const [savingCorrection, setSavingCorrection] = useState(false);
  // Track whether the user has corrected this preview in-session — used
  // for the "(edited)" pill on api-source foods that haven't been saved
  // yet (saved-source foods read user_corrected directly off the row).
  const [sessionEdited, setSessionEdited] = useState(false);
  useEffect(() => {
    if (visible) {
      setUseInventory(
        !!inventoryMatch && (inventoryMatch.quantity ?? 0) > 0,
      );
      setSessionEdited(false);
    }
  }, [visible, inventoryMatch]);

  if (!food) return null;

  // Normalize food data from different sources
  const name = food.name;
  const brand = "brand" in food ? food.brand : null;
  const calories = food.calories;
  const protein = food.protein;
  const carbs = food.carbs;
  const fats = food.fats;
  const sugars = "sugars" in food ? food.sugars : null;
  const servingSize =
    "serving_size" in food ? food.serving_size : "servingSize" in food ? food.servingSize : null;
  const imageUrl =
    "image_primary_url" in food
      ? food.image_primary_url
      : "imagePrimaryUrl" in food
      ? food.imagePrimaryUrl
      : null;
  const isFavorite = "is_favorite" in food ? food.is_favorite : false;

  // Calculate scaled nutrition
  const scaledCalories = calories ? Math.round(calories * servings) : null;
  const scaledProtein = protein ? Math.round(protein * servings * 10) / 10 : null;
  const scaledCarbs = carbs ? Math.round(carbs * servings * 10) / 10 : null;
  const scaledFats = fats ? Math.round(fats * servings * 10) / 10 : null;
  const scaledSugars = sugars ? Math.round(sugars * servings * 10) / 10 : null;

  const handleDecrementServings = () => {
    setServings((prev) => Math.max(0.5, prev - 0.5));
  };

  const handleIncrementServings = () => {
    setServings((prev) => Math.min(10, prev + 0.5));
  };

  const handleLogMeal = () => {
    onLogMeal(food, selectedMealType, servings, useInventory);
  };

  const wasUserCorrected =
    sessionEdited ||
    ("user_corrected" in (food ?? {}) && (food as SavedFood).user_corrected);
  const wasAutoScaled =
    "auto_scaled" in (food ?? {}) && (food as SavedFood | (typeof food & { auto_scaled?: boolean })).auto_scaled === true;
  // per100Only is a presentation-only flag from OFF lookups (not persisted)
  // signalling we're showing per-100 g/mL values verbatim because no
  // serving size was available. Edited or auto-scaled foods suppress it.
  const isPer100Only =
    !sessionEdited &&
    !wasUserCorrected &&
    !wasAutoScaled &&
    "per100Only" in (food ?? {}) &&
    (food as typeof food & { per100Only?: boolean }).per100Only === true;

  const handleOpenCorrection = () => {
    setCorrectionVisible(true);
  };

  const handleSaveCorrection = async (next: FoodCorrectionValues) => {
    if (!onEditFood) {
      setCorrectionVisible(false);
      return;
    }
    try {
      setSavingCorrection(true);
      await onEditFood(next);
      setSessionEdited(true);
      setCorrectionVisible(false);
    } catch (error) {
      console.error("Failed to save correction:", error);
    } finally {
      setSavingCorrection(false);
    }
  };

  const handleSaveToLibrary = () => {
    if (source === "api" && onSaveToLibrary) {
      onSaveToLibrary(food as ProductData);
    }
  };

  const handleToggleFavorite = () => {
    if (source === "saved" && onToggleFavorite) {
      onToggleFavorite(food as SavedFood);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Food Details</Text>
          {source === "saved" && onToggleFavorite && (
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.favoriteButton}
            >
              <Star
                size={24}
                color={isFavorite ? "#F59E0B" : colors.mutedForeground}
                fill={isFavorite ? "#F59E0B" : "transparent"}
              />
            </TouchableOpacity>
          )}
          {source === "api" && <View style={styles.placeholder} />}
        </View>

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Product Image */}
          {imageUrl && (
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: imageUrl }}
                style={styles.productImage}
                resizeMode="contain"
              />
            </View>
          )}

          {/* Product Name & Brand */}
          <View style={styles.productInfo}>
            <Text style={styles.productName}>{name}</Text>
            {brand && <Text style={styles.productBrand}>{brand}</Text>}
            {servingSize && (
              <Text style={styles.servingSize}>Serving: {servingSize}</Text>
            )}
          </View>

          {/* Serving Size Selector */}
          <View style={styles.servingSection}>
            <Text style={styles.sectionTitle}>Servings</Text>
            <View style={styles.servingControls}>
              <TouchableOpacity
                onPress={handleDecrementServings}
                style={styles.servingButton}
                activeOpacity={0.7}
              >
                <Minus size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={styles.servingValue}>{servings}</Text>
              <TouchableOpacity
                onPress={handleIncrementServings}
                style={styles.servingButton}
                activeOpacity={0.7}
              >
                <Plus size={20} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={styles.servingPresets}>
              {SERVING_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset}
                  style={[
                    styles.presetButton,
                    servings === preset && styles.presetButtonActive,
                  ]}
                  onPress={() => setServings(preset)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.presetButtonText,
                      servings === preset && styles.presetButtonTextActive,
                    ]}
                  >
                    {preset}x
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Nutrition Info (scaled) */}
          <View style={styles.nutritionSection}>
            <View style={styles.nutritionHeader}>
              <View style={styles.nutritionTitleRow}>
                <Text style={styles.sectionTitle}>Nutrition</Text>
                {wasAutoScaled && !wasUserCorrected && (
                  <View style={styles.autoScaledPill}>
                    <Text style={styles.autoScaledPillText}>auto-scaled</Text>
                  </View>
                )}
                {isPer100Only && (
                  <View style={styles.per100Pill}>
                    <Text style={styles.per100PillText}>per 100 g/mL</Text>
                  </View>
                )}
                {wasUserCorrected && (
                  <View style={styles.editedPill}>
                    <Text style={styles.editedPillText}>edited</Text>
                  </View>
                )}
              </View>
              {onEditFood && (
                <TouchableOpacity
                  onPress={handleOpenCorrection}
                  style={styles.editButton}
                  activeOpacity={0.7}
                >
                  <Pencil size={14} color="#F97316" />
                  <Text style={styles.editButtonText}>Edit</Text>
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>
                  {scaledCalories ?? "-"}
                </Text>
                <Text style={styles.nutritionLabel}>Calories</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>
                  {scaledProtein !== null ? `${scaledProtein}g` : "-"}
                </Text>
                <Text style={styles.nutritionLabel}>Protein</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>
                  {scaledCarbs !== null ? `${scaledCarbs}g` : "-"}
                </Text>
                <Text style={styles.nutritionLabel}>Carbs</Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={styles.nutritionValue}>
                  {scaledFats !== null ? `${scaledFats}g` : "-"}
                </Text>
                <Text style={styles.nutritionLabel}>Fats</Text>
              </View>
            </View>
            {scaledSugars !== null && (
              <Text style={styles.sugarsText}>Sugars: {scaledSugars}g</Text>
            )}
            {isPer100Only && (
              <Text style={styles.per100Hint}>
                Open Food Facts didn't include a serving size. Tap Edit to set yours.
              </Text>
            )}
          </View>

          {/* Meal Type Selector */}
          <View style={styles.mealTypeSection}>
            <Text style={styles.sectionTitle}>Log as</Text>
            <View style={styles.mealTypeButtons}>
              {MEAL_TYPES.map((type) => (
                <TouchableOpacity
                  key={type.value}
                  style={[
                    styles.mealTypeButton,
                    selectedMealType === type.value && {
                      backgroundColor: type.color,
                      borderColor: type.color,
                    },
                  ]}
                  onPress={() => setSelectedMealType(type.value)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.mealTypeButtonText,
                      selectedMealType === type.value &&
                        styles.mealTypeButtonTextActive,
                    ]}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Inventory match (only shown when this food matches an inventory item) */}
        {inventoryMatch && (
          <View style={styles.inventoryRow}>
            <Package size={18} color={colors.foreground} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.inventoryTitle}>
                Use from pantry
              </Text>
              <Text style={styles.inventorySub}>
                {inventoryMatch.quantity} {inventoryMatch.unit ?? "in stock"} ·{" "}
                {inventoryMatch.name}
              </Text>
            </View>
            <Switch
              value={useInventory}
              onValueChange={setUseInventory}
              trackColor={{ false: "#374151", true: "#22C55E" }}
              thumbColor="#FFFFFF"
              disabled={(inventoryMatch.quantity ?? 0) <= 0}
            />
          </View>
        )}

        {/* Action Buttons */}
        <View style={[styles.actions, { paddingBottom: insets.bottom + 16 }]}>
          {source === "api" && onSaveToLibrary && (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSaveToLibrary}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>Save to Library</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.primaryButton,
              source === "saved" && styles.primaryButtonFull,
            ]}
            onPress={handleLogMeal}
            activeOpacity={0.7}
          >
            <Text style={styles.primaryButtonText}>Log Meal</Text>
          </TouchableOpacity>
        </View>

        {/* Nutrition correction modal (per-serving) */}
        <FoodCorrectionModal
          visible={correctionVisible}
          saving={savingCorrection}
          initialValues={{
            name: food.name,
            brand: "brand" in food ? food.brand : null,
            serving_size: servingSize,
            calories: food.calories ?? null,
            protein: food.protein ?? null,
            carbs: food.carbs ?? null,
            fats: food.fats ?? null,
            sugars: "sugars" in food ? food.sugars : null,
            sodium_mg: "sodium_mg" in food ? (food as any).sodium_mg : null,
            fiber_g: "fiber_g" in food ? (food as any).fiber_g : null,
          }}
          onClose={() => setCorrectionVisible(false)}
          onSave={handleSaveCorrection}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  nutritionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  nutritionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editedPill: {
    backgroundColor: "rgba(249, 115, 22, 0.18)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  editedPillText: {
    color: "#F97316",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  autoScaledPill: {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  autoScaledPillText: {
    color: "#3B82F6",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  per100Pill: {
    backgroundColor: "rgba(234, 179, 8, 0.18)",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  per100PillText: {
    color: "#EAB308",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  per100Hint: {
    fontSize: 12,
    color: "#EAB308",
    marginTop: 8,
    fontStyle: "italic",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.4)",
  },
  editButtonText: {
    color: "#F97316",
    fontSize: 12,
    fontWeight: "700",
  },
  inventoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    borderColor: "rgba(34, 197, 94, 0.3)",
    borderWidth: 1,
    borderRadius: 10,
    marginBottom: 12,
  },
  inventoryTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  inventorySub: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.foreground,
  },
  favoriteButton: {
    padding: 4,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  productImage: {
    width: 200,
    height: 200,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  productInfo: {
    alignItems: "center",
    marginBottom: 24,
  },
  productName: {
    fontSize: 22,
    fontWeight: "bold",
    color: colors.foreground,
    textAlign: "center",
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 16,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  servingSize: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  servingSection: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
  },
  servingControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    marginBottom: 16,
  },
  servingButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  servingValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#F97316",
    minWidth: 60,
    textAlign: "center",
  },
  servingPresets: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 12,
  },
  presetButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetButtonActive: {
    backgroundColor: "#F97316",
    borderColor: "#F97316",
  },
  presetButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  presetButtonTextActive: {
    color: "#FFFFFF",
  },
  nutritionSection: {
    marginBottom: 24,
    padding: 16,
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(249, 115, 22, 0.3)",
  },
  nutritionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  nutritionItem: {
    alignItems: "center",
    flex: 1,
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#F97316",
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  sugarsText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    marginTop: 12,
  },
  mealTypeSection: {
    marginBottom: 24,
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
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: "#F97316",
    alignItems: "center",
  },
  primaryButtonFull: {
    flex: 2,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
});
