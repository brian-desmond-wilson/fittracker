import React, { useState, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, View, Text, TouchableOpacity, StatusBar, StyleSheet, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { EditFoodScreen } from "@/src/components/track/EditFoodScreen";
import {
  fetchInventoryWithState,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import { getLocalDateString } from "@/src/components/track/meals/mealsHelpers";

export default function EditFoodItemPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<InventoryItemWithState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchItemDetails();
  }, [id]);

  const fetchItemDetails = async () => {
    try {
      setLoading(true);
      // One code path for every inventory read: fetch the whole list and pick
      // this item out of it. At current data volume (~25 rows) that costs
      // nothing, and it keeps the projection in exactly one place.
      const items = await fetchInventoryWithState(getLocalDateString());
      const found = items.find((it) => it.id === id);

      if (!found) {
        Alert.alert("Error", "Item not found");
        router.replace(`/(tabs)/track/food-inventory/${id}`);
        return;
      }

      setItem(found);
    } catch (error: any) {
      console.error("Error fetching item details:", error);
      Alert.alert("Error", "Failed to load item details");
      router.replace(`/(tabs)/track/food-inventory/${id}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = () => {
    // Refresh the data after save
    fetchItemDetails();
    router.replace(`/(tabs)/track/food-inventory/${id}`);
  };

  if (loading || !item) {
    // Show loading state that matches the page structure
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={() => router.replace(`/(tabs)/track/food-inventory/${id}`)} style={styles.backButton}>
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

  return <EditFoodScreen item={item} onClose={() => router.replace(`/(tabs)/track/food-inventory/${id}`)} onSave={handleSave} />;
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
