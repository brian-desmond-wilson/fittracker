import React, { useState, useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Alert, View, Text, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft } from "lucide-react-native";
import { EditFoodScreen } from "@/src/components/track/EditFoodScreen";
import { colors, icons, spacing } from "@/src/theme/tokens";
import { LoadingState } from "@/src/components/ui";
import {
  fetchInventoryWithState,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import { getLocalDateString } from "@/src/lib/dates";

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

  // See the sibling detail route: `replace` animates as a push, so it is wrong
  // for Back. Pop when there is a stack; `replace` only for a cold deep link.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace(`/(tabs)/track/food-inventory/${id}`);

  const handleSave = () => {
    // Pop, don't replace. Replacing this route with the detail route put the
    // same page in the stack twice, so Back from it needed two taps. The
    // detail screen refetches when it regains focus, so popping to the copy
    // already in the stack still shows the edit.
    goBack();
  };

  if (loading || !item) {
    // Show loading state that matches the page structure
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={goBack} style={styles.backButton}>
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
              <Text style={styles.backText}>Back</Text>
            </TouchableOpacity>
          </View>

          {/* Loading content area */}
          <LoadingState />
        </View>
      </>
    );
  }

  return <EditFoodScreen item={item} onClose={goBack} onSave={handleSave} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
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
});
