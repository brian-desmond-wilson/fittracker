import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StatusBar,
  Alert,
  TextInput,
  Image,
  RefreshControl,
  FlatList,
  Dimensions,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronLeft, Plus, Search, Package, ShoppingCart, ScanBarcode, X, Tag } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import {
  FoodInventoryItem,
  FoodInventoryItemWithLocations,
  FoodLocation,
  FoodCategory,
  FoodSubcategory,
  FoodInventoryItemWithCategories
} from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { RestockModal } from "./RestockModal";
import { CategoryTabs } from "./CategoryTabs";
import { SubcategoryPills } from "./SubcategoryPills";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { getProductByBarcode } from "@/src/services/openFoodFactsApi";

interface FoodInventoryScreenProps {
  onClose: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = 20;
const GRID_GAP = 12;
const NUM_COLUMNS = 3;
const ITEM_WIDTH = (SCREEN_WIDTH - (GRID_PADDING * 2) - (GRID_GAP * (NUM_COLUMNS - 1))) / NUM_COLUMNS;

export function FoodInventoryScreen({ onClose }: FoodInventoryScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Category & Subcategory state
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [subcategories, setSubcategories] = useState<FoodSubcategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>([]);

  // Inventory data state
  const [items, setItems] = useState<FoodInventoryItemWithCategories[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Restock modal state
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockingItem, setRestockingItem] = useState<FoodInventoryItemWithLocations | null>(null);

  // Barcode scanner state
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  // Fetch categories and subcategories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const [categoriesResult, subcategoriesResult] = await Promise.all([
          supabase.from("food_categories").select("*").order("display_order"),
          supabase.from("food_subcategories").select("*").order("display_order"),
        ]);

        if (categoriesResult.error) throw categoriesResult.error;
        if (subcategoriesResult.error) throw subcategoriesResult.error;

        setCategories(categoriesResult.data || []);
        setSubcategories(subcategoriesResult.data || []);

        // Set default selected category to "All Products"
        const allProductsCategory = categoriesResult.data?.find(cat => cat.slug === "all-products");
        if (allProductsCategory) {
          setSelectedCategoryId(allProductsCategory.id);
        }
      } catch (error: any) {
        console.error("Error fetching categories:", error);
      }
    };

    fetchCategories();
    fetchInventory();
  }, []);


  const fetchInventory = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to view inventory");
        return;
      }

      // Fetch food inventory items, locations, and category/subcategory mappings in parallel
      const [foodResult, locationsResult, categoryMapsResult, subcategoryMapsResult] = await Promise.all([
        supabase.from("food_inventory").select("*").eq("user_id", user.id),
        supabase.from("food_inventory_locations").select("*").eq("user_id", user.id),
        supabase.from("food_inventory_category_map").select("*, food_categories(*)").eq("user_id", user.id),
        supabase.from("food_inventory_subcategory_map").select("*, food_subcategories(*)").eq("user_id", user.id),
      ]);

      if (foodResult.error) throw foodResult.error;
      if (locationsResult.error) throw locationsResult.error;
      if (categoryMapsResult.error) throw categoryMapsResult.error;
      if (subcategoryMapsResult.error) throw subcategoryMapsResult.error;

      const foodItems = foodResult.data || [];
      const locations = locationsResult.data || [];
      const categoryMaps = categoryMapsResult.data || [];
      const subcategoryMaps = subcategoryMapsResult.data || [];

      // Combine the data
      const itemsWithCategories: FoodInventoryItemWithCategories[] = foodItems.map(item => {
        const itemLocations = locations.filter(loc => loc.food_inventory_id === item.id);

        // Calculate quantities
        const total_quantity = item.storage_type === 'single-location'
          ? item.quantity
          : itemLocations.reduce((sum, loc) => sum + loc.quantity, 0);

        const ready_quantity = item.storage_type === 'single-location'
          ? item.quantity
          : itemLocations
              .filter(loc => loc.is_ready_to_consume)
              .reduce((sum, loc) => sum + loc.quantity, 0);

        const storage_quantity = item.storage_type === 'single-location'
          ? 0
          : itemLocations
              .filter(loc => !loc.is_ready_to_consume)
              .reduce((sum, loc) => sum + loc.quantity, 0);

        // Get categories and subcategories for this item
        const itemCategories = categoryMaps
          .filter(map => map.food_inventory_id === item.id)
          .map(map => map.food_categories)
          .filter(Boolean) as FoodCategory[];

        const itemSubcategories = subcategoryMaps
          .filter(map => map.food_inventory_id === item.id)
          .map(map => map.food_subcategories)
          .filter(Boolean) as FoodSubcategory[];

        return {
          ...item,
          locations: itemLocations,
          total_quantity,
          ready_quantity,
          storage_quantity,
          categories: itemCategories,
          subcategories: itemSubcategories,
        };
      });

      setItems(itemsWithCategories);
    } catch (error: any) {
      console.error("Error fetching inventory:", error);
      Alert.alert("Error", "Failed to load inventory");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInventory();
  };

  const handleAddItem = () => {
    router.push("/(tabs)/track/food-inventory/add");
  };

  const handleEditItem = (item: FoodInventoryItem) => {
    router.push(`/(tabs)/track/food-inventory/edit/${item.id}`);
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      // Optimistic update: remove item from local state immediately
      setItems(prevItems => prevItems.filter(item => item.id !== itemId));

      // Delete associated shopping list items first
      const { error: shoppingListError } = await supabase
        .from("shopping_list")
        .delete()
        .eq("food_inventory_id", itemId);

      if (shoppingListError) {
        console.error("Error deleting shopping list items:", shoppingListError);
        // Continue with deletion even if shopping list delete fails
      }

      // Delete the inventory item (CASCADE will handle locations)
      const { error } = await supabase
        .from("food_inventory")
        .delete()
        .eq("id", itemId);

      if (error) {
        // If deletion fails, revert by re-fetching
        await fetchInventory();
        throw error;
      }
    } catch (error: any) {
      console.error("Error deleting item:", error);
      Alert.alert("Error", "Failed to delete item");
    }
  };

  const handleAddToShoppingList = async (item: FoodInventoryItem) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      const { error } = await supabase.from("shopping_list").insert([
        {
          user_id: user.id,
          food_inventory_id: item.id,
          name: item.name,
          quantity: item.restock_threshold || 1,
          unit: item.unit,
          priority: 2,
        },
      ]);

      if (error) throw error;

      Alert.alert("Success", `${item.name} added to shopping list`);
    } catch (error: any) {
      console.error("Error adding to shopping list:", error);
      Alert.alert("Error", "Failed to add to shopping list");
    }
  };

  const handleLongPress = (item: FoodInventoryItemWithCategories) => {
    const isOutOfStock = item.total_quantity === 0;
    const needsRestockFridge = item.storage_type === 'multi-location' &&
      item.requires_refrigeration === true &&
      item.fridge_restock_threshold != null &&
      item.fridge_restock_threshold > 0 &&
      item.ready_quantity <= item.fridge_restock_threshold;

    // Build action sheet options dynamically
    const options: string[] = ['View Details', 'Edit Details', 'Delete Item'];
    const actions: (() => void)[] = [
      () => router.push(`/(tabs)/track/food-inventory/${item.id}`),
      () => handleEditItem(item),
      () => {
        Alert.alert(
          "Delete Item",
          `Are you sure you want to delete ${item.name}?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => handleDeleteItem(item.id) }
          ]
        );
      }
    ];

    // Add "Add to Shopping List" if out of stock (insert at position 2, after "Edit Details")
    if (isOutOfStock) {
      options.splice(2, 0, 'Add to Shopping List');
      actions.splice(2, 0, () => handleAddToShoppingList(item));
    }

    // Add "Restock Fridge" if multi-location and needs restock
    if (needsRestockFridge) {
      options.splice(isOutOfStock ? 3 : 2, 0, 'Restock Fridge');
      actions.splice(isOutOfStock ? 3 : 2, 0, () => {
        setRestockingItem(item);
        setShowRestockModal(true);
      });
    }

    options.push('Cancel');

    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          destructiveButtonIndex: options.indexOf('Delete Item'),
        },
        (buttonIndex) => {
          if (buttonIndex < actions.length) {
            actions[buttonIndex]();
          }
        }
      );
    } else {
      // For Android, use Alert with buttons
      Alert.alert(
        item.name,
        'Choose an action',
        [
          ...actions.map((action, index) => ({
            text: options[index],
            onPress: action,
            style: options[index] === 'Delete Item' ? 'destructive' as const : 'default' as const,
          })),
          { text: 'Cancel', style: 'cancel' as const },
        ]
      );
    }
  };

  const handleRestockConfirm = async (sourceLocation: FoodLocation | "store", quantity: number) => {
    if (!restockingItem) return;

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Find the target location (ready to consume) and source location
      const targetLocation = restockingItem.locations.find(loc => loc.is_ready_to_consume);

      if (!targetLocation) {
        Alert.alert("Error", "Could not find target location");
        return;
      }

      if (sourceLocation === "store") {
        // From Store: Just increment the target location quantity (adds to total)
        const { error: updateError } = await supabase
          .from("food_inventory_locations")
          .update({
            quantity: targetLocation.quantity + quantity,
            updated_at: new Date().toISOString(),
          })
          .eq("id", targetLocation.id);

        if (updateError) throw updateError;
      } else {
        // From another location: decrement source, increment target
        const sourceLocationData = restockingItem.locations.find(loc => loc.location === sourceLocation);

        if (!sourceLocationData) {
          Alert.alert("Error", "Could not find source location");
          return;
        }

        // Update both locations in parallel
        const [targetResult, sourceResult] = await Promise.all([
          supabase
            .from("food_inventory_locations")
            .update({
              quantity: targetLocation.quantity + quantity,
              updated_at: new Date().toISOString(),
            })
            .eq("id", targetLocation.id),
          supabase
            .from("food_inventory_locations")
            .update({
              quantity: sourceLocationData.quantity - quantity,
              updated_at: new Date().toISOString(),
            })
            .eq("id", sourceLocationData.id),
        ]);

        if (targetResult.error) throw targetResult.error;
        if (sourceResult.error) throw sourceResult.error;
      }

      // Optimistic update: update local state
      setItems(prevItems =>
        prevItems.map(item => {
          if (item.id !== restockingItem.id) return item;

          const updatedLocations = item.locations.map(loc => {
            if (loc.id === targetLocation.id) {
              return { ...loc, quantity: loc.quantity + quantity };
            }
            if (sourceLocation !== "store") {
              const sourceLocationData = item.locations.find(l => l.location === sourceLocation);
              if (sourceLocationData && loc.id === sourceLocationData.id) {
                return { ...loc, quantity: loc.quantity - quantity };
              }
            }
            return loc;
          });

          // Recalculate totals
          const total_quantity = sourceLocation === "store"
            ? item.total_quantity + quantity
            : item.total_quantity;

          const ready_quantity = updatedLocations
            .filter(loc => loc.is_ready_to_consume)
            .reduce((sum, loc) => sum + loc.quantity, 0);

          const storage_quantity = updatedLocations
            .filter(loc => !loc.is_ready_to_consume)
            .reduce((sum, loc) => sum + loc.quantity, 0);

          return {
            ...item,
            locations: updatedLocations,
            total_quantity,
            ready_quantity,
            storage_quantity,
          };
        })
      );

      Alert.alert("Success", `Restocked ${quantity} ${restockingItem.unit} of ${restockingItem.name}`);
    } catch (error: any) {
      console.error("Error restocking item:", error);
      Alert.alert("Error", "Failed to restock item");
      // Re-fetch to revert optimistic update
      await fetchInventory();
    }
  };

  const handleBarcodeScanned = async (barcode: string) => {
    try {
      const productData = await getProductByBarcode(barcode);

      if (!productData) {
        Alert.alert("Product Not Found", "Could not find product information for this barcode.");
        return;
      }

      // Navigate to preview page with barcode data
      router.push({
        pathname: "/(tabs)/track/food-inventory/preview" as any,
        params: {
          productData: JSON.stringify(productData),
          barcode: barcode,
        },
      });
    } catch (error: any) {
      console.error("Error processing barcode:", error);
      Alert.alert("Error", "Failed to process barcode scan");
    }
  };

  // Filter items
  const filteredItems = items
    .filter((item) => {
      // Get the selected category
      const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);

      // Category filter based on selected tab
      let matchesCategory = true;
      if (selectedCategory) {
        if (selectedCategory.slug === "all-products") {
          // "All Products" shows all in-stock items
          matchesCategory = item.total_quantity > 0;
        } else if (selectedCategory.slug === "out-of-stock") {
          // "Out of Stock" shows all out-of-stock items
          matchesCategory = item.total_quantity === 0;
        } else {
          // For specific categories, check if item belongs to that category
          matchesCategory = item.categories.some(cat => cat.id === selectedCategoryId);

          // If item doesn't belong to selected category, exclude it
          if (!matchesCategory) return false;

          // If subcategories are selected, further filter by subcategories
          if (selectedSubcategoryIds.length > 0) {
            matchesCategory = item.subcategories.some(sub => selectedSubcategoryIds.includes(sub.id));
          }
        }
      }

      // Search filter
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchesCategory && matchesSearch;
    })
    .sort((a, b) => {
      // Sort by expiration date - items expiring soonest first
      // Items without expiration dates go to the end
      if (!a.expiration_date && !b.expiration_date) return 0;
      if (!a.expiration_date) return 1; // a goes to end
      if (!b.expiration_date) return -1; // b goes to end

      // Both have expiration dates - sort by date (earliest first)
      return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
    });

  const formatExpirationDate = (dateStr: string | null) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const diffTime = date.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: "Expired", color: "#EF4444" };
    if (diffDays === 0) return { text: "Expires today", color: "#F59E0B" };
    if (diffDays <= 7) return { text: `Exp: ${diffDays}d left`, color: "#F59E0B" };
    return { text: `Exp: ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, color: colors.mutedForeground };
  };

  // Render function for grid items
  const renderGridItem = ({ item }: { item: FoodInventoryItemWithCategories }) => {
    const expiration = formatExpirationDate(item.expiration_date);

    // Badge logic
    const needsRestockFridge = item.storage_type === 'multi-location' &&
      item.requires_refrigeration === true &&
      item.fridge_restock_threshold != null &&
      item.fridge_restock_threshold > 0 &&
      item.ready_quantity <= item.fridge_restock_threshold;

    const isLowTotalStock = item.storage_type === 'single-location'
      ? item.total_quantity <= item.restock_threshold && item.total_quantity > 0
      : item.total_quantity <= (item.total_restock_threshold || 0) && item.total_quantity > 0;

    const hasNoCategories = item.categories.length === 0;

    return (
      <Pressable
        style={styles.gridItem}
        onPress={() => router.push(`/(tabs)/track/food-inventory/${item.id}`)}
        onLongPress={() => handleLongPress(item)}
      >
        {/* Product Image with Badges Overlay */}
        <View style={styles.gridImageContainer}>
          {item.image_primary_url ? (
            <Image
              source={{ uri: item.image_primary_url }}
              style={styles.gridImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.gridImagePlaceholder}>
              <Package size={40} color={colors.mutedForeground} />
            </View>
          )}

          {/* Badges overlayed on top-right of image */}
          <View style={styles.badgeContainer}>
            {needsRestockFridge && (
              <View style={styles.restockFridgeBadgeOverlay}>
                <Text style={styles.badgeOverlayText}>Restock Fridge</Text>
              </View>
            )}
            {isLowTotalStock && (
              <View style={styles.lowStockBadgeOverlay}>
                <Text style={styles.badgeOverlayText}>Low Stock</Text>
              </View>
            )}
          </View>

          {/* Uncategorized icon overlay on bottom-left */}
          {hasNoCategories && (
            <View style={styles.uncategorizedIconContainer}>
              <Tag size={18} color="#8B5CF6" strokeWidth={2.5} />
            </View>
          )}
        </View>

        {/* Product Info Below Image */}
        <View style={styles.gridItemInfo}>
          <Text style={styles.gridItemName} numberOfLines={2}>
            {item.name}
          </Text>
          {item.brand && (
            <Text style={styles.gridItemBrand} numberOfLines={1}>
              {item.brand}
            </Text>
          )}
          <Text style={styles.gridItemQuantity}>
            Qty: {item.total_quantity} {item.unit}
            {item.storage_type === 'multi-location' && item.ready_quantity > 0 && (
              <Text style={styles.gridItemQuantityDetail}> ({item.ready_quantity} Ready)</Text>
            )}
          </Text>
          {expiration && (
            <Text style={[styles.gridItemExpiration, { color: expiration.color }]}>
              {expiration.text}
            </Text>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header with Back, Search, and Add Button */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <ChevronLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={styles.searchBar}>
              <Search size={20} color={colors.mutedForeground} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search items..."
                placeholderTextColor={colors.mutedForeground}
                value={searchQuery}
                onChangeText={setSearchQuery}
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
              onPress={handleAddItem}
              activeOpacity={0.7}
            >
              <Plus size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Title */}
          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              <Package size={28} color="#8B5CF6" strokeWidth={2} />
              <Text style={styles.pageTitle}>Food Inventory</Text>
            </View>
          </View>

          {/* Category Tabs */}
          <CategoryTabs
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={(categoryId) => {
              setSelectedCategoryId(categoryId);
              setSelectedSubcategoryIds([]); // Clear subcategory filters when changing category
            }}
          />

          {/* Subcategory Pills (hidden for "All Products" and "Out of Stock") */}
          {selectedCategoryId && (() => {
            const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
            const isAllProducts = selectedCategory?.slug === "all-products";
            const isOutOfStock = selectedCategory?.slug === "out-of-stock";

            if (!isAllProducts && !isOutOfStock) {
              const categorySubcategories = subcategories.filter(sub => sub.category_id === selectedCategoryId);
              return (
                <SubcategoryPills
                  subcategories={categorySubcategories}
                  selectedSubcategoryIds={selectedSubcategoryIds}
                  onToggleSubcategory={(subcategoryId) => {
                    setSelectedSubcategoryIds(prev =>
                      prev.includes(subcategoryId)
                        ? prev.filter(id => id !== subcategoryId)
                        : [...prev, subcategoryId]
                    );
                  }}
                />
              );
            }
            return null;
          })()}

        {/* Items Grid */}
        <FlatList
          data={filteredItems}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          style={styles.flatList}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
              title="Pull to refresh"
              titleColor={colors.mutedForeground}
            />
          }
          ListEmptyComponent={
            loading ? (
              <Text style={styles.emptyText}>Loading...</Text>
            ) : (
              <View style={styles.emptyState}>
                <Package size={64} color={colors.mutedForeground} strokeWidth={1.5} />
                <Text style={styles.emptyText}>
                  {(() => {
                    const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
                    if (selectedCategory?.slug === "out-of-stock") {
                      return "No out of stock items";
                    }
                    return "No items found";
                  })()}
                </Text>
                <Text style={styles.emptySubtext}>
                  {(() => {
                    const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
                    if (selectedCategory?.slug === "out-of-stock") {
                      return "Items with zero quantity will appear here";
                    }
                    if (selectedCategory?.slug === "all-products") {
                      return "Add items to start tracking your inventory";
                    }
                    return "Try adjusting your filters or add items to this category";
                  })()}
                </Text>
              </View>
            )
          }
          ListFooterComponent={<View style={{ height: 40 }} />}
        />

        {/* Restock Modal */}
        <RestockModal
          visible={showRestockModal}
          onClose={() => {
            setShowRestockModal(false);
            setRestockingItem(null);
          }}
          item={restockingItem}
          onConfirm={handleRestockConfirm}
        />

        {/* Barcode Scanner Modal */}
        <BarcodeScannerModal
          visible={showBarcodeScanner}
          onClose={() => setShowBarcodeScanner(false)}
          onBarcodeScanned={handleBarcodeScanned}
        />
        </View>
      </GestureHandlerRootView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: 4,
  },
  titleContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
  },
  headerAddButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  searchActionButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginTop: 8,
    textAlign: "center",
  },
  // Grid Layout Styles
  flatList: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  gridContainer: {
    paddingHorizontal: GRID_PADDING,
    paddingTop: 16,
    backgroundColor: "#FFFFFF",
  },
  gridRow: {
    justifyContent: "flex-start",
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridItem: {
    width: ITEM_WIDTH,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    overflow: "hidden",
  },
  gridImageContainer: {
    width: ITEM_WIDTH,
    height: ITEM_WIDTH,
    position: "relative",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: 8,
  },
  gridImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F9FAFB",
  },
  badgeContainer: {
    position: "absolute",
    top: 4,
    right: 4,
    gap: 4,
  },
  lowStockBadgeOverlay: {
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  restockFridgeBadgeOverlay: {
    backgroundColor: "rgba(59, 130, 246, 0.9)",
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeOverlayText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  uncategorizedIconContainer: {
    position: "absolute",
    bottom: 4,
    left: 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  gridItemInfo: {
    paddingTop: 8,
    paddingBottom: 4,
  },
  gridItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 2,
    lineHeight: 16,
  },
  gridItemBrand: {
    fontSize: 11,
    color: "#6B7280",
    marginBottom: 4,
    lineHeight: 14,
  },
  gridItemQuantity: {
    fontSize: 11,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 2,
  },
  gridItemQuantityDetail: {
    fontSize: 10,
    fontWeight: "400",
    color: "#6B7280",
  },
  gridItemExpiration: {
    fontSize: 10,
    marginTop: 2,
  },
});
