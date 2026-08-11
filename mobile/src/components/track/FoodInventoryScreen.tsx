import React, { useState, useEffect, useCallback, useRef } from "react";
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
  FlatList,
  Dimensions,
  ActionSheetIOS,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ChevronLeft, Plus, Minus, Search, Package, ShoppingCart, ScanBarcode, X, Tag } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Card, EmptyState, IconButton, LoadingState } from "@/src/components/ui";
import type { BadgeTone } from "@/src/components/ui";
import {
  FoodCategory,
  FoodSubcategory,
} from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import {
  fetchInventoryWithState,
  transferInventoryUnits,
  consumeOneUnit,
  discardItem,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import { addSuggestions, fetchConsumptionRates } from "@/src/lib/supabase/shopping";
import { projectItemStock, lowThresholdFor } from "@/src/lib/stockState";
import { isExpiringSoon } from "@/src/lib/expiryPolicy";
import { MAX_DISPLAY_DAYS, type ConsumptionEstimate } from "@/src/lib/consumptionRate";
import { getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { RestockModal } from "./RestockModal";
import { CategoryTabs } from "./CategoryTabs";
import { SubcategoryPills } from "./SubcategoryPills";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { getProductByBarcode } from "@/src/services/openFoodFactsApi";

interface FoodInventoryScreenProps {
  onClose: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.screenGutter;
const GRID_GAP = spacing.md;
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
  const [items, setItems] = useState<InventoryItemWithState[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Consumption-forecast map ("~Nd left"); decoration only — a failed fetch
  // leaves this empty rather than blocking the inventory render (see
  // fetchInventory below).
  const [ratesById, setRatesById] = useState<Map<string, ConsumptionEstimate>>(new Map());

  // `fetchInventory` is called from four places (mount, pull-to-refresh, the
  // delete-failure revert, the restock-failure revert) with no cancellation.
  // A ref, not state, incremented once per call: a fetch only applies its
  // result if it's still the most recent call by the time it resolves.
  // Without this, a slow in-flight fetch can resolve AFTER a newer one
  // already reflects a since-completed mutation and silently overwrite it —
  // e.g. a slow mount fetch racing an optimistic delete: the delete commits,
  // the mount fetch resolves late, and `setItems` would resurrect the row
  // the user just removed.
  const fetchGenerationRef = useRef(0);

  // In-flight guard for the manual "Add to Shopping List" action (see
  // handleAddToShoppingList below) — keyed by item id so concurrent adds for
  // different items aren't blocked by each other.
  const addingToShoppingListIds = useRef<Set<string>>(new Set());

  // Restock modal state
  const [showRestockModal, setShowRestockModal] = useState(false);
  const [restockingItem, setRestockingItem] = useState<InventoryItemWithState | null>(null);

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
    const generation = ++fetchGenerationRef.current;
    const todayLocalDate = getLocalDateString();
    setLoading(true);

    let items: InventoryItemWithState[];
    try {
      items = await fetchInventoryWithState(todayLocalDate);
    } catch (error) {
      // A superseded call's failure must not clobber whatever the winning
      // call already rendered (or is about to render).
      if (generation === fetchGenerationRef.current) {
        console.error("Error fetching inventory:", error);
        Alert.alert("Error", "Failed to load inventory");
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    if (generation !== fetchGenerationRef.current) return; // a later call already landed; this result is stale

    // Flipped here, right after the grid has data, rather than in a shared
    // `finally` — the rates round trip below is decoration and must not
    // hold the pull-to-refresh spinner (or the first-run "Loading…"
    // placeholder) up for one extra RTT.
    setItems(items);
    setLoading(false);
    setRefreshing(false);

    // Rates depend on totalsById, which is only available once `items` has
    // resolved, so this can't run concurrently with the fetch above — but
    // it's wrapped in its own try/catch so a failure here (bad network,
    // etc.) can never take down the inventory render that just succeeded.
    // The forecast line is decoration; the grid is not.
    try {
      const totalsById = new Map(items.map((it) => [it.id, it.state.totalQuantity]));
      const rates = await fetchConsumptionRates(todayLocalDate, totalsById);
      if (generation !== fetchGenerationRef.current) return; // stale — a later call superseded this one
      setRatesById(rates);
    } catch (ratesError) {
      console.error("Error fetching consumption rates:", ratesError);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchInventory();
  };

  const handleAddItem = () => {
    router.push("/(tabs)/track/food-inventory/add");
  };

  const handleViewItem = (item: InventoryItemWithState) => {
    router.push(`/(tabs)/track/food-inventory/${item.id}`);
  };

  const handleEditItem = (item: InventoryItemWithState) => {
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

  const handleAddToShoppingList = async (item: InventoryItemWithState) => {
    // In-flight guard: the success alert only fires once the insert returns,
    // so on a slow connection a user who gets no feedback yet can long-press
    // the same item and tap "Add to Shopping List" again before the first
    // request lands. There's no unique constraint on `shopping_list`
    // (20260731100000_shopping_intelligence.sql) to stop two identical rows
    // from landing, and un-gating this action sheet entry (Task 8) put it on
    // every item instead of only out-of-stock ones — widening exposure to
    // exactly this. Keyed by item id, not a single screen-wide flag, so
    // adding two different items concurrently isn't blocked by each other.
    if (addingToShoppingListIds.current.has(item.id)) return;
    addingToShoppingListIds.current.add(item.id);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return;

      // Belt-and-suspenders alongside the in-flight guard above: even with
      // instant feedback, a deliberate second add always duplicates without
      // this, because nothing else consults existing rows before inserting.
      // Scoped to unpurchased rows only — a purchased row for this item
      // doesn't mean one is already pending, matching the demand engine's
      // own suppression rule (spec §6).
      const { data: existing, error: existingError } = await supabase
        .from("shopping_list")
        .select("id")
        .eq("food_inventory_id", item.id)
        .eq("is_purchased", false)
        .limit(1);
      if (existingError) throw existingError;
      if (existing && existing.length > 0) {
        Alert.alert("Already on your list", `${item.name} is already on your shopping list.`);
        return;
      }

      // Routed through the shopping module rather than a direct insert, so
      // this shares the one quantity formula (threshold-exit, not the old
      // storage-type-blind `restock_threshold || 1`) and vendor-stamping
      // logic with every other add path (spec §9.3). `?? null`, not a bare
      // read: `preferred_vendor_id` comes back `undefined` (not `null`) on
      // rows fetched before the column-adding migration lands, since the
      // untyped client casts through `as FoodInventoryItem[]` regardless of
      // what the row actually has.
      await addSuggestions(user.id, [
        {
          name: item.name,
          foodInventoryId: item.id,
          vendorId: item.preferred_vendor_id ?? null,
          quantity: Math.max(1, lowThresholdFor(item) - item.state.totalQuantity + 1),
          unit: item.unit,
          priority: item.state.isOut ? 1 : 2,
          reasons: ["added from inventory"],
        },
      ]);

      Alert.alert("Success", `${item.name} added to shopping list`);
    } catch (error: any) {
      console.error("Error adding to shopping list:", error);
      Alert.alert("Error", "Failed to add to shopping list");
    } finally {
      addingToShoppingListIds.current.delete(item.id);
    }
  };

  // B1: the one-tap consume verb. RPC first, then refetch — the projection is
  // the only quantity truth on screen, so we re-read rather than hand-patch
  // state. consumed === 0 means the RPC moved nothing (already empty / not
  // ours); surface it instead of pretending.
  const handleConsumeOne = async (item: InventoryItemWithState) => {
    try {
      const consumed = await consumeOneUnit(item.id);
      if (consumed === 0) {
        Alert.alert("Nothing to use", `${item.name} is already out of stock.`);
        return;
      }
      fetchInventory();
    } catch (e) {
      console.error("consume failed:", e);
      Alert.alert("Error", `Couldn't mark ${item.name} as used.`);
    }
  };

  // B2: toss = zero the stock, keep the row and its history. Reason is
  // optional and becomes waste analytics (event trail, D4).
  const handleToss = (item: InventoryItemWithState) => {
    const toss = async (reason?: string) => {
      try {
        const discarded = await discardItem(item.id, reason);
        if (discarded === 0) {
          Alert.alert("Nothing to toss", `${item.name} is already out of stock.`);
          return;
        }
        fetchInventory();
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

  const handleLongPress = (item: InventoryItemWithState) => {
    const needsRestockFridge = item.state.needsFridgeRestock;
    const inStock = item.state.totalQuantity > 0;

    // Build action sheet options dynamically
    const options: string[] = ['View Details', 'Edit Details', 'Delete Item'];
    const actions: (() => void)[] = [
      () => handleViewItem(item),
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

    // B1/B2 verbs, only when there is stock to act on. Inserted after "Edit
    // Details" so the destructive "Delete Item" stays last-before-Cancel.
    if (inStock) {
      options.splice(2, 0, 'Used One', 'Toss Item…');
      actions.splice(2, 0, () => handleConsumeOne(item), () => handleToss(item));
    }

    // "Add to Shopping List" after the stock verbs — un-gated (spec §9.3):
    // every item can be topped up, not just ones already at zero, now that
    // the quantity is threshold-exit rather than the old out-of-stock-only
    // restock_threshold read. Positions are DERIVED (not hardcoded) because
    // the B1/B2 verbs above are conditional and would shift fixed indices.
    const afterEdit = options.indexOf('Edit Details') + 1 + (inStock ? 2 : 0);
    options.splice(afterEdit, 0, 'Add to Shopping List');
    actions.splice(afterEdit, 0, () => handleAddToShoppingList(item));

    // Add "Restock Fridge" if multi-location and needs restock (always after
    // "Add to Shopping List", which is now unconditional).
    if (needsRestockFridge) {
      options.splice(afterEdit + 1, 0, 'Restock Fridge');
      actions.splice(afterEdit + 1, 0, () => {
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

  // `sourceLocationId` is null for "from store" (units enter inventory);
  // otherwise it is the id of the exact location row the modal offered, so no
  // lookup by location name is needed here and the ambiguity that lookup had
  // (two rows may share a location) is gone at the source.
  const handleRestockConfirm = async (sourceLocationId: string | null, quantity: number) => {
    if (!restockingItem) return;

    try {
      // Find the target location (ready to consume)
      const targetLocation = restockingItem.locations.find(loc => loc.is_ready_to_consume);

      if (!targetLocation) {
        Alert.alert("Error", "Could not find target location");
        return;
      }

      await transferInventoryUnits(
        restockingItem.id,
        sourceLocationId,
        targetLocation.id,
        quantity,
      );

      // Optimistic update: update local state
      setItems(prevItems =>
        prevItems.map(item => {
          if (item.id !== restockingItem.id) return item;

          // Match on the ids the RPC actually moved. sourceLocationId is null
          // for "from store", and no row id equals null, so that branch is
          // inert without a separate guard.
          const updatedLocations = item.locations.map(loc => {
            if (loc.id === targetLocation.id) {
              return { ...loc, quantity: loc.quantity + quantity };
            }
            if (loc.id === sourceLocationId) {
              return { ...loc, quantity: loc.quantity - quantity };
            }
            return loc;
          });

          // Re-project rather than recompute by hand: the projection is the
          // one place quantity math lives, and the optimistic row has to
          // agree with what the next fetch will produce.
          const state = projectItemStock({
            item,
            locations: updatedLocations,
            todayLocalDate: getLocalDateString(),
          });

          return {
            ...item,
            locations: updatedLocations,
            state,
            // The RPC resyncs food_inventory.quantity to sum(locations)
            // (20260730100000:153-157); carry it so the whole in-memory row
            // matches the server rather than half-updating it.
            quantity: state.totalQuantity,
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
          matchesCategory = !item.state.isOut;
        } else if (selectedCategory.slug === "out-of-stock") {
          // "Out of Stock" shows all out-of-stock items
          matchesCategory = item.state.isOut;
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
      // Soonest-expiring first; no (or unparseable) date goes to the end.
      // Keyed off `state.daysLeft`, not the raw `expiration_date` column, so
      // this screen has exactly one source of date truth — the projection.
      // Ordering is identical for well-formed dates (daysLeft is monotone in
      // expiration_date against a single "today"), and strictly better for a
      // malformed one: `projectItemStock` normalises that to `daysLeft: null`
      // and it sorts to the end, where the raw comparison produced NaN and an
      // implementation-defined position.
      const ad = a.state.daysLeft;
      const bd = b.state.daysLeft;
      if (ad === null && bd === null) return 0;
      if (ad === null) return 1; // a goes to end
      if (bd === null) return -1; // b goes to end
      return ad - bd;
    });

  // Bands and day counts come from the projection; this only picks copy/tone.
  // A non-null `tone` renders as a Badge; `null` is the plain muted date line.
  const formatExpirationDate = (
    item: InventoryItemWithState,
  ): { text: string; tone: BadgeTone | null } | null => {
    const { expiration, daysLeft } = item.state;
    if (!item.expiration_date || expiration === null) return null;
    if (expiration === "expired") return { text: "Expired", tone: "danger" };
    if (expiration === "today") return { text: "Expires today", tone: "warning" };
    if (expiration === "soon") return { text: `Exp: ${daysLeft}d left`, tone: "warning" };
    // `parseLocalDate`, not `new Date(str)`: the bare constructor reads a
    // YYYY-MM-DD literal as UTC midnight, and toLocaleDateString then renders
    // the PREVIOUS calendar day everywhere west of Greenwich — so an item
    // stored as Aug 15 displayed "Aug 14" for this user.
    return {
      text: `Exp: ${parseLocalDate(item.expiration_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      tone: null,
    };
  };

  // Render function for grid items
  const renderGridItem = ({ item }: { item: InventoryItemWithState }) => {
    const expiration = formatExpirationDate(item);

    // Badge logic
    const needsRestockFridge = item.state.needsFridgeRestock;
    const isLowTotalStock = item.state.isLow;

    const hasNoCategories = item.categories.length === 0;

    return (
      // Both gestures live on the Card itself: the whole tile — including the
      // 12pt padding ring — is the tap target, and press feedback matches every
      // other Card in the app.
      <Card
        variant="row"
        style={styles.gridItem}
        onPress={() => handleViewItem(item)}
        onLongPress={() => handleLongPress(item)}
      >
        {/* Product Image */}
        <View style={styles.gridImageContainer}>
          {item.image_primary_url ? (
            <Image
              source={{ uri: item.image_primary_url }}
              style={styles.gridImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.gridImagePlaceholder}>
              <Package size={40} color={colors.textFaint} />
            </View>
          )}

          {/* Uncategorized icon overlay on bottom-left */}
          {hasNoCategories && (
            <View style={styles.uncategorizedIconContainer}>
              <Tag size={icons.sm} color={colors.accents.inventory} strokeWidth={icons.strokeWidth} />
            </View>
          )}

          {/* B1: one-tap "used one" on the tile itself. POINTER-ONLY shortcut
              (same ruling as StationRow's chevron): the Card is a
              TouchableOpacity, which groups its subtree for VoiceOver on iOS,
              so this button is not independently focusable — the accessible path to
              the same verb is the long-press menu and the detail screen.
              brand fill + onBrand glyph per style rules 2/15. */}
          {item.state.totalQuantity > 0 && (
            <TouchableOpacity
              style={styles.useOneButton}
              onPress={() => handleConsumeOne(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Use one ${item.name}`}
            >
              <Minus size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
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
            Qty: {item.state.totalQuantity} {item.unit}
            {item.storage_type === 'multi-location' && item.state.readyQuantity > 0 && (
              <Text style={styles.gridItemQuantityDetail}> ({item.state.readyQuantity} Ready)</Text>
            )}
          </Text>
          {ratesById.get(item.id) && ratesById.get(item.id)!.daysUntilOut > 0 && ratesById.get(item.id)!.daysUntilOut <= MAX_DISPLAY_DAYS && (
            <Text style={styles.forecastText}>
              ~{ratesById.get(item.id)!.daysUntilOut}d left
            </Text>
          )}
          {/* Stock/expiry chips live BELOW the photo, not over it: a Badge is a
              15%-alpha tint fill, which is unreadable on the white image well. */}
          {(needsRestockFridge || isLowTotalStock || expiration) && (
            <View style={styles.gridBadges}>
              {needsRestockFridge && <Badge tone="inventory" label="Restock Fridge" />}
              {isLowTotalStock && <Badge tone="warning" label="Low" />}
              {expiration && (expiration.tone ? (
                <Badge tone={expiration.tone} label={expiration.text} />
              ) : (
                <Text style={styles.gridItemExpiration}>{expiration.text}</Text>
              ))}
            </View>
          )}
        </View>
      </Card>
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
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
            <View style={styles.searchBar}>
              <Search size={icons.md} color={colors.textFaint} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search items..."
                placeholderTextColor={colors.textFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSearchQuery("")}
                  activeOpacity={0.7}
                  style={styles.searchActionButton}
                >
                  <X size={icons.md} color={colors.textFaint} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => setShowBarcodeScanner(true)}
                  activeOpacity={0.7}
                  style={styles.searchActionButton}
                >
                  <ScanBarcode size={icons.md} color={colors.textFaint} />
                </TouchableOpacity>
              )}
            </View>
            <IconButton icon={Plus} onPress={handleAddItem} accessibilityLabel="Add food" />
          </View>

          {/* Title */}
          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              <Package size={26} color={colors.accents.inventory} strokeWidth={icons.strokeWidth} />
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

          {/* Expiring soon — pinned above the grid */}
          {(() => {
            // C3: the shared expiring definition (expiryPolicy.ts) — same rule
            // the Loop Hub's inventory station uses, so the two surfaces can
            // no longer disagree. Adds the C1 aging policy for free: an item
            // expired past its category's grace window is stale, not urgent,
            // and leaves this panel (it awaits the audit/review flow instead).
            const expiring = filteredItems.filter(
              (it) => isExpiringSoon(it.state, it.categories.map((c) => c.name)),
            )
              // Rescue-first WITHIN the section, overriding the grid's plain
              // soonest-first order. Same objection that ruled out a "+k more"
              // cap applies to the scroll: expired days are negative, so
              // inheriting the grid order puts the least actionable rows —
              // things that went off months ago — in the visible five and
              // pushes the item expiring tomorrow below the fold. Still
              // rescuable (daysLeft >= 0) ascending first, then the expired
              // ones most-recent-first. One rule: nearest to today wins, and
              // the future beats the past.
              .sort((a, b) => {
                const ad = a.state.daysLeft ?? 0;
                const bd = b.state.daysLeft ?? 0;
                if (ad >= 0 && bd >= 0) return ad - bd;
                if (ad < 0 && bd < 0) return bd - ad;
                return ad >= 0 ? -1 : 1;
              });
            if (expiring.length === 0) return null;
            return (
              <View style={styles.expiringSection}>
                <Text style={styles.expiringTitle}>
                  Expiring soon{expiring.length > 1 ? ` (${expiring.length})` : ""}
                </Text>
                {/* Bounded height with internal scroll rather than a "+k more"
                    cap. The `"expired"` band has NO lower bound, so an in-stock
                    item that expired months ago stays here forever and sorts
                    FIRST (soonest-daysLeft first, and expired days are
                    negative) — a cap would push genuinely rescuable items out
                    of view behind the stalest ones. Scrolling bounds the chrome
                    above the grid while keeping every row reachable, and needs
                    no policy decision about when an expired item stops
                    mattering. Safe to nest: the parent is a plain View and the
                    grid below is a sibling FlatList, not an enclosing scroller. */}
                <ScrollView
                  style={styles.expiringList}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator
                  /* The list is filtered by `searchQuery`, so search-then-tap is
                     the natural flow — and the default ("never") makes the first
                     tap with the keyboard up only dismiss the keyboard. */
                  keyboardShouldPersistTaps="handled"
                >
                  {expiring.map((it) => (
                    <TouchableOpacity key={it.id} onPress={() => handleViewItem(it)} style={styles.expiringRow}>
                      <Text style={styles.expiringName} numberOfLines={1}>{it.name}</Text>
                      {it.state.expiration === "expired" ? (
                        <Badge tone="danger" label="Expired" />
                      ) : (
                        <Badge
                          tone="warning"
                          label={it.state.expiration === "today" ? "Today" : `${it.state.daysLeft}d left`}
                        />
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })()}

        {/* Items Grid */}
        <FlatList
          data={filteredItems}
          renderItem={renderGridItem}
          keyExtractor={(item) => item.id}
          numColumns={NUM_COLUMNS}
          style={styles.flatList}
          contentContainerStyle={[
            styles.gridContainer,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          columnWrapperStyle={styles.gridRow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
              title="Pull to refresh"
              titleColor={colors.textMuted}
            />
          }
          ListEmptyComponent={
            loading ? (
              <LoadingState />
            ) : (
              <EmptyState
                icon={Package}
                title={(() => {
                  const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
                  if (selectedCategory?.slug === "out-of-stock") {
                    return "No out of stock items";
                  }
                  return "No items found";
                })()}
                body={(() => {
                  const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);
                  if (selectedCategory?.slug === "out-of-stock") {
                    return "Items with zero quantity will appear here";
                  }
                  if (selectedCategory?.slug === "all-products") {
                    return "Add items to start tracking your inventory";
                  }
                  return "Try adjusting your filters or add items to this category";
                })()}
              />
            )
          }
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
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    gap: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    padding: spacing.xs,
  },
  titleContainer: {
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.lg,
    backgroundColor: colors.bg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  pageTitle: {
    ...typography.titleRoot,
    color: colors.text,
  },
  searchBar: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
  },
  searchActionButton: {
    padding: spacing.xs,
  },
  // Banner recipe (spec §5.7): tint fill, 0.3 tint border, warning heading.
  expiringSection: {
    backgroundColor: tint(colors.warning), borderColor: tint(colors.warning, 0.3),
    borderWidth: 1, borderRadius: radii.row,
    marginHorizontal: spacing.screenGutter, marginBottom: spacing.md, padding: spacing.md,
  },
  // 14/600 per the banner recipe — `typography.buttonSm` is exactly that.
  expiringTitle: { ...typography.buttonSm, color: colors.warning, marginBottom: spacing.xs },
  // ~5 rows (26px each); past that the list scrolls instead of growing.
  expiringList: { maxHeight: 130 },
  expiringRow: {
    flexDirection: "row", alignItems: "center",
    justifyContent: "space-between", paddingVertical: spacing.xs,
  },
  expiringName: { ...typography.body, color: colors.text, flexShrink: 1 },
  // Grid Layout Styles
  flatList: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  gridContainer: {
    // flexGrow lets the empty/loading states (which are `flex: 1`, i.e.
    // flexBasis 0) actually fill and center in the viewport instead of
    // collapsing to their own padding. Inert once rows exist.
    flexGrow: 1,
    paddingHorizontal: GRID_PADDING,
    paddingTop: spacing.lg,
    backgroundColor: colors.bg,
  },
  gridRow: {
    justifyContent: "flex-start",
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  // Fill/radius/border all come from `Card variant="row"`; the tile only sets width.
  gridItem: {
    width: ITEM_WIDTH,
  },
  gridImageContainer: {
    width: "100%",
    aspectRatio: 1,
    position: "relative",
    backgroundColor: colors.imageWell,
    borderRadius: radii.control,
    overflow: "hidden",
  },
  gridImage: {
    width: "100%",
    height: "100%",
    borderRadius: radii.control,
  },
  gridImagePlaceholder: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.imageWell,
  },
  useOneButton: {
    position: "absolute",
    bottom: spacing.xs,
    right: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  uncategorizedIconContainer: {
    position: "absolute",
    bottom: spacing.xs,
    left: spacing.xs,
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  gridItemInfo: {
    paddingTop: spacing.sm,
  },
  gridItemName: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 2,
    lineHeight: 16,
  },
  gridItemBrand: {
    fontSize: 11,
    color: colors.textMuted,
    marginBottom: spacing.xs,
    lineHeight: 14,
  },
  gridItemQuantity: {
    fontSize: 11,
    fontWeight: "500",
    color: colors.textMuted,
    marginBottom: 2,
  },
  gridItemQuantityDetail: {
    fontSize: 10,
    fontWeight: "400",
    color: colors.textFaint,
  },
  gridItemExpiration: {
    fontSize: 10,
    color: colors.textMuted,
    alignSelf: "center",
  },
  forecastText: { fontSize: 11, color: colors.accents.shopping },
  gridBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
});
