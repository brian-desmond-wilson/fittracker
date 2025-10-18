import React, { useState, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, View, Text, TouchableOpacity, StatusBar, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { ViewFoodDetailsScreen } from "@/src/components/track/ViewFoodDetailsScreen";
import { FoodInventoryItemWithCategories } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

export default function FoodItemDetailsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<FoodInventoryItemWithCategories | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItemDetails();
  }, [id]);

  const fetchItemDetails = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in");
        router.back();
        return;
      }

      // Fetch the food item
      const { data: foodItem, error: foodError } = await supabase
        .from("food_inventory")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();

      if (foodError || !foodItem) {
        Alert.alert("Error", "Item not found");
        router.back();
        return;
      }

      // Fetch locations
      const { data: locations, error: locationsError } = await supabase
        .from("food_inventory_locations")
        .select("*")
        .eq("food_inventory_id", id)
        .eq("user_id", user.id);

      if (locationsError) throw locationsError;

      // Fetch category mappings
      const { data: categoryMaps, error: categoryMapsError } = await supabase
        .from("food_inventory_category_map")
        .select("*, food_categories(*)")
        .eq("food_inventory_id", id)
        .eq("user_id", user.id);

      if (categoryMapsError) throw categoryMapsError;

      // Fetch subcategory mappings
      const { data: subcategoryMaps, error: subcategoryMapsError } = await supabase
        .from("food_inventory_subcategory_map")
        .select("*, food_subcategories(*)")
        .eq("food_inventory_id", id)
        .eq("user_id", user.id);

      if (subcategoryMapsError) throw subcategoryMapsError;

      // Calculate quantities
      const itemLocations = locations || [];
      const total_quantity = foodItem.storage_type === 'single-location'
        ? foodItem.quantity
        : itemLocations.reduce((sum, loc) => sum + loc.quantity, 0);

      const ready_quantity = foodItem.storage_type === 'single-location'
        ? foodItem.quantity
        : itemLocations
            .filter(loc => loc.is_ready_to_consume)
            .reduce((sum, loc) => sum + loc.quantity, 0);

      const storage_quantity = foodItem.storage_type === 'single-location'
        ? 0
        : itemLocations
            .filter(loc => !loc.is_ready_to_consume)
            .reduce((sum, loc) => sum + loc.quantity, 0);

      // Extract categories and subcategories
      const categories = (categoryMaps || [])
        .map(map => map.food_categories)
        .filter(Boolean);

      const subcategories = (subcategoryMaps || [])
        .map(map => map.food_subcategories)
        .filter(Boolean);

      const itemWithDetails: FoodInventoryItemWithCategories = {
        ...foodItem,
        locations: itemLocations,
        total_quantity,
        ready_quantity,
        storage_quantity,
        categories,
        subcategories,
      };

      setItem(itemWithDetails);
    } catch (error: any) {
      console.error("Error fetching item details:", error);
      Alert.alert("Error", "Failed to load item details");
      router.back();
    } finally {
      setLoading(false);
    }
  };

  if (loading || !item) {
    // Show loading state that matches the page structure
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <ChevronLeft size={24} color="#FFFFFF" />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>

          {/* Loading content area */}
          <View style={styles.loadingContent}>
            <ActivityIndicator size="large" color="#8B5CF6" />
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </View>
      </>
    );
  }

  return <ViewFoodDetailsScreen item={item} onClose={() => router.back()} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  header: {
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
  loadingContent: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#6B7280",
  },
});
