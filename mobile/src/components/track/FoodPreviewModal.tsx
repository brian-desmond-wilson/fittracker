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
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Button, SectionHeader } from "@/src/components/ui";
import { SavedFood, MealType } from "@/src/types/track";
import { ProductData } from "@/src/services/openFoodFactsApi";
import { InventoryMatchSummary } from "@/src/services/foodInventoryMatchService";
import {
  FoodCorrectionModal,
  FoodCorrectionValues,
} from "./FoodCorrectionModal";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
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
        !!inventoryMatch && inventoryMatch.quantity > 0,
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
            <X size={icons.lg} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Food Details</Text>
          {source === "saved" && onToggleFavorite && (
            <TouchableOpacity
              onPress={handleToggleFavorite}
              style={styles.favoriteButton}
            >
              {/* Amber, not brand: a filled gold star is the platform-wide
                  "favourite" convention, and amber was never one of the four
                  domain accents the every-control-is-brand rule governs. */}
              <Star
                size={icons.lg}
                color={isFavorite ? colors.warning : colors.textMuted}
                fill={isFavorite ? colors.warning : "transparent"}
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
                <Minus size={icons.md} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.servingValue}>{servings}</Text>
              <TouchableOpacity
                onPress={handleIncrementServings}
                style={styles.servingButton}
                activeOpacity={0.7}
              >
                <Plus size={icons.md} color={colors.text} />
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
              <SectionHeader
                title="Nutrition"
                badge={
                  <>
                    {wasAutoScaled && !wasUserCorrected && (
                      <Badge label="auto-scaled" tone="neutral" />
                    )}
                    {isPer100Only && (
                      <Badge label="per 100 g/mL" tone="warning" />
                    )}
                    {wasUserCorrected && <Badge label="edited" tone="meals" />}
                  </>
                }
                action={
                  onEditFood ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      label="Edit"
                      icon={Pencil}
                      onPress={handleOpenCorrection}
                    />
                  ) : undefined
                }
              />
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
                    selectedMealType === type.value && styles.mealTypeButtonActive,
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
            <Package size={icons.md} color={colors.text} />
            <View style={styles.inventoryText}>
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
              trackColor={{ false: colors.surface2, true: colors.brand }}
              thumbColor={colors.text}
              disabled={inventoryMatch.quantity <= 0}
            />
          </View>
        )}

        {/* Action Buttons */}
        <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
          {source === "api" && onSaveToLibrary && (
            <View style={styles.actionButton}>
              <Button
                variant="secondary"
                label="Save to Library"
                onPress={handleSaveToLibrary}
                fluid
              />
            </View>
          )}
          <View style={styles.actionButton}>
            <Button label="Log Meal" onPress={handleLogMeal} fluid />
          </View>
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
    marginBottom: spacing.md,
  },
  per100Hint: {
    ...typography.caption,
    color: colors.warning,
    marginTop: spacing.sm,
    fontStyle: "italic",
  },
  // Positive/in-stock banner: the `success` variant of the banner recipe.
  inventoryRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: spacing.md,
    marginHorizontal: spacing.screenGutter,
    backgroundColor: tint(colors.success),
    borderColor: tint(colors.success, 0.3),
    borderWidth: 1,
    borderRadius: radii.row,
    marginBottom: spacing.md,
  },
  inventoryText: {
    flex: 1,
    marginLeft: spacing.md,
  },
  inventoryTitle: {
    ...typography.buttonSm,
    color: colors.text,
  },
  inventorySub: {
    ...typography.caption,
    marginTop: spacing.xs,
  },
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  closeButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.titleBar,
    color: colors.text,
  },
  favoriteButton: {
    padding: spacing.xs,
  },
  placeholder: {
    width: 32,
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.screenGutter,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  productImage: {
    width: 200,
    height: 200,
    borderRadius: radii.row,
    backgroundColor: colors.surface2,
  },
  productInfo: {
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  productName: {
    ...typography.titleRoot,
    color: colors.text,
    textAlign: "center",
    marginBottom: spacing.xs,
  },
  productBrand: {
    ...typography.rowTitle,
    fontWeight: "400",
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  servingSize: {
    ...typography.body,
    color: colors.textMuted,
  },
  servingSection: {
    marginBottom: spacing.xxl,
  },
  sectionTitle: {
    ...typography.section,
    marginBottom: spacing.md,
  },
  servingControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xxl,
    marginBottom: spacing.lg,
  },
  // Neutral chrome, not an accent-colored control: tokenized in place rather
  // than promoted to `IconButton`, which would repaint a stepper brand-green.
  servingButton: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  servingValue: {
    ...typography.titleRoot,
    color: colors.text,
    minWidth: 60,
    textAlign: "center",
  },
  servingPresets: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.md,
  },
  presetButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Grouped, mutually-exclusive selector → solid brand fill + `onBrand` label.
  presetButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  presetButtonText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  presetButtonTextActive: {
    color: colors.onBrand,
  },
  // Sanctioned surviving orange: a `tint(accents.meals)` info fill.
  nutritionSection: {
    marginBottom: spacing.xxl,
    padding: spacing.lg,
    backgroundColor: tint(colors.accents.meals),
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: tint(colors.accents.meals, 0.3),
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
    ...typography.rowTitle,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  nutritionLabel: {
    ...typography.caption,
  },
  sugarsText: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  mealTypeSection: {
    marginBottom: spacing.xxl,
  },
  mealTypeButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  mealTypeButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  // Grouped, mutually-exclusive selector → solid brand fill + `onBrand` label.
  mealTypeButtonActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  mealTypeButtonText: {
    ...typography.buttonSm,
    color: colors.text,
  },
  mealTypeButtonTextActive: {
    color: colors.onBrand,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  /** `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it. */
  actionButton: { flex: 1 },
});
