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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, Package, Pencil } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { FoodInventoryItemWithCategories } from "@/src/types/track";

const SCREEN_WIDTH = Dimensions.get("window").width;

interface ViewFoodDetailsScreenProps {
  item: FoodInventoryItemWithCategories;
  onClose: () => void;
}

export function ViewFoodDetailsScreen({ item, onClose }: ViewFoodDetailsScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
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

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Not set";
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric"
    });
  };

  const renderSection = (title: string, content: React.ReactNode) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionContent}>
        {content}
      </View>
    </View>
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
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push(`/(tabs)/track/food-inventory/edit/${item.id}`)}
            style={styles.editButton}
          >
            <Pencil size={20} color="#FFFFFF" />
            <Text style={styles.editText}>Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
                <Package size={80} color={colors.mutedForeground} />
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
              {renderDetailRow("Total Quantity", `${item.total_quantity} ${item.unit}`)}
              {item.storage_type === 'multi-location' && (
                <>
                  {renderDetailRow("Ready to Consume", `${item.ready_quantity} ${item.unit}`)}
                  {renderDetailRow("In Storage", `${item.storage_quantity} ${item.unit}`)}
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
                      <View key={cat.id} style={styles.tag}>
                        <Text style={styles.tagText}>{cat.name}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              {item.subcategories.length > 0 && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Subcategories</Text>
                  <View style={styles.tagsContainer}>
                    {item.subcategories.map(sub => (
                      <View key={sub.id} style={[styles.tag, styles.subTag]}>
                        <Text style={[styles.tagText, styles.subTagText]}>{sub.name}</Text>
                      </View>
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
              {renderDetailRow("Expiration Date", formatDate(item.expiration_date))}
              {renderDetailRow("Added", formatDate(item.created_at))}
              {renderDetailRow("Last Updated", formatDate(item.updated_at))}
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
    backgroundColor: "#0A0F1E",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  editText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
  },
  imageSection: {
    backgroundColor: "#FFFFFF",
    paddingBottom: 16,
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
    paddingVertical: 24,
  },
  productImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
  },
  imagePlaceholder: {
    width: 200,
    height: 200,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 24,
    alignSelf: "center",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 8,
    gap: 6,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D1D5DB",
  },
  paginationDotActive: {
    backgroundColor: "#111827",
    width: 8,
    height: 8,
  },
  titleSection: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  productName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  productBrand: {
    fontSize: 18,
    color: "#6B7280",
    marginBottom: 2,
  },
  productFlavor: {
    fontSize: 16,
    color: "#9CA3AF",
  },
  section: {
    backgroundColor: "#FFFFFF",
    marginTop: 8,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  sectionContent: {
    paddingHorizontal: 20,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: "#111827",
    flex: 1,
    textAlign: "right",
  },
  locationItem: {
    padding: 12,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
    marginBottom: 8,
  },
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  locationName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  locationQuantity: {
    fontSize: 16,
    fontWeight: "700",
    color: "#8B5CF6",
  },
  locationStatus: {
    fontSize: 12,
    color: "#6B7280",
    marginBottom: 4,
  },
  locationNotes: {
    fontSize: 12,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    flex: 1,
    justifyContent: "flex-end",
  },
  tag: {
    backgroundColor: "#E9D5FF",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tagText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#7C3AED",
  },
  subTag: {
    backgroundColor: "#DBEAFE",
  },
  subTagText: {
    color: "#2563EB",
  },
  notesContainer: {
    paddingVertical: 8,
  },
  notesText: {
    fontSize: 14,
    color: "#111827",
    marginTop: 8,
    lineHeight: 20,
  },
});
