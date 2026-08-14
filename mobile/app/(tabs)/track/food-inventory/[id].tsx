import React, { useState, useCallback, useRef } from "react";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, View, Text, TouchableOpacity, StatusBar, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronLeft } from "lucide-react-native";
import { ViewFoodDetailsScreen } from "@/src/components/track/ViewFoodDetailsScreen";
import { colors, icons, spacing } from "@/src/theme/tokens";
import {
  LoadingState,
  UndoToast,
  takeHandedOffToast,
  type UndoToastContent,
} from "@/src/components/ui";
import {
  fetchInventoryWithState,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import { getLocalDateString } from "@/src/lib/dates";

export default function FoodItemDetailsPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [item, setItem] = useState<InventoryItemWithState | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<UndoToastContent | null>(null);

  // `replace` animates as a PUSH — the new screen sweeps in from the right —
  // so using it for Back made going back look like going forward. Pop when
  // there is a stack to pop, and fall back to `replace` only for a cold deep
  // link into this route. Same guard the sibling track routes already carry.
  const goBack = () =>
    router.canGoBack() ? router.back() : router.replace("/(tabs)/track/food-inventory");

  // On focus, not just on mount: editing this item pops back to this screen
  // rather than mounting a fresh one, so a mount-only fetch would leave the
  // page showing the values you just changed away from.
  useFocusEffect(
    useCallback(() => {
      fetchItemDetails();
      // A save on the edit screen pops back to here and leaves its
      // acknowledgement behind; this is where it gets shown. Undo writes the
      // pre-edit values back and then refetches, so the page underneath the
      // bar agrees with what the bar just did.
      const handed = takeHandedOffToast();
      if (!handed) return;
      setToast({
        ...handed,
        undo: handed.undo
          ? () => {
              setToast(null);
              void (async () => {
                try {
                  await handed.undo!();
                  await fetchItemDetails();
                } catch (e) {
                  console.error("undo edit failed:", e);
                  Alert.alert("Couldn't undo", "Your changes are still saved. Try editing the item again.");
                }
              })();
            }
          : undefined,
      });
    }, [id]),
  );

  // Only the first load blocks on the loading state. Returning from the edit
  // screen already has an item on screen, and swapping it for a spinner for
  // one frame reads as a flash.
  const hasLoadedRef = useRef(false);

  const fetchItemDetails = async () => {
    try {
      if (!hasLoadedRef.current) setLoading(true);
      // One code path for every inventory read: fetch the whole list and pick
      // this item out of it. At current data volume (~25 rows) that costs
      // nothing, and it keeps the projection in exactly one place.
      const items = await fetchInventoryWithState(getLocalDateString());
      const found = items.find((it) => it.id === id);

      if (!found) {
        Alert.alert("Error", "Item not found");
        goBack();
        return;
      }

      setItem(found);
    } catch (error: any) {
      console.error("Error fetching item details:", error);
      Alert.alert("Error", "Failed to load item details");
      goBack();
    } finally {
      hasLoadedRef.current = true;
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

  return (
    <>
      <ViewFoodDetailsScreen
        item={item}
        onClose={goBack}
        onRefresh={fetchItemDetails}
      />
      {/* Four seconds, like the meal library's: this bar names an item and
          offers a way back, which is more to weigh than a count going down. */}
      <UndoToast
        toast={toast}
        onDismissed={() => setToast(null)}
        icon={Check}
        durationMs={4000}
      />
    </>
  );
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
