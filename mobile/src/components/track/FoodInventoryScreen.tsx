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
import { ChevronLeft, Plus, Search, Package, ShoppingCart, Filter } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { FoodInventoryItem, FoodInventoryItemWithLocations, FoodLocation } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { AddEditFoodModal } from "./AddEditFoodModal";
import { SortFilterModal, SortOption, FilterOptions, loadSortFilterPreferences } from "./SortFilterModal";
import { SwipeableItemRow } from "./SwipeableItemRow";
import { RestockModal } from "./RestockModal";

interface FoodInventoryScreenProps {
  onClose: () => void;
}

type TabType = "in-stock" | "out-of-stock";
type SortType = "name" | "date" | "expiration" | "quantity";

export function FoodInventoryScreen({ onClose }: FoodInventoryScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("in-stock");
  const [items, setItems] = useState<FoodInventoryItemWithLocations[]>([]);
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

  useEffect(() => {
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

      // Fetch food inventory items
      const { data: foodItems, error: foodError } = await supabase
        .from("food_inventory")
        .select("*")
        .eq("user_id", user.id);

      if (foodError) throw foodError;

      // Fetch all locations for these items
      const { data: locations, error: locError } = await supabase
        .from("food_inventory_locations")
        .select("*")
        .eq("user_id", user.id);

      if (locError) throw locError;

      // Combine the data
      const itemsWithLocations: FoodInventoryItemWithLocations[] = (foodItems || []).map(item => {
        const itemLocations = (locations || []).filter(loc => loc.food_inventory_id === item.id);

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

        return {
          ...item,
          locations: itemLocations,
          total_quantity,
          ready_quantity,
          storage_quantity,
        };
      });

      setItems(itemsWithLocations);
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
          category: item.category,
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
      // Tab filter (in-stock vs out-of-stock)
      const matchesTab = activeTab === "in-stock"
        ? item.total_quantity > 0
        : item.total_quantity === 0;

      // Search filter
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase()));

      // Location filter
      const matchesLocation = currentFilters.locations.length === 0 ||
        (item.storage_type === 'single-location' && item.location && currentFilters.locations.includes(item.location)) ||
        (item.storage_type === 'multi-location' && item.locations.some(loc => currentFilters.locations.includes(loc.location)));

      // Category filter
      const matchesCategory = currentFilters.categories.length === 0 ||
        currentFilters.categories.includes(item.category || "Uncategorized");

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

      return matchesTab && matchesSearch && matchesLocation && matchesCategory && matchesStockStatus && matchesStorageType && matchesExpired;
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
          return (a.category || "Uncategorized").localeCompare(b.category || "Uncategorized");
        case "date-newest":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "date-oldest":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        default:
          return 0;
      }
    });

  // Group by category
  const groupedItems: Record<string, FoodInventoryItemWithLocations[]> = {};
  filteredItems.forEach((item) => {
    const category = item.category || "Uncategorized";
    if (!groupedItems[category]) {
      groupedItems[category] = [];
    }
    groupedItems[category].push(item);
  });

  const categories = Object.keys(groupedItems).sort();

  // Get available categories for modal
  const availableCategories = Array.from(new Set(items.map(item => item.category || "Uncategorized"))).sort();

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
          {/* Header */}
          <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Track</Text>
          </TouchableOpacity>
        </View>

        {/* Title & Actions */}
        <View style={styles.titleContainer}>
          <View style={styles.titleRow}>
            <Package size={28} color="#8B5CF6" strokeWidth={2} />
            <Text style={styles.pageTitle}>Food Inventory</Text>
          </View>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => Alert.alert("Shopping List", "Coming soon!")}
              activeOpacity={0.7}
            >
              <ShoppingCart size={24} color={colors.foreground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addButton}
              onPress={handleAddItem}
              activeOpacity={0.7}
            >
              <Plus size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          <TouchableOpacity
            style={[styles.tab, activeTab === "in-stock" && styles.tabActive]}
            onPress={() => setActiveTab("in-stock")}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === "in-stock" && styles.tabTextActive]}>
              In Stock
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === "out-of-stock" && styles.tabActive]}
            onPress={() => setActiveTab("out-of-stock")}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, activeTab === "out-of-stock" && styles.tabTextActive]}>
              Out of Stock
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search & Sort */}
        <View style={styles.searchContainer}>
          <View style={styles.searchBar}>
            <Search size={20} color={colors.mutedForeground} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search items..."
              placeholderTextColor={colors.mutedForeground}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          <TouchableOpacity
            style={styles.filterButton}
            onPress={() => setShowSortFilterModal(true)}
            activeOpacity={0.7}
          >
            <Filter size={20} color={colors.foreground} />
          </TouchableOpacity>
        </View>

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
                {activeTab === "in-stock" ? "No items in stock" : "No out of stock items"}
              </Text>
              <Text style={styles.emptySubtext}>
                {activeTab === "in-stock"
                  ? "Add items to start tracking your inventory"
                  : "Items with zero quantity will appear here"}
              </Text>
            </View>
          ) : (
            categories.map((category) => (
              <View key={category} style={styles.categorySection}>
                <Text style={styles.categoryTitle}>{category}</Text>
                {groupedItems[category].map((item) => {
                  const expiration = formatExpirationDate(item.expiration_date);

                  // Badge logic: separate badges for ready stock and total stock
                  const needsRestockFridge = item.storage_type === 'multi-location' &&
                    item.ready_quantity <= (item.fridge_restock_threshold || 0) &&
                    item.ready_quantity >= 0;

                  const isLowTotalStock = item.storage_type === 'single-location'
                    ? item.total_quantity <= item.restock_threshold && item.total_quantity > 0
                    : item.total_quantity <= (item.total_restock_threshold || 0) && item.total_quantity > 0;

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
                      {activeTab === "out-of-stock" && (
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
            ))
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
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
  titleContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  tabs: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  tabActive: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  searchContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
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
  categorySection: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  itemCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  itemImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
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
    color: colors.foreground,
    marginBottom: 4,
  },
  itemBrand: {
    fontSize: 14,
    color: colors.mutedForeground,
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
    color: colors.foreground,
  },
  itemQuantityDetail: {
    fontSize: 12,
    fontWeight: "400",
    color: colors.mutedForeground,
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
