import React, { useEffect, useState, useRef } from "react";
import {
  Alert,
  Platform,
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
import { ChevronLeft, Package, Pencil, Plus, ScanBarcode } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import { Badge, Button, Card } from "@/src/components/ui";
import { consumeOneUnit, discardItem, type InventoryItemWithState } from "@/src/lib/supabase/inventory";
import { reviewExpiry } from "@/src/lib/expiryPolicy";
import { formatQuantity } from "@/src/lib/units";
import { suggestedRestockThreshold } from "@/src/lib/consumptionRate";
import { fetchConsumptionRates } from "@/src/lib/supabase/shopping";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { parseLocalDate } from "@/src/lib/dates";

const SCREEN_WIDTH = Dimensions.get("window").width;
// A3: the product image lives in a CONTAINED well, not a half-screen white
// band — imageWell is sanctioned as a well on a dark card, not as full-bleed
// flooding of the theme. Carousel paging math must use this width.
const WELL_WIDTH = SCREEN_WIDTH - spacing.screenGutter * 2;

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
  // D5: learned restock threshold — decoration; failure leaves it null.
  const [suggestedThreshold, setSuggestedThreshold] = useState<number | null>(null);
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
    const index = Math.round(scrollPosition / WELL_WIDTH);
    setActiveImageIndex(index);
  };

  useEffect(() => {
    if (isPreview) return;
    let cancelled = false;
    (async () => {
      try {
        const rates = await fetchConsumptionRates(
          getLocalDateString(),
          new Map([[item.id, item.state.totalQuantity]]),
        );
        const est = rates.get(item.id);
        if (!cancelled && est) setSuggestedThreshold(suggestedRestockThreshold(est));
      } catch (e) {
        console.error("suggested threshold fetch failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [item.id, item.state.totalQuantity, isPreview]);

  const applySuggestedThreshold = async () => {
    if (suggestedThreshold === null) return;
    try {
      const { error } = await supabase
        .from("food_inventory")
        .update({ restock_threshold: suggestedThreshold })
        .eq("id", item.id);
      if (error) throw error;
      await onRefresh?.();
    } catch (e) {
      console.error("apply threshold failed:", e);
      Alert.alert("Error", "Couldn't apply the suggested threshold.");
    }
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

  // B1: consume one unit, then hand control to the parent's refresh so the
  // quantities on screen are re-read, never hand-patched.
  const handleUsedOne = async () => {
    try {
      const consumed = await consumeOneUnit(item.id);
      if (consumed === 0) {
        Alert.alert("Nothing to use", `${item.name} is already out of stock.`);
        return;
      }
      await onRefresh?.();
    } catch (e) {
      console.error("consume failed:", e);
      Alert.alert("Error", `Couldn't mark ${item.name} as used.`);
    }
  };

  // B2: discard remaining stock with an optional reason (event trail feeds
  // waste analytics). Distinct from delete — the row and history survive.
  const handleToss = () => {
    const toss = async (reason?: string) => {
      try {
        const discarded = await discardItem(item.id, reason);
        if (discarded === 0) {
          Alert.alert("Nothing to toss", `${item.name} is already out of stock.`);
          return;
        }
        await onRefresh?.();
      } catch (e) {
        console.error("discard failed:", e);
        Alert.alert("Error", `Couldn't toss ${item.name}.`);
      }
    };
    Alert.alert(
      `Toss ${item.name}?`,
      "Remaining stock goes to zero. The item stays in your inventory history.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Expired / spoiled", onPress: () => toss("expired") },
        { text: "Didn't like it", onPress: () => toss("didn't like") },
        { text: "Just toss it", style: "destructive", onPress: () => toss() },
      ],
    );
  };

  // A4: relative expiry phrasing driven by the shared policy. Stale items get
  // the QUIET treatment (neutral) — they belong to the Archive, not to alarm.
  const relativeDays = (d: number): string => {
    const abs = Math.abs(d);
    if (abs >= 60) return `${Math.round(abs / 30)} months`;
    if (abs >= 14) return `${Math.round(abs / 7)} weeks`;
    return `${abs} day${abs === 1 ? "" : "s"}`;
  };
  const expiryStatus = (() => {
    const { expiration, daysLeft } = item.state;
    if (expiration === null || daysLeft === null) return null;
    const review = reviewExpiry(item.state, item.categories.map((c) => c.name));
    if (review === "stale") {
      return { label: "Was expired", tone: "neutral" as const, detail: `${relativeDays(daysLeft)} ago` };
    }
    if (expiration === "expired") {
      return { label: "Expired", tone: "danger" as const, detail: `${relativeDays(daysLeft)} ago` };
    }
    if (expiration === "today") {
      return { label: "Expires today", tone: "warning" as const, detail: "use or move it" };
    }
    if (expiration === "soon") {
      return { label: "Expiring", tone: "warning" as const, detail: `in ${relativeDays(daysLeft)}` };
    }
    return null;
  })();

  const renderSection = (title: string, content: React.ReactNode) => (
    <Card variant="panel" style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {content}
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
          {/* Preview items aren't editable; and with no handler there is no
              action to offer, so the slot stays empty rather than inert. */}
          {!isPreview ? (
            <Button
              label="Edit"
              onPress={() => router.push(`/(tabs)/track/food-inventory/edit/${item.id}`)}
              variant="ghost"
              size="sm"
              icon={Pencil}
            />
          ) : onAddToInventory ? (
            <Button
              label="Add"
              onPress={onAddToInventory}
              variant="ghost"
              size="sm"
              icon={Plus}
            />
          ) : null}
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
            {/* A4: the same urgency the grid shows, with relative phrasing —
                the grid screamed "Expired" while this page whispered a bare
                calendar date. One truth, one weight, both surfaces. */}
            {expiryStatus && (
              <View style={styles.expiryStatusRow}>
                <Badge label={expiryStatus.label} tone={expiryStatus.tone} />
                <Text style={styles.expiryStatusText}>{expiryStatus.detail}</Text>
              </View>
            )}
          </View>

          {/* B1/B2 verbs — the daily-use actions, first-class on the detail
              page (and the VoiceOver-reachable path to what the grid tile's
              pointer-only "−" shortcut does). Hidden in preview mode and when
              there is no stock to act on. Side-by-side pair per style rule 26:
              Button cannot flex, so each sits in a flex:1 wrapper. */}
          {!isPreview && item.state.totalQuantity > 0 && (
            <View style={styles.verbRow}>
              <View style={styles.verbHalf}>
                <Button label="Used one" onPress={handleUsedOne} fluid />
              </View>
              <View style={styles.verbHalf}>
                <Button label="Toss item…" onPress={handleToss} variant="destructive" fluid />
              </View>
            </View>
          )}

          {/* Quantity & Location */}
          {renderSection(
            "Inventory",
            <>
              {renderDetailRow("In Stock", formatQuantity(item.state.totalQuantity, item.unit))}
              {item.storage_type === 'multi-location' && (
                <>
                  {renderDetailRow("Ready to Consume", formatQuantity(item.state.readyQuantity, item.unit))}
                  {renderDetailRow("In Storage", formatQuantity(item.state.storageQuantity, item.unit))}
                </>
              )}
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
              {/* A5: only shown when true — "Requires Refrigeration: No" on
                  milk was the DB contradicting itself in the user's face.
                  Deriving/validating the pair is C5's backend job. */}
              {item.requires_refrigeration ? renderDetailRow("Keep Refrigerated", "Yes") : null}
              {/* D5: the learned threshold, advisory-only. Appears once real
                  consumption data exists for this item and differs from the
                  hand-set value; Apply is one tap, never silent. */}
              {suggestedThreshold !== null && suggestedThreshold !== item.restock_threshold && (
                <View style={styles.suggestionRow}>
                  <Text style={styles.suggestionText}>
                    Suggested threshold: {suggestedThreshold} (based on your usage)
                  </Text>
                  <Button
                    label="Apply"
                    variant="ghost"
                    size="sm"
                    onPress={applySuggestedThreshold}
                  />
                </View>
              )}
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
              {item.barcode ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Barcode</Text>
                  <View style={styles.barcodeValue}>
                    <ScanBarcode size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                    <Text style={styles.barcodeText}>{item.barcode}</Text>
                  </View>
                </View>
              ) : null}
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
    marginHorizontal: spacing.screenGutter,
    marginTop: spacing.md,
    borderRadius: radii.panel,
    overflow: "hidden",
    paddingBottom: spacing.md,
  },
  imageCarousel: {
    width: WELL_WIDTH,
    height: 220,
  },
  imageContainer: {
    width: WELL_WIDTH,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
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
  verbRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.md,
  },
  verbHalf: { flex: 1 },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  suggestionText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  expiryStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  expiryStatusText: { ...typography.caption, color: colors.textMuted },
  barcodeValue: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barcodeText: {
    ...typography.body,
    color: colors.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
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
