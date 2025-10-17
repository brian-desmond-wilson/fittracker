import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  TextInput,
  Image,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus, Search, Package, ShoppingCart, Filter } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { FoodInventoryItem } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { AddEditFoodModal } from "./AddEditFoodModal";

interface FoodInventoryScreenProps {
  onClose: () => void;
}

type TabType = "in-stock" | "out-of-stock";
type SortType = "name" | "date" | "expiration" | "quantity";

export function FoodInventoryScreen({ onClose }: FoodInventoryScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<TabType>("in-stock");
  const [items, setItems] = useState<FoodInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortType>("name");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Modal state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingItem, setEditingItem] = useState<FoodInventoryItem | null>(null);

  useEffect(() => {
    fetchInventory();
  }, [activeTab]);

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

      const query = supabase
        .from("food_inventory")
        .select("*")
        .eq("user_id", user.id);

      if (activeTab === "in-stock") {
        query.gt("quantity", 0);
      } else {
        query.eq("quantity", 0);
      }

      const { data, error } = await query;

      if (error) throw error;

      setItems(data || []);
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
    Alert.alert("Delete Item", "Are you sure you want to delete this item?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("food_inventory").delete().eq("id", itemId);

            if (error) throw error;

            await fetchInventory();
          } catch (error: any) {
            console.error("Error deleting item:", error);
            Alert.alert("Error", "Failed to delete item");
          }
        },
      },
    ]);
  };

  const handleUpdateQuantity = async (itemId: string, currentQty: number, delta: number) => {
    const newQty = Math.max(0, currentQty + delta);

    try {
      const { error } = await supabase
        .from("food_inventory")
        .update({ quantity: newQty })
        .eq("id", itemId);

      if (error) throw error;

      await fetchInventory();
    } catch (error: any) {
      console.error("Error updating quantity:", error);
      Alert.alert("Error", "Failed to update quantity");
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

  // Filter and sort items
  const filteredItems = items
    .filter((item) => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.brand && item.brand.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = !selectedCategory || item.category === selectedCategory;
      return matchesSearch && matchesCategory;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "date":
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case "expiration":
          if (!a.expiration_date) return 1;
          if (!b.expiration_date) return -1;
          return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
        case "quantity":
          return a.quantity - b.quantity;
        default:
          return 0;
      }
    });

  // Group by category
  const groupedItems: Record<string, FoodInventoryItem[]> = {};
  filteredItems.forEach((item) => {
    const category = item.category || "Uncategorized";
    if (!groupedItems[category]) {
      groupedItems[category] = [];
    }
    groupedItems[category].push(item);
  });

  const categories = Object.keys(groupedItems).sort();

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
            onPress={() => Alert.alert("Sort & Filter", "Sort and filter options coming soon!")}
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
                  const isLowStock = item.quantity <= item.restock_threshold && item.quantity > 0;

                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.itemCard}
                      onPress={() => handleEditItem(item)}
                      activeOpacity={0.7}
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
                            {item.quantity} {item.unit}
                          </Text>
                          {isLowStock && (
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
                      {activeTab === "in-stock" && (
                        <View style={styles.itemActions}>
                          <TouchableOpacity
                            style={styles.qtyButton}
                            onPress={() => handleUpdateQuantity(item.id, item.quantity, -1)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.qtyButtonText}>−</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.qtyButton}
                            onPress={() => handleUpdateQuantity(item.id, item.quantity, 1)}
                            activeOpacity={0.7}
                          >
                            <Text style={styles.qtyButtonText}>+</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {activeTab === "out-of-stock" && (
                        <TouchableOpacity
                          style={styles.restockButton}
                          onPress={() => handleAddToShoppingList(item)}
                          activeOpacity={0.7}
                        >
                          <ShoppingCart size={18} color="#FFFFFF" />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
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
      </View>
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
