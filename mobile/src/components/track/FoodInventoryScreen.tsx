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
  Platform,
  Animated,
  Easing,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AlertTriangle, ArrowDownAZ, ArrowUpDown, CalendarClock, Camera, Check, ChevronLeft, Clock, Eye, Layers, Pencil, Plus, Minus, RefreshCw, Search, Package, ShoppingCart, ScanBarcode, SlidersHorizontal, Trash2, Truck, X, Tag } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Button, Card, EmptyState, IconButton, LoadingState, UndoToast } from "@/src/components/ui";
import type { BadgeTone, UndoToastContent } from "@/src/components/ui";
import {
  FoodCategory,
  FoodSubcategory,
} from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import {
  fetchInventoryWithState,
  transferInventoryUnits,
  consumeOneUnit,
  restoreOneUnit,
  discardItem,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import { addSuggestions, fetchConsumptionRates } from "@/src/lib/supabase/shopping";
import { projectItemStock, lowThresholdFor } from "@/src/lib/stockState";
import { isExpiringSoon, reviewExpiry } from "@/src/lib/expiryPolicy";
import { formatQuantity } from "@/src/lib/units";
import { matchesInventoryQuery } from "@/src/lib/inventorySearch";
import { mealsUsingConcepts } from "@/src/lib/useItUp";
import { fetchMealLibrary } from "@/src/lib/supabase/mealLibrary";
import { MAX_DISPLAY_DAYS, type ConsumptionEstimate } from "@/src/lib/consumptionRate";
import { getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { RestockModal } from "./RestockModal";
import { ExpiryReviewModal } from "./ExpiryReviewModal";
import { BulkCaptureModal } from "./BulkCaptureModal";
import { ItemActionsSheet, type ItemAction } from "./ItemActionsSheet";
import { CategoryTabs } from "./CategoryTabs";
import { SubcategoryFilterSheet } from "./SubcategoryFilterSheet";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { getProductByBarcode } from "@/src/services/openFoodFactsApi";

interface FoodInventoryScreenProps {
  onClose: () => void;
}

const SCREEN_WIDTH = Dimensions.get('window').width;
const GRID_PADDING = spacing.screenGutter;
const GRID_GAP = spacing.md;
// A6: two columns — three truncated nearly every product name, and the name
// is the identifier. Wider tiles also give the B1 quick-verb real estate.
const NUM_COLUMNS = 2;

// B6: segment display names, one place.
// Kitchen words, not software words: nobody calls food "active". "Expiring"
// deliberately covers both about-to-go and already-past-date-but-still-worth-
// dealing-with (see expiryPolicy's grace windows) — the action is the same for
// both, and the tile badge says which is which. "Past" is what falls out of
// that grace, plus anything run down to zero.
const SEGMENT_LABELS = {
  active: "Available", expiring: "Expiring", low: "Low", archive: "Past",
} as const;
const ITEM_WIDTH = (SCREEN_WIDTH - (GRID_PADDING * 2) - (GRID_GAP * (NUM_COLUMNS - 1))) / NUM_COLUMNS;

// Height of the condensed bar that stands in for the search row and the page
// title once you scroll. Everything those two rows can do has to survive in
// here, or scrolling would take away function rather than chrome.
const SLIM_BAR_HEIGHT = 48;

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
  // A typed query outranks every filter on the screen; a blank one hands the
  // screen straight back to them.
  const searching = searchQuery.trim().length > 0;
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

  // A7 + B6: status-first segments. Active is the working default;
  // Expiring and Low are the two states that demand action; Archive holds
  // out-of-stock and stale-expired rows. Category tabs stay the secondary,
  // taxonomy-browsing axis.
  const [view, setView] = useState<"active" | "expiring" | "low" | "archive">("active");

  // A2: the expiring panel became a one-line banner opening this review sheet.
  const [showReviewModal, setShowReviewModal] = useState(false);
  // E6: itemId -> meal names, resolved through concept links when the sheet
  // opens. Decoration — a failed fetch just renders rows without meal hints.
  const [mealsByItemId, setMealsByItemId] = useState<Map<string, string[]>>(new Map());

  // E5: photo/receipt bulk-capture sheet. E3: a barcode from a failed scan
  // lookup rides into the capture flow and attaches to its new item.
  const [showCaptureModal, setShowCaptureModal] = useState(false);
  const [captureBarcode, setCaptureBarcode] = useState<string | null>(null);

  // A9: themed long-press actions sheet (replaces the light-appearance
  // system ActionSheetIOS that couldn't match the theme).
  const [actionsItem, setActionsItem] = useState<InventoryItemWithState | null>(null);

  // B3: scan-first add chooser — the + button offers capture paths before
  // the manual form, inverting the old form-first flow.
  const [showAddSheet, setShowAddSheet] = useState(false);

  // B4: sort order for the grid. Soonest-expiry stays the default — it's the
  // one ordering that drives action.
  const [sortBy, setSortBy] = useState<"expiry" | "name" | "recent" | "quantity">("expiry");
  const [showSortSheet, setShowSortSheet] = useState(false);
  const [showFilterSheet, setShowFilterSheet] = useState(false);

  // B7: batch selection for kitchen audits — long-press -> Select Multiple.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Collapsing header. The search row and the title slide up under a condensed
  // bar as you scroll, handing their space to the grid; the category tabs and
  // segment chips ride up with them but stay on screen, because losing your
  // filters mid-scroll costs more than the space it would win.
  //
  // Transform only, never height: `useNativeDriver` cannot animate height, and
  // a JS-driven height on a list of photos is exactly where scroll jank comes
  // from. The two blocks translate by the same amount and the lower one is
  // extended past the bottom edge by that distance, so the grid gains real
  // estate instead of dragging a gap up behind it.
  const scrollY = useRef(new Animated.Value(0)).current;
  const [collapsibleHeight, setCollapsibleHeight] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  const listRef = useRef<FlatList<InventoryItemWithState> | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const collapseDistance = Math.max(0, collapsibleHeight - SLIM_BAR_HEIGHT);
  const headerTranslate = collapseDistance > 0
    ? scrollY.interpolate({
        inputRange: [0, collapseDistance],
        outputRange: [0, -collapseDistance],
        extrapolate: "clamp",
      })
    : 0;
  // Fades in over the back half of the travel, so the condensed bar arrives
  // just as the rows it replaces finish disappearing behind it.
  const slimBarOpacity = collapseDistance > 0
    ? scrollY.interpolate({
        inputRange: [collapseDistance / 2, collapseDistance],
        outputRange: [0, 1],
        extrapolate: "clamp",
      })
    : 0;

  // The bar must not swallow taps while it is invisible. One boolean flipped at
  // the threshold — not a per-frame state update.
  useEffect(() => {
    if (collapseDistance <= 0) return;
    const id = scrollY.addListener(({ value }) => {
      const next = value >= collapseDistance - 1;
      setCollapsed((prev) => (prev === next ? prev : next));
    });
    return () => scrollY.removeListener(id);
  }, [collapseDistance, scrollY]);

  // Decrementing is a one-tap, silent mutation on a small target, so it needs
  // an acknowledgement — otherwise you cannot tell a successful "used one" from
  // a missed tap. An alert would be worse than the problem: it demands a
  // dismissal for something you meant to do. A toast states what happened and
  // what is left, then leaves — and carries the correction for the mis-tap the
  // small target invites, which otherwise means opening the item to edit a
  // quantity back up.
  // The bar itself — animation, clock, exit — belongs to `UndoToast`; this
  // screen only decides what it says and when.
  const [toast, setToast] = useState<UndoToastContent | null>(null);

  const hideToast = () => setToast(null);

  const showToast = (title: string, detail: string, undo?: () => void) => {
    setToast({ title, detail, undo });
  };

  // Pull-to-refresh feedback. The gesture and the `refreshing` lifecycle still
  // come from RefreshControl, but on iOS its own spinner does not render in
  // this app, so the indicator is drawn here instead. Android's RefreshControl
  // draws its own perfectly well, hence the platform gate — two spinners would
  // be worse than none.
  const refreshSpin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!refreshing) {
      refreshSpin.setValue(0);
      return;
    }
    const anim = Animated.loop(
      Animated.timing(refreshSpin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    anim.start();
    return () => anim.stop();
  }, [refreshing, refreshSpin]);
  const refreshRotation = refreshSpin.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  // Overscroll at the top is negative, so the same scroll value that drives the
  // collapsing header also drives the pull. Feedback has to start while the
  // finger is still down — waiting for release is what made the gesture feel
  // dead — so the glyph fades in and turns with the drag, then the loop above
  // takes over once the fetch is actually running.
  const pullOpacity = scrollY.interpolate({
    inputRange: [-60, -12],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });
  const pullRotation = scrollY.interpolate({
    inputRange: [-90, 0],
    outputRange: ["360deg", "0deg"],
    extrapolate: "clamp",
  });

  // Search lives in the row that just scrolled away, so reaching it means
  // bringing that row back first. The delay lets the scroll settle before the
  // keyboard takes over the screen.
  const openSearch = () => {
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    setTimeout(() => searchInputRef.current?.focus(), 300);
  };

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
      // Scheduled-supply items are left out: their pace is a delivery
      // calendar, not a consumption rate, and the menu rotates too fast for
      // any single dish to accumulate a history worth reading.
      const totalsById = new Map(
        items
          .filter((it) => !it.is_scheduled_supply)
          .map((it) => [it.id, it.state.totalQuantity]),
      );
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
    setShowAddSheet(true);
  };

  // B3: capture-first add paths. Scanning and photographing come before the
  // manual form — additions that take seconds become habits.
  const addActions = (): ItemAction[] => [
    { label: "Scan Barcode", icon: ScanBarcode, onPress: () => setShowBarcodeScanner(true) },
    { label: "Photograph Shelf or Receipt", icon: Camera, onPress: () => setShowCaptureModal(true) },
    // A delivery is a different act from adding an item: eight things arrive
    // at once sharing a vendor and a date, and the per-item form asks all of
    // that eight times. Filed above the manual form because it is the faster
    // path whenever it applies.
    { label: "Log a Delivery", icon: Truck, onPress: () => router.push("/(tabs)/track/food-inventory/delivery") },
    { label: "Enter Manually", icon: Pencil, onPress: () => router.push("/(tabs)/track/food-inventory/add") },
  ];

  // B4: sort options, applied to the grid below.
  const sortActions = (): ItemAction[] => [
    { label: "Soonest Expiring", icon: CalendarClock, onPress: () => setSortBy("expiry") },
    { label: "Name", icon: ArrowDownAZ, onPress: () => setSortBy("name") },
    { label: "Recently Added", icon: Clock, onPress: () => setSortBy("recent") },
    { label: "Quantity", icon: Layers, onPress: () => setSortBy("quantity") },
  ];

  // B7 helpers.
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const exitSelectMode = () => { setSelectMode(false); setSelectedIds(new Set()); };
  const batchToss = () => {
    const chosen = items.filter((i) => selectedIds.has(i.id) && i.state.totalQuantity > 0);
    if (chosen.length === 0) { exitSelectMode(); return; }
    Alert.alert(
      `Toss ${chosen.length} item${chosen.length === 1 ? "" : "s"}?`,
      "Remaining stock goes to zero for every selected item. History survives.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Toss all", style: "destructive",
          onPress: async () => {
            for (const it of chosen) {
              try { await discardItem(it.id, "batch audit"); }
              catch (e) { console.error("batch toss failed for", it.name, e); }
            }
            exitSelectMode();
            fetchInventory();
          },
        },
      ],
    );
  };
  const batchShop = async () => {
    const chosen = items.filter((i) => selectedIds.has(i.id));
    for (const it of chosen) {
      try { await handleAddToShoppingList(it); }
      catch (e) { console.error("batch shop failed for", it.name, e); }
    }
    exitSelectMode();
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
      const { consumed, locationId } = await consumeOneUnit(item.id);
      if (consumed === 0) {
        Alert.alert("Nothing to use", `${item.name} is already out of stock.`);
        return;
      }
      showToast(
        `Used one ${item.name}`,
        formatQuantity(item.state.totalQuantity - consumed, item.unit),
        () => handleUndoConsume(item, locationId),
      );
      fetchInventory();
    } catch (e) {
      console.error("consume failed:", e);
      Alert.alert("Error", `Couldn't mark ${item.name} as used.`);
    }
  };

  // The unit goes back to the location it came from, which is why consume
  // reports one. The consume event is not deleted — the trail is append-only —
  // so a compensating restore event is written and the rate estimator nets the
  // pair out.
  const handleUndoConsume = async (item: InventoryItemWithState, locationId: string | null) => {
    hideToast();
    try {
      const restored = await restoreOneUnit(item.id, locationId);
      if (restored === 0) {
        Alert.alert("Couldn't undo", `${item.name} could not be put back.`);
        return;
      }
      fetchInventory();
    } catch (e) {
      console.error("undo consume failed:", e);
      Alert.alert("Error", `Couldn't undo the change to ${item.name}.`);
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
    setActionsItem(item);
  };

  // A9: the actions the themed sheet offers for the long-pressed item — the
  // same set the old native menu carried, now consistent on both platforms
  // and matching the theme.
  const itemActions = (item: InventoryItemWithState): ItemAction[] => {
    const inStock = item.state.totalQuantity > 0;
    const actions: ItemAction[] = [
      { label: "View Details", icon: Eye, onPress: () => handleViewItem(item) },
      { label: "Edit Details", icon: Pencil, onPress: () => handleEditItem(item) },
    ];
    if (inStock) {
      actions.push(
        { label: "Used One", icon: Minus, onPress: () => handleConsumeOne(item) },
        { label: "Toss Item…", icon: Trash2, onPress: () => handleToss(item) },
      );
    }
    actions.push({ label: "Add to Shopping List", icon: ShoppingCart, onPress: () => handleAddToShoppingList(item) });
    actions.push({
      label: "Select Multiple…", icon: Check,
      onPress: () => { setSelectMode(true); setSelectedIds(new Set([item.id])); },
    });
    if (item.state.needsFridgeRestock) {
      actions.push({
        label: "Restock Fridge", icon: Package,
        onPress: () => { setRestockingItem(item); setShowRestockModal(true); },
      });
    }
    actions.push({
      label: "Delete Item", icon: Trash2, destructive: true,
      onPress: () => {
        Alert.alert(
          "Delete Item",
          `Are you sure you want to delete ${item.name}?`,
          [
            { text: "Cancel", style: "cancel" },
            { text: "Delete", style: "destructive", onPress: () => handleDeleteItem(item.id) },
          ],
        );
      },
    });
    return actions;
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
        // D2: an unknown barcode is a fallback, not a dead end — carry the
        // scanned code into the add form so it isn't typed twice.
        // E3: the vision fallback — photograph the label and let the model
        // read what the barcode database couldn't. The scanned code rides
        // along and lands on whatever single new item the capture creates.
        Alert.alert(
          "Product Not Found",
          "This barcode isn't in the product database yet.",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Photograph label",
              onPress: () => { setCaptureBarcode(barcode); setShowCaptureModal(true); },
            },
            {
              text: "Add manually",
              onPress: () => router.push({
                pathname: "/(tabs)/track/food-inventory/add" as never,
                params: { barcode },
              } as never),
            },
          ],
        );
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
      // A search asks the whole inventory: the category tab, the subcategory
      // filter and (below, via `visibleItems`) the segment all stand aside
      // while there is a query in the field. See inventorySearch.ts.
      if (searching) return matchesInventoryQuery(item, searchQuery);

      // Get the selected category
      const selectedCategory = categories.find(cat => cat.id === selectedCategoryId);

      // Category filter based on selected tab
      let matchesCategory = true;
      if (selectedCategory) {
        if (selectedCategory.slug === "all-products") {
          // A7: genuinely ALL products. The old `!isOut` exclusion predates
          // the Active/Archive segments and silently hid out-of-stock rows
          // from every count — the screen could never agree with the hub's
          // "22 items". Deadness is the segment's job now, not the tab's.
          matchesCategory = true;
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

      return matchesCategory;
    })
    .sort((a, b) => {
      // B4: user-selectable order. Expiry stays keyed off state.daysLeft (the
      // projection is the single date truth); null dates sort last there.
      switch (sortBy) {
        case "name":
          return a.name.localeCompare(b.name);
        case "recent":
          return (b.created_at ?? "").localeCompare(a.created_at ?? "");
        case "quantity":
          return b.state.totalQuantity - a.state.totalQuantity;
        case "expiry":
        default: {
          const ad = a.state.daysLeft;
          const bd = b.state.daysLeft;
          if (ad === null && bd === null) return 0;
          if (ad === null) return 1;
          if (bd === null) return -1;
          return ad - bd;
        }
      }
    });

  // Bands and day counts come from the projection; this only picks copy/tone.
  // A non-null `tone` renders as a Badge; `null` is the plain muted date line.
  // A1: the urgency ladder, driven by the shared expiry policy — danger only
  // for actionably-expired (within grace), warning for today/soon, and a
  // deliberately QUIET neutral "Long expired" for stale items so a wall of
  // year-old red no longer drowns the one thing expiring tomorrow.
  const formatExpirationDate = (
    item: InventoryItemWithState,
  ): { text: string; tone: BadgeTone | null } | null => {
    const { expiration, daysLeft } = item.state;
    if (!item.expiration_date || expiration === null) return null;
    const review = reviewExpiry(item.state, item.categories.map((c) => c.name));
    if (review === "stale") {
      // Past holds two different populations, and the badge is only worth
      // printing for one of them. An out-of-stock row already says "Out of
      // stock" on the line above — repeating that it also expired tells you
      // nothing you can act on, since there is none of it left either way.
      //
      // A row with stock still in it is the case that needs explaining: two
      // cartons of milk sitting under Past looks like a bug until something
      // says the date is why. That is the only time this appears.
      if (item.state.isOut) return null;
      return { text: "Long expired", tone: "neutral" };
    }
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


  // A8: per-tab counts (items carrying that category; pseudo-tabs get the
  // obvious totals). Cheap: 22 items x few categories.
  const categoryCounts = new Map<string, number>();
  for (const cat of categories) {
    if (cat.slug === "all-products") categoryCounts.set(cat.id, items.length);
    else if (cat.slug === "out-of-stock") categoryCounts.set(cat.id, items.filter((i) => i.state.isOut).length);
    else categoryCounts.set(cat.id, items.filter((i) => i.categories.some((c) => c.id === cat.id)).length);
  }

  // Subcategories of the open category, with per-subcategory item counts. The
  // pseudo-tabs ("All Products", "Out of Stock") own no subcategories, so both
  // lists come out empty and the filter button hides itself.
  const categorySubcategories = selectedCategoryId
    ? subcategories.filter((sub) => sub.category_id === selectedCategoryId)
    : [];
  const subcategoryCounts = new Map<string, number>();
  for (const sub of categorySubcategories) {
    subcategoryCounts.set(
      sub.id,
      items.filter((it) => it.subcategories.some((s) => s.id === sub.id)).length,
    );
  }

  const toggleSubcategory = (subcategoryId: string) =>
    setSelectedSubcategoryIds((prev) =>
      prev.includes(subcategoryId)
        ? prev.filter((id) => id !== subcategoryId)
        : [...prev, subcategoryId],
    );

  // E6: resolve which meals consume each attention item, deterministically
  // through concept links (the AI matcher curates links; this is pure graph
  // walking, no model call).
  const loadUseItUp = async () => {
    try {
      const library = await fetchMealLibrary();
      const invConcepts = new Map(library.inventory.map((r) => [r.id, r.conceptIds]));
      const meals = library.meals.map((m) => ({
        name: m.name,
        items: m.items.map((it) => ({
          conceptIds: library.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
        })),
      }));
      const next = new Map<string, string[]>();
      for (const it of items) {
        const names = mealsUsingConcepts(invConcepts.get(it.id) ?? [], meals);
        if (names.length > 0) next.set(it.id, names);
      }
      setMealsByItemId(next);
    } catch (e) {
      console.error("use-it-up fetch failed:", e);
    }
  };

  // A7/A2 derived sets. Archive = out-of-stock or stale-expired (the C1
  // aging policy); everything else is the working inventory. The attention
  // list feeds the banner + review sheet and is computed over ALL items —
  // urgency does not care which tab is open.
  const isArchived = (it: InventoryItemWithState) =>
    it.state.isOut || reviewExpiry(it.state, it.categories.map((c) => c.name)) === "stale";
  const activeItems = filteredItems.filter((it) => !isArchived(it));
  const archiveItems = filteredItems.filter(isArchived);
  const expiringItems = activeItems.filter((it) =>
    isExpiringSoon(it.state, it.categories.map((c) => c.name)));
  const lowItems = activeItems.filter((it) => it.state.isLow);
  // Matches reach the grid whatever segment they belong to — including Past,
  // which is still your inventory and is where a half-remembered item has most
  // likely gone. Nothing extra marks those matches out: an out-of-stock tile
  // already reads "Out of stock" where the quantity goes, and a long-expired
  // one still carries its badge, so the tiles say it themselves.
  const visibleItems =
    searching ? filteredItems
    : view === "active" ? activeItems
    : view === "expiring" ? expiringItems
    : view === "low" ? lowItems
    : archiveItems;
  const attentionItems = items
    .filter((it) => isExpiringSoon(it.state, it.categories.map((c) => c.name)))
    .sort((a, b) => (a.state.daysLeft ?? 0) - (b.state.daysLeft ?? 0));

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
        onPress={() => (selectMode ? toggleSelected(item.id) : handleViewItem(item))}
        onLongPress={() => (selectMode ? undefined : handleLongPress(item))}
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

          {/* B7: selection state, top-left, only in select mode */}
          {selectMode && (
            <View style={[styles.selectCircle, selectedIds.has(item.id) && styles.selectCircleOn]}>
              {selectedIds.has(item.id) && (
                <Check size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />
              )}
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
            {formatQuantity(item.state.totalQuantity, item.unit)}
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
          {/* The two rows that stand down while you scroll. */}
          <Animated.View
            onLayout={(e) => setCollapsibleHeight(e.nativeEvent.layout.height)}
            style={{ transform: [{ translateY: headerTranslate }] }}
          >
          {/* Header with Back, Search, and Add Button */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
            <View style={styles.searchBar}>
              <Search size={icons.md} color={colors.textFaint} />
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Search items..."
              autoCapitalize="none"
              autoCorrect={false}
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
            <IconButton icon={Camera} onPress={() => setShowCaptureModal(true)} accessibilityLabel="Capture inventory from a photo" />
            <IconButton icon={Plus} onPress={handleAddItem} accessibilityLabel="Add food" />
          </View>

          {/* Title. A2: the attention signal is a compact shortcut here rather
              than a full-width banner — a caution glyph and a count, opening
              the same triage sheet. The count is the C3 shared definition over
              the WHOLE inventory, not the tab/search-filtered slice. */}
          <View style={styles.titleContainer}>
            <View style={styles.titleRow}>
              <Package size={26} color={colors.accents.inventory} strokeWidth={icons.strokeWidth} />
              <Text style={styles.pageTitle}>Food Inventory</Text>
              {attentionItems.length > 0 && (
                <TouchableOpacity
                  style={styles.attentionChip}
                  onPress={() => { setShowReviewModal(true); loadUseItUp(); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Review ${attentionItems.length} ${attentionItems.length === 1 ? "item" : "items"} needing attention`}
                >
                  <AlertTriangle size={icons.sm} color={colors.warning} strokeWidth={icons.strokeWidth} />
                  <Text style={styles.attentionChipCount}>{attentionItems.length}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
          </Animated.View>

          {/* Rides up with the header but never leaves: filters stay reachable
              at any scroll position. Extended below the screen edge by exactly
              the collapse distance so the grid gains that space. */}
          <Animated.View
            style={[
              styles.belowHeader,
              { marginBottom: -collapseDistance, transform: [{ translateY: headerTranslate }] },
            ]}
          >

          {/* Category Tabs. A search ignores the category, so the tabs step
              aside rather than sit there looking as if they still bite. */}
          {!searching && (
            <CategoryTabs
              countsByCategoryId={categoryCounts}
              categories={categories}
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={(categoryId) => {
                setSelectedCategoryId(categoryId);
                setSelectedSubcategoryIds([]); // Clear subcategory filters when changing category
              }}
            />
          )}

          {/* A7: stock-state segments. Interactive control -> brand
              (style rule 2); counts keep the hidden rows honest. */}
          <View style={styles.viewSegments}>
            {searching ? (
              // The strip is gone rather than disabled: with a query in the
              // field it names four subsets, none of which is what you are
              // looking at. What replaces it has to say so out loud, or pills
              // that silently stopped biting would read as a bug.
              <Text style={styles.scopeNote} accessibilityLiveRegion="polite">
                Searching all {items.length} items
              </Text>
            ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentStrip}>
            {(["active", "expiring", "low", "archive"] as const).map((v) => {
              const n = v === "active" ? activeItems.length
                : v === "expiring" ? expiringItems.length
                : v === "low" ? lowItems.length
                : archiveItems.length;
              const selected = view === v;
              // No warning paint here: the title chip is the one place amber
              // appears, so the strip stays a plain set of filters.
              return (
                <TouchableOpacity
                  key={v}
                  style={[styles.viewSegment, selected && styles.viewSegmentSelected]}
                  onPress={() => setView(v)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${SEGMENT_LABELS[v]} (${n})`}
                >
                  <Text style={[styles.viewSegmentText, selected && styles.viewSegmentTextSelected]}>
                    {SEGMENT_LABELS[v]} ({n})
                  </Text>
                </TouchableOpacity>
              );
            })}
            </ScrollView>
            )}
            {/* Pinned tools, fenced off from the scrolling chips by a rule so
                the strip visibly ends instead of colliding with them.
                Subcategory filtering used to own a whole third lane; it is now
                this button plus a sheet. The filter hides itself when the
                current category has no subcategories, so the lane never
                carries a dead control — and a search, which ignores it, is one
                more way for it to be dead. Sort stays either way: it only
                reorders what already matched, and a long list of matches wants
                ordering as much as a browsed one does. */}
            <View style={styles.segmentTools}>
              {!searching && categorySubcategories.length > 0 && (
                <TouchableOpacity
                  style={[styles.sortButton, selectedSubcategoryIds.length > 0 && styles.sortButtonActive]}
                  onPress={() => setShowFilterSheet(true)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    selectedSubcategoryIds.length > 0
                      ? `Filter, ${selectedSubcategoryIds.length} active`
                      : "Filter items"
                  }
                >
                  <SlidersHorizontal
                    size={icons.sm}
                    color={selectedSubcategoryIds.length > 0 ? colors.brand : colors.textMuted}
                    strokeWidth={icons.strokeWidth}
                  />
                  {selectedSubcategoryIds.length > 0 && (
                    <Text style={styles.filterCount}>{selectedSubcategoryIds.length}</Text>
                  )}
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={styles.sortButton}
                onPress={() => setShowSortSheet(true)}
                accessibilityRole="button"
                accessibilityLabel="Sort items"
              >
                <ArrowUpDown size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              </TouchableOpacity>
            </View>
          </View>

        {/* Items Grid */}
        <View style={styles.gridWrap}>
        {Platform.OS === "ios" && (
          <Animated.View
            style={[styles.refreshRow, { opacity: refreshing ? 1 : pullOpacity }]}
            pointerEvents="none"
          >
            <Animated.View
              style={{ transform: [{ rotate: refreshing ? refreshRotation : pullRotation }] }}
            >
              <RefreshCw size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
            </Animated.View>
            <Text style={typography.caption}>
              {refreshing ? "Refreshing…" : "Pull to refresh"}
            </Text>
          </Animated.View>
        )}
        <Animated.FlatList
          ref={listRef}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true },
          )}
          scrollEventThrottle={16}
          data={visibleItems}
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
              // B9: the empty state names its cause and carries the next
              // action. A no-results search offers to clear itself; a truly
              // empty inventory points at the fastest add path (scan). It
              // turns on `searching`, not on the raw field, so a stray space
              // does not accuse a perfectly full segment of having no matches.
              <EmptyState
                icon={Package}
                title={
                  searching ? `No matches for “${searchQuery.trim()}”`
                  : view !== "active" ? `Nothing in ${SEGMENT_LABELS[view]}`
                  : "No items yet"
                }
                body={
                  // Nothing left to widen — the search already covered every
                  // item — so the advice is about the words, not the filters.
                  searching ? "Nothing in your inventory matches. Try fewer letters, or clear it."
                  : view === "archive" ? "Out-of-stock and long-expired items land here."
                  : view === "expiring" ? "Nothing needs rescuing right now."
                  : view === "low" ? "Nothing is running low."
                  : "Scan a barcode to add your first item in seconds."
                }
                action={
                  searching
                    ? { label: "Clear search", onPress: () => setSearchQuery("") }
                    : view === "active"
                      ? { label: "Scan an item", onPress: () => setShowBarcodeScanner(true) }
                      : undefined
                }
              />
            )
          }
        />
        </View>
          </Animated.View>

        {/* Restock Modal */}
        {selectMode && (
          <View style={[styles.batchBar, { paddingBottom: insets.bottom + spacing.md }]}>
            <Text style={[typography.buttonSm, styles.batchCount]}>
              {selectedIds.size} selected
            </Text>
            <View style={styles.batchActions}>
              <IconButton icon={Trash2} tone="danger" onPress={batchToss} accessibilityLabel="Toss selected items" />
              <IconButton icon={ShoppingCart} onPress={batchShop} accessibilityLabel="Add selected to shopping list" />
              <Button label="Done" variant="secondary" size="sm" onPress={exitSelectMode} />
            </View>
          </View>
        )}

        <ItemActionsSheet
          visible={showAddSheet}
          title="Add food"
          actions={addActions()}
          onClose={() => setShowAddSheet(false)}
        />

        <ItemActionsSheet
          visible={showSortSheet}
          title="Sort by"
          actions={sortActions()}
          onClose={() => setShowSortSheet(false)}
        />

        <SubcategoryFilterSheet
          visible={showFilterSheet}
          subcategories={categorySubcategories}
          selectedSubcategoryIds={selectedSubcategoryIds}
          countsBySubcategoryId={subcategoryCounts}
          onToggle={toggleSubcategory}
          onClearAll={() => setSelectedSubcategoryIds([])}
          onClose={() => setShowFilterSheet(false)}
        />

        <ItemActionsSheet
          visible={actionsItem !== null}
          title={actionsItem?.name ?? null}
          actions={actionsItem ? itemActions(actionsItem) : []}
          onClose={() => setActionsItem(null)}
        />

        <BulkCaptureModal
          visible={showCaptureModal}
          onClose={() => { setShowCaptureModal(false); setCaptureBarcode(null); }}
          onApplied={fetchInventory}
          attachBarcode={captureBarcode}
        />

        <ExpiryReviewModal
          visible={showReviewModal}
          items={attentionItems}
          onClose={() => setShowReviewModal(false)}
          onConsume={handleConsumeOne}
          onToss={handleToss}
          onShop={handleAddToShoppingList}
          onOpenItem={handleViewItem}
          mealsByItemId={mealsByItemId}
        />

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

        <UndoToast toast={toast} onDismissed={() => setToast(null)} icon={Minus} />

        {/* Condensed bar. A sibling of the container, not a child, so top:0 is
            the true top of the screen and it can own the safe-area inset
            itself. Everything the scrolled-away rows offered is here. */}
        <Animated.View
          style={[styles.slimBar, { paddingTop: insets.top, opacity: slimBarOpacity }]}
          pointerEvents={collapsed ? "auto" : "none"}
        >
          <View style={styles.slimBarRow}>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Back"
            >
              <ChevronLeft size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
            <Text style={styles.slimBarTitle} numberOfLines={1}>Food Inventory</Text>
            {attentionItems.length > 0 && (
              <TouchableOpacity
                style={styles.attentionChip}
                onPress={() => { setShowReviewModal(true); loadUseItUp(); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={`Review ${attentionItems.length} ${attentionItems.length === 1 ? "item" : "items"} needing attention`}
              >
                <AlertTriangle size={icons.sm} color={colors.warning} strokeWidth={icons.strokeWidth} />
                <Text style={styles.attentionChipCount}>{attentionItems.length}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              onPress={openSearch}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Search items"
            >
              <Search size={icons.md} color={colors.text} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setShowCaptureModal(true)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Capture inventory from a photo"
            >
              <Camera size={icons.md} color={colors.brand} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddItem}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Add food"
            >
              <Plus size={icons.md} color={colors.brand} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
          </View>
        </Animated.View>
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
  belowHeader: { flex: 1 },
  gridWrap: { flex: 1 },
  // Overlaid rather than inserted: the grid must not jump down and back as the
  // refresh starts and finishes.
  refreshRow: {
    position: "absolute",
    top: spacing.md, left: 0, right: 0,
    zIndex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  slimBar: {
    position: "absolute",
    top: 0, left: 0, right: 0,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  slimBarRow: {
    height: SLIM_BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.screenGutter,
  },
  slimBarTitle: { ...typography.titleBar, color: colors.text, flex: 1 },
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
  // 14/600 per the banner recipe — `typography.buttonSm` is exactly that.
  // ~5 rows (26px each); past that the list scrolls instead of growing.
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
  sortButton: {
    flexShrink: 0,
    flexDirection: "row", gap: spacing.xs,
    minWidth: 36, height: 36, borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
    alignItems: "center", justifyContent: "center",
  },
  sortButtonActive: {
    backgroundColor: tint(colors.brand),
    borderColor: colors.brand,
  },
  filterCount: { ...typography.caption, fontWeight: "600", color: colors.brand },
  selectCircle: {
    position: "absolute",
    top: spacing.xs, left: spacing.xs,
    width: 26, height: 26, borderRadius: radii.pill,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center", justifyContent: "center",
  },
  selectCircleOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  batchBar: {
    position: "absolute",
    left: 0, right: 0, bottom: 0,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  batchCount: { color: colors.text },
  batchActions: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  // Banner-recipe colors on a pill: the warning read survives, the full-width
  // slab does not.
  attentionChip: {
    marginLeft: "auto",   // far right of the title row
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: tint(colors.warning),
    borderWidth: 1,
    borderColor: tint(colors.warning, 0.3),
  },
  attentionChipCount: { ...typography.buttonSm, color: colors.warning },
  // Its own band, matching the category tabs above it: gutter, vertical
  // breathing room, and a closing rule. Without these the chips sat flush
  // against the tab row's underline and against the screen edge.
  viewSegments: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
    paddingRight: spacing.screenGutter,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.md,
  },
  segmentStrip: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter,
  },
  // Takes the segment strip's place in the lane, so the sort button beside it
  // does not jump when a query starts or ends. The vertical padding is the
  // chips' own, for the same reason.
  scopeNote: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.sm,
  },
  segmentTools: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: spacing.sm,
    paddingLeft: spacing.md,
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
  },
  viewSegment: {
    // md, not lg: the filter button joined this lane, and the fourth segment
    // has to stay at least partly visible or nobody knows the strip scrolls.
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  viewSegmentSelected: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  viewSegmentText: { ...typography.buttonSm, color: colors.textMuted },
  viewSegmentTextSelected: { color: colors.onBrand },
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
