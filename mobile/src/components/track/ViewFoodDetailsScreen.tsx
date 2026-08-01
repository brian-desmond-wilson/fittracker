import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Package, Pencil, Plus } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import { Badge, Button, Card } from "@/src/components/ui";
import type { InventoryItemWithState } from "@/src/lib/supabase/inventory";
import { parseLocalDate } from "@/src/lib/dates";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface ViewFoodDetailsScreenProps {
  item: InventoryItemWithState;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
  isPreview?: boolean;
  onAddToInventory?: () => void;
}

const DATE_FORMAT = { month: "long", day: "numeric", year: "numeric" } as const;

/** For TIMESTAMPTZ columns (`created_at`, `updated_at`) — full ISO instants,
 *  which `new Date` resolves to the correct local moment. */
const formatTimestamp = (dateStr: string | null) => {
  if (!dateStr) return "Not set";
  return new Date(dateStr).toLocaleDateString("en-US", DATE_FORMAT);
};

/** For DATE columns (`expiration_date`) — a bare YYYY-MM-DD, which `new Date`
 *  reads as UTC midnight and so renders one day EARLY west of Greenwich.
 *  Must match what the grid shows for the same item (FoodInventoryScreen's
 *  `formatExpirationDate` goes through the same helper). */
const formatCalendarDate = (dateStr: string | null) => {
  if (!dateStr) return "Not set";
  return parseLocalDate(dateStr).toLocaleDateString("en-US", DATE_FORMAT);
};

export function ViewFoodDetailsScreen({ item, onClose, onRefresh, isPreview = false, onAddToInventory }: ViewFoodDetailsScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  // Collect all available images
  const images = [
    item.image_primary_url,
    item.image_front_url,
    item.image_back_url,
    item.image_side_url,
  ].filter((url): url is string => url !== null && url !== undefined);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / SCREEN_WIDTH);
    setActiveImageIndex(index);
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  };

  const renderSection = (title: string, content: React.ReactNode) => (
    <Card variant="panel" style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {content}
      </View>
    </Card>
  );

  const renderDetailRow = (label: string, value: string | number | null | undefined) => (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "Not set"}</Text>
    </View>
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          {isPreview ? (
            <Button
              label="Add"
              onPress={() => onAddToInventory?.()}
              variant="ghost"
              size="sm"
              icon={Plus}
            />
          ) : (
            <Button
              label="Edit"
              onPress={() => router.push(`/(tabs)/track/food-inventory/edit/${item.id}`)}
              variant="ghost"
              size="sm"
              icon={Pencil}
            />
          )}
        </View>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        >
          {/* Product Image Carousel */}
          <View style={styles.imageSection}>
            {images.length > 0 ? (
              <>
                <ScrollView
                  ref={scrollViewRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  style={styles.imageCarousel}
                >
                  {images.map((imageUrl, index) => (
                    <View key={index} style={styles.imageContainer}>
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.productImage}
                        resizeMode="contain"
                      />
                    </View>
                  ))}
                </ScrollView>

                {/* Pagination Dots */}
                {images.length > 1 && (
                  <View style={styles.paginationContainer}>
                    {images.map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.paginationDot,
                          index === activeImageIndex && styles.paginationDotActive,
                        ]}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Package size={80} color={colors.textFaint} />
              </View>
            )}
          </View>

          {/* Product Name & Brand */}
          <View style={styles.titleSection}>
            <Text style={styles.productName}>{item.name}</Text>
            {item.brand && <Text style={styles.productBrand}>{item.brand}</Text>}
            {item.flavor && <Text style={styles.productFlavor}>{item.flavor}</Text>}
          </View>

          {/* Quantity & Location */}
          {renderSection(
            "Inventory",
            <>
              {renderDetailRow("Total Quantity", `${item.state.totalQuantity} ${item.unit}`)}
              {item.storage_type === 'multi-location' && (
                <>
                  {renderDetailRow("Ready to Consume", `${item.state.readyQuantity} ${item.unit}`)}
                  {renderDetailRow("In Storage", `${item.state.storageQuantity} ${item.unit}`)}
                </>
              )}
              {renderDetailRow("Storage Type", item.storage_type === 'single-location' ? 'Single Location' : 'Multi-Location')}
              {item.storage_type === 'single-location' && item.location && (
                renderDetailRow("Location", item.location.charAt(0).toUpperCase() + item.location.slice(1))
              )}
            </>
          )}

          {/* Multi-Location Details */}
          {item.storage_type === 'multi-location' && item.locations.length > 0 && renderSection(
            "Locations",
            <>
              {item.locations.map((loc, index) => (
                <View key={loc.id} style={styles.locationItem}>
                  <View style={styles.locationHeader}>
                    <Text style={styles.locationName}>
                      {loc.location.charAt(0).toUpperCase() + loc.location.slice(1)}
                    </Text>
                    <Text style={styles.locationQuantity}>{loc.quantity} {item.unit}</Text>
                  </View>
                  <Text style={styles.locationStatus}>
                    {loc.is_ready_to_consume ? 'Ready to Consume' : 'Storage'}
                  </Text>
                  {loc.notes && <Text style={styles.locationNotes}>{loc.notes}</Text>}
                </View>
              ))}
            </>
          )}

          {/* Categories */}
          {(item.categories.length > 0 || item.subcategories.length > 0) && renderSection(
            "Categories",
            <>
              {item.categories.length > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Categories</Text>
                  <View style={styles.tagsContainer}>
                    {item.categories.map(cat => (
                      <Badge key={cat.id} tone="inventory" label={cat.name} />
                    ))}
                  </View>
                </View>
              )}
              {item.subcategories.length > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Subcategories</Text>
                  <View style={styles.tagsContainer}>
                    {item.subcategories.map(sub => (
                      <Badge key={sub.id} tone="neutral" label={sub.name} />
                    ))}
                  </View>
                </View>
              )}
            </>
          )}

          {/* Thresholds */}
          {renderSection(
            "Restock Thresholds",
            <>
              {item.storage_type === 'single-location' && (
                renderDetailRow("Restock Threshold", `${item.restock_threshold} ${item.unit}`)
              )}
              {item.storage_type === 'multi-location' && (
                <>
                  {renderDetailRow("Fridge Restock Threshold", item.fridge_restock_threshold ? `${item.fridge_restock_threshold} ${item.unit}` : "Not set")}
                  {renderDetailRow("Total Restock Threshold", item.total_restock_threshold ? `${item.total_restock_threshold} ${item.unit}` : "Not set")}
                </>
              )}
              {renderDetailRow("Requires Refrigeration", item.requires_refrigeration ? "Yes" : "No")}
            </>
          )}

          {/* Nutrition */}
          {(item.calories || item.protein || item.carbs || item.fats || item.sugars || item.serving_size) && renderSection(
            "Nutritional Information",
            <>
              {renderDetailRow("Serving Size", item.serving_size)}
              {renderDetailRow("Calories", item.calories ? `${item.calories} kcal` : null)}
              {renderDetailRow("Protein", item.protein ? `${item.protein}g` : null)}
              {renderDetailRow("Carbohydrates", item.carbs ? `${item.carbs}g` : null)}
              {renderDetailRow("Fats", item.fats ? `${item.fats}g` : null)}
              {renderDetailRow("Sugars", item.sugars ? `${item.sugars}g` : null)}
            </>
          )}

          {/* Expiration & Dates */}
          {renderSection(
            "Dates",
            <>
              {renderDetailRow("Expiration Date", formatCalendarDate(item.expiration_date))}
              {renderDetailRow("Added", formatTimestamp(item.created_at))}
              {renderDetailRow("Last Updated", formatTimestamp(item.updated_at))}
            </>
          )}

          {/* Additional Info */}
          {(item.barcode || item.notes) && renderSection(
            "Additional Information",
            <>
              {renderDetailRow("Barcode", item.barcode)}
              {item.notes && (
                <View style={styles.notesContainer}>
                  <Text style={styles.detailLabel}>Notes</Text>
                  <Text style={styles.notesText}>{item.notes}</Text>
                </View>
              )}
            </>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  backText: {
    fontSize: 17,
    color: colors.text,
  },
  content: {
    flex: 1,
  },
  // The one sanctioned white surface: product photos are shot on white.
  imageSection: {
    backgroundColor: colors.imageWell,
    paddingBottom: spacing.lg,
  },
  imageCarousel: {
    width: SCREEN_WIDTH,
    height: 250,
  },
  imageContainer: {
    width: SCREEN_WIDTH,
    height: 250,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.xxl,
  },
  productImage: {
    width: 200,
    height: 200,
    borderRadius: radii.control,
  },
  imagePlaceholder: {
    width: 200,
    height: 200,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.xxl,
    alignSelf: "center",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
  },
  paginationDotActive: {
    backgroundColor: colors.brand,
    width: 8,
    height: 8,
  },
  titleSection: {
    padding: spacing.xl,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productName: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  productBrand: {
    fontSize: 18,
    color: colors.textMuted,
    marginBottom: 2,
  },
  productFlavor: {
    fontSize: 16,
    color: colors.textFaint,
  },
  // Fill/radius/border/padding come from `Card variant="panel"`.
  section: {
    marginHorizontal: spacing.screenGutter,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.section,
    marginBottom: spacing.md,
  },
  sectionContent: {},
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textMuted,
    flex: 1,
  },
  detailValue: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    textAlign: "right",
  },
  locationItem: {
    padding: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    marginBottom: spacing.sm,
  },
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  locationName: {
    ...typography.rowTitle,
    color: colors.text,
  },
  // Location identity — one of the two places the inventory violet survives.
  locationQuantity: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accents.inventory,
  },
  locationStatus: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  locationNotes: {
    ...typography.caption,
    color: colors.textFaint,
    fontStyle: "italic",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    flex: 1,
    justifyContent: "flex-end",
  },
  notesContainer: {
    paddingVertical: spacing.sm,
  },
  notesText: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
