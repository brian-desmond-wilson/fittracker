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
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronLeft, Plus, Search, Package, ShoppingCart, Filter, ScanBarcode, X } from "lucide-react-native";
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
import { AddEditFoodModal } from "./AddEditFoodModal";
import { SortFilterModal, SortOption, FilterOptions, loadSortFilterPreferences } from "./SortFilterModal";
import { SwipeableItemRow } from "./SwipeableItemRow";
import { RestockModal } from "./RestockModal";
import { CategoryTabs } from "./CategoryTabs";
import { SubcategoryPills } from "./SubcategoryPills";

interface FoodInventoryScreenProps {
  onClose: () => void;
}

export function FoodInventoryScreen({ onClose }: FoodInventoryScreenProps) {
  const insets = useSafeAreaInsets();

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

  // Modal state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodInventoryItem | null>(null);

  // Sort & Filter state
  const [showSortFilterModal, setShowSortFilterModal] = useState(false);
  const [currentSort, setCurrentSort] = useState<SortOption>("name-asc");
  const [currentFilters, setCurrentFilters] = useState<FilterOptions>({
    locations: [],
    categories: [],
    stockStatus: [],
    storageTypes: [],
    showExpired: true,
  });

  // Restock modal state
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockingItem, setRestockingItem] = useState<FoodInventoryItemWithLocations | null>(null);

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

  useEffect(() => {
    // Load saved sort/filter preferences on mount
    const loadPreferences = async () => {
      const prefs = await loadSortFilterPreferences();
      if (prefs) {
        setCurrentSort(prefs.sort);
        setCurrentFilters(prefs.filters);
      }
    };
    loadPreferences();
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
    setEditingItem(null);
    setShowAddEditModal(true);
  };

  const handleEditItem = (item: FoodInventoryItem) => {
    setEditingItem(item);
    setShowAddEditModal(true);
  };

  const handleModalSave = () => {
    fetchInventory();
  };

  const handleModalClose = () => {
    setShowAddEditModal(false);
    setEditingItem(null);
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

  const handleLongPress = (item: FoodInventoryItemWithLocations) => {
    // Only show restock modal for multi-location items with "Restock Fridge" badge
    if (item.storage_type === 'multi-location') {
      setRestockingItem(item);
      setShowRestockModal(true);
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

  // Filter and sort items
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

      // Location filter
      const matchesLocation = currentFilters.locations.length === 0 ||
        (item.storage_type === 'single-location' && item.location && currentFilters.locations.includes(item.location)) ||
        (item.storage_type === 'multi-location' && item.locations.some(loc => currentFilters.locations.includes(loc.location)));

      // Stock status filter
      const matchesStockStatus = currentFilters.stockStatus.length === 0 || currentFilters.stockStatus.some(status => {
        if (status === "low-stock") {
          return item.storage_type === 'single-location'
            ? item.total_quantity <= item.restock_threshold && item.total_quantity > 0
            : (item.ready_quantity <= (item.fridge_restock_threshold || 0) && item.ready_quantity > 0) ||
              (item.total_quantity <= (item.total_restock_threshold || 0) && item.total_quantity > 0);
        }
        if (status === "expiring-soon") {
          if (!item.expiration_date) return false;
          const daysUntilExpiration = Math.ceil(
            (new Date(item.expiration_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
          );
          return daysUntilExpiration >= 0 && daysUntilExpiration <= 7;
        }
        if (status === "out-of-stock") {
          return item.total_quantity === 0;
        }
        return false;
      });

      // Storage type filter
      const matchesStorageType = currentFilters.storageTypes.length === 0 ||
        currentFilters.storageTypes.includes(item.storage_type);

      // Expired items filter
      const matchesExpired = currentFilters.showExpired || !item.expiration_date ||
        new Date(item.expiration_date) >= new Date();

      return matchesCategory && matchesSearch && matchesLocation && matchesStockStatus && matchesStorageType && matchesExpired;
    })
    .sort((a, b) => {
      switch (currentSort) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "name-desc":
          return b.name.localeCompare(a.name);
        case "quantity-low":
          return a.total_quantity - b.total_quantity;
        case "quantity-high":
          return b.total_quantity - a.total_quantity;
        case "expiration-soon":
          if (!a.expiration_date && !b.expiration_date) return 0;
          if (!a.expiration_date) return 1;
          if (!b.expiration_date) return -1;
          return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
        case "expiration-late":
          if (!a.expiration_date && !b.expiration_date) return 0;
          if (!a.expiration_date) return 1;
          if (!b.expiration_date) return -1;
          return new Date(b.expiration_date).getTime() - new Date(a.expiration_date).getTime();
        case "category-asc":
          // Sort by first category name
          const aFirstCategory = a.categories[0]?.name || "Uncategorized";
          const bFirstCategory = b.categories[0]?.name || "Uncategorized";
          return aFirstCategory.localeCompare(bFirstCategory);
        case "date-newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date-oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:
          return 0;
      }
    });

  // Get available category names for sort/filter modal (from all categories in the database)
  const availableCategories = categories
    .filter(cat => cat.slug !== "all-products" && cat.slug !== "out-of-stock")
    .map(cat => cat.name)
    .sort();

  // Handler for applying sort/filter
  const handleApplySortFilter = (sort: SortOption, filters: FilterOptions) => {
    setCurrentSort(sort);
    setCurrentFilters(filters);
  };

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

  return (
    <>
      <StatusBar barStyle="light-content" />
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header with Back, Search, and Filter */}
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
                  onPress={() => {
                    // TODO: Implement barcode scanner
                    Alert.alert("Barcode Scanner", "Barcode scanning feature coming soon!");
                  }}
                  activeOpacity={0.7}
                  style={styles.searchActionButton}
                >
                  <ScanBarcode size={20} color={colors.mutedForeground} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowSortFilterModal(true)}
              activeOpacity={0.7}
            >
              <Filter size={20} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {/* Title & Actions */}
          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              <Package size={28} color="#8B5CF6" strokeWidth={2} />
              <Text style={styles.pageTitle}>Food Inventory</Text>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddItem}
              activeOpacity={0.7}
            >
              <Plus size={20} color="#FFFFFF" />
            </TouchableOpacity>
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

        {/* Items List */}
        <ScrollView
          style={styles.content}
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
        >
          {loading ? (
            <Text style={styles.emptyText}>Loading...</Text>
          ) : filteredItems.length === 0 ? (
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
          ) : (
            <View style={styles.itemsList}>
              {filteredItems.map((item) => {
                const expiration = formatExpirationDate(item.expiration_date);

                // Badge logic: separate badges for ready stock and total stock
                const needsRestockFridge = item.storage_type === 'multi-location' &&
                  item.ready_quantity <= (item.fridge_restock_threshold || 0) &&
                  item.ready_quantity >= 0;

                const isLowTotalStock = item.storage_type === 'single-location'
                  ? item.total_quantity <= item.restock_threshold && item.total_quantity > 0
                  : item.total_quantity <= (item.total_restock_threshold || 0) && item.total_quantity > 0;

                // Check if item is out of stock for showing shopping cart button
                const isOutOfStock = item.total_quantity === 0;

                return (
                  <SwipeableItemRow
                    key={item.id}
                    onDelete={() => handleDeleteItem(item.id)}
                  >
                    <Pressable
                      style={styles.itemCard}
                      onPress={() => handleEditItem(item)}
                      onLongPress={() => handleLongPress(item)}
                    >
                    {/* Item Image */}
                    <View style={styles.itemImage}>
                      {item.image_primary_url ? (
                        <Image
                          source={{ uri: item.image_primary_url }}
                          style={styles.image}
                          resizeMode="cover"
                        />
                      ) : (
                        <Package size={32} color={colors.mutedForeground} />
                      )}
                    </View>

                    {/* Item Info */}
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      {item.brand && <Text style={styles.itemBrand}>{item.brand}</Text>}
                      <View style={styles.itemMeta}>
                        <Text style={styles.itemQuantity}>
                          {item.total_quantity} {item.unit}
                          {item.storage_type === 'multi-location' && item.ready_quantity > 0 && (
                            <Text style={styles.itemQuantityDetail}> ({item.ready_quantity} ready)</Text>
                          )}
                        </Text>
                        {needsRestockFridge && (
                          <View style={styles.restockFridgeBadge}>
                            <Text style={styles.restockFridgeText}>Restock Fridge</Text>
                          </View>
                        )}
                        {isLowTotalStock && (
                          <View style={styles.lowStockBadge}>
                            <Text style={styles.lowStockText}>Low Stock</Text>
                          </View>
                        )}
                      </View>
                      {expiration && (
                        <Text style={[styles.itemExpiration, { color: expiration.color }]}>
                          {expiration.text}
                        </Text>
                      )}
                    </View>

                    {/* Actions */}
                    {isOutOfStock && (
                      <TouchableOpacity
                        style={styles.restockButton}
                        onPress={() => handleAddToShoppingList(item)}
                        activeOpacity={0.7}
                      >
                        <ShoppingCart size={18} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}
                    </Pressable>
                  </SwipeableItemRow>
                );
              })}
            </View>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Add/Edit Modal */}
        <AddEditFoodModal
          visible={showAddEditModal}
          onClose={handleModalClose}
          onSave={handleModalSave}
          item={editingItem}
        />

        {/* Sort & Filter Modal */}
        <SortFilterModal
          visible={showSortFilterModal}
          onClose={() => setShowSortFilterModal(false)}
          onApply={handleApplySortFilter}
          availableCategories={availableCategories}
          currentSort={currentSort}
          currentFilters={currentFilters}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  filterButton: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    flex: 1,
    backgroundColor: "#FFFFFF",
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
  itemsList: {
    paddingHorizontal: 20,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: 8,
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  itemBrand: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 6,
  },
  itemMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  itemQuantity: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  itemQuantityDetail: {
    fontSize: 12,
    fontWeight: "400",
    color: "#6B7280",
  },
  lowStockBadge: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lowStockText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#EF4444",
  },
  restockFridgeBadge: {
    backgroundColor: "rgba(249, 115, 22, 0.1)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  restockFridgeText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#F97316",
  },
  itemExpiration: {
    fontSize: 12,
    marginTop: 4,
  },
  itemActions: {
    flexDirection: "row",
    gap: 8,
  },
  qtyButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  qtyButtonText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
  },
  restockButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
});
