import React, { useEffect, useState, useRef } from "react";
import {
  Alert,
  Animated,
  Easing,
  Platform,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Image,
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  RefreshControl,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ChevronDown, ChevronLeft, ChevronRight, FlipHorizontal, Minus, MoreHorizontal, Package, Pencil,
  Plus, ScanBarcode, ShoppingCart, Trash2,
} from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Button, Card } from "@/src/components/ui";
import { ItemActionsSheet, type ItemAction } from "./ItemActionsSheet";
import { NutritionFactsCard } from "./NutritionFactsCard";
import { ImageLightbox } from "./ImageLightbox";
import { buildNutritionLabel } from "@/src/lib/nutritionLabel";
import {
  consumeOneUnit,
  restockOneUnit,
  discardItem,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import { estimateShelfLifeDays, reviewExpiry } from "@/src/lib/expiryPolicy";
import { formatQuantity, normalizeUnit } from "@/src/lib/units";
import { suggestedRestockThreshold, MAX_DISPLAY_DAYS } from "@/src/lib/consumptionRate";
import { addSuggestions } from "@/src/lib/supabase/shopping";
import { fetchItemDetailContext, type ItemDetailContext } from "@/src/lib/supabase/itemDetail";
import { lowThresholdFor } from "@/src/lib/stockState";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/lib/dates";
import { parseLocalDate } from "@/src/lib/dates";

const SCREEN_WIDTH = Dimensions.get("window").width;
// A3: the product image lives in a CONTAINED well, not a half-screen white
// band — imageWell is sanctioned as a well on a dark card, not as full-bleed
// flooding of the theme. Carousel paging math must use this width.
const WELL_WIDTH = SCREEN_WIDTH - spacing.screenGutter * 2;

interface ViewFoodDetailsScreenProps {
  item: InventoryItemWithState;
  onClose: () => void;
  onRefresh?: () => Promise<void>;
  isPreview?: boolean;
  onAddToInventory?: () => void;
}

const DATE_FORMAT = { month: "long", day: "numeric", year: "numeric" } as const;

/** For TIMESTAMPTZ columns (`created_at`, `updated_at`) — full ISO instants,
 *  which `new Date` resolves to the correct local moment. */
const formatTimestamp = (dateStr: string | null) => {
  if (!dateStr) return "Not set";
  return new Date(dateStr).toLocaleDateString("en-US", DATE_FORMAT);
};

/** For DATE columns (`expiration_date`) — a bare YYYY-MM-DD, which `new Date`
 *  reads as UTC midnight and so renders one day EARLY west of Greenwich.
 *  Must match what the grid shows for the same item (FoodInventoryScreen's
 *  `formatExpirationDate` goes through the same helper). */
const formatCalendarDate = (dateStr: string | null) => {
  if (!dateStr) return "Not set";
  return parseLocalDate(dateStr).toLocaleDateString("en-US", DATE_FORMAT);
};

export function ViewFoodDetailsScreen({ item, onClose, onRefresh, isPreview = false, onAddToInventory }: ViewFoodDetailsScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  // What the item means to the rest of the loop: the meals it feeds, how fast
  // it goes, whether it's already on the list. All decoration — a failed fetch
  // leaves the page rendering everything else.
  const [ctx, setCtx] = useState<ItemDetailContext | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const addingToList = useRef(false);

  // Card flip. Two faces stacked in the same box, each hiding its own back,
  // rotated half a turn apart: at any moment exactly one is facing you. The
  // driver is native (transform only), so the turn does not compete with the
  // JS thread while the front face's scroll view settles.
  //
  // `showingBack` is a separate boolean flipped at the halfway point rather
  // than derived per frame: it decides which face may receive touches, and
  // backface-hidden alone does not stop an invisible face from swallowing
  // taps on Android.
  const flip = useRef(new Animated.Value(0)).current;
  const [showingBack, setShowingBack] = useState(false);
  const nutrition = buildNutritionLabel(item);

  const toggleFlip = () => {
    const next = !showingBack;
    setShowingBack(next);
    Animated.timing(flip, {
      toValue: next ? 1 : 0,
      duration: 480,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  const frontSpin = flip.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "180deg"] });
  const backSpin = flip.interpolate({ inputRange: [0, 1], outputRange: ["180deg", "360deg"] });

  // D5: learned restock threshold, derived from the same estimate the pace
  // line uses rather than a second round trip.
  const suggestedThreshold = ctx?.rate ? suggestedRestockThreshold(ctx.rate) : null;

  // Collect all available images
  const images = [
    item.image_primary_url,
    item.image_front_url,
    item.image_back_url,
    item.image_side_url,
  ].filter((url): url is string => url !== null && url !== undefined);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / WELL_WIDTH);
    setActiveImageIndex(index);
  };

  useEffect(() => {
    // A previewed barcode result is not in inventory yet, so it has no rate,
    // no meals and no list entry — there is nothing to ask about.
    if (isPreview) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await fetchItemDetailContext(
          item.id,
          item.state.totalQuantity,
          getLocalDateString(),
          item.is_scheduled_supply,
        );
        if (!cancelled) setCtx(next);
      } catch (e) {
        console.error("item detail context fetch failed:", e);
      }
    })();
    return () => { cancelled = true; };
  }, [item.id, item.state.totalQuantity, isPreview]);

  const applySuggestedThreshold = async () => {
    if (suggestedThreshold === null) return;
    try {
      const { error } = await supabase
        .from("food_inventory")
        .update({ restock_threshold: suggestedThreshold })
        .eq("id", item.id);
      if (error) throw error;
      await onRefresh?.();
    } catch (e) {
      console.error("apply threshold failed:", e);
      Alert.alert("Error", "Couldn't apply the suggested threshold.");
    }
  };

  const handleRefresh = async () => {
    if (onRefresh) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  };

  // B1: consume one unit, then hand control to the parent's refresh so the
  // quantities on screen are re-read, never hand-patched.
  const handleUsedOne = async () => {
    try {
      const { consumed } = await consumeOneUnit(item.id);
      if (consumed === 0) {
        Alert.alert("Nothing to use", `${item.name} is already out of stock.`);
        return;
      }
      await onRefresh?.();
    } catch (e) {
      console.error("consume failed:", e);
      Alert.alert("Error", `Couldn't mark ${item.name} as used.`);
    }
  };

  // The stepper's other half. Recorded as a restock, not an undo: it moves
  // stock the same way but means the opposite thing to demand.
  const handleAddOne = async () => {
    try {
      const added = await restockOneUnit(item.id, item.locations);
      if (added === 0) {
        Alert.alert("Couldn't add", `${item.name} has no storage location to add to.`);
        return;
      }
      await onRefresh?.();
    } catch (e) {
      console.error("restock failed:", e);
      Alert.alert("Error", `Couldn't add one ${item.name}.`);
    }
  };

  // Same guards as the list screen's add: an in-flight flag, then a check for
  // an existing unpurchased row, because shopping_list has no unique
  // constraint and nothing else consults it before inserting.
  const handleAddToList = async () => {
    if (addingToList.current) return;
    addingToList.current = true;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
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
      // Routed through the shopping module so this shares the one quantity
      // formula and vendor stamping with every other add path.
      await addSuggestions(user.id, [{
        name: item.name,
        foodInventoryId: item.id,
        vendorId: item.preferred_vendor_id ?? null,
        quantity: Math.max(1, lowThresholdFor(item) - item.state.totalQuantity + 1),
        unit: item.unit,
        priority: item.state.isOut ? 1 : 2,
        reasons: ["added from item page"],
      }]);
      await onRefresh?.();
      Alert.alert("Added", `${item.name} is on your shopping list.`);
    } catch (e) {
      console.error("add to list failed:", e);
      Alert.alert("Error", "Couldn't add to the shopping list.");
    } finally {
      addingToList.current = false;
    }
  };

  // B2: discard remaining stock with an optional reason (event trail feeds
  // waste analytics). Distinct from delete — the row and history survive.
  const handleToss = () => {
    const toss = async (reason?: string) => {
      try {
        const discarded = await discardItem(item.id, reason);
        if (discarded === 0) {
          Alert.alert("Nothing to toss", `${item.name} is already out of stock.`);
          return;
        }
        await onRefresh?.();
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

  // A4: relative expiry phrasing driven by the shared policy. Stale items get
  // the QUIET treatment (neutral) — they belong to the Archive, not to alarm.
  const relativeDays = (d: number): string => {
    const abs = Math.abs(d);
    if (abs >= 60) return `${Math.round(abs / 30)} months`;
    if (abs >= 14) return `${Math.round(abs / 7)} weeks`;
    return `${abs} day${abs === 1 ? "" : "s"}`;
  };
  const expiryStatus = (() => {
    const { expiration, daysLeft } = item.state;
    if (expiration === null || daysLeft === null) return null;
    const review = reviewExpiry(item.state, item.categories.map((c) => c.name));
    if (review === "stale") {
      return { label: "Long expired", tone: "neutral" as const, detail: `${relativeDays(daysLeft)} ago` };
    }
    if (expiration === "expired") {
      return { label: "Expired", tone: "danger" as const, detail: `${relativeDays(daysLeft)} ago` };
    }
    if (expiration === "today") {
      return { label: "Expires today", tone: "warning" as const, detail: "use or move it" };
    }
    if (expiration === "soon") {
      return { label: "Expiring", tone: "warning" as const, detail: `in ${relativeDays(daysLeft)}` };
    }
    return null;
  })();

  // E4: category-typical shelf life, shown ONLY as a hint beside a missing
  // date — never written to the row (a fabricated date would flow into the
  // bands and the aging policy as if a human had read it off the package).
  const shelfLifeEstimate = item.expiration_date
    ? null
    : estimateShelfLifeDays(item.categories.map((c) => c.name));

  // "Fresh · 5 weeks left" as one chip. `expiryStatus` covers the states that
  // demand action; this adds the calm one, which the page never used to say
  // out loud — it printed a calendar date and left you to do the subtraction.
  const freshness = (() => {
    if (expiryStatus) return expiryStatus;
    const { expiration, daysLeft } = item.state;
    if (expiration === "later" && daysLeft !== null) {
      return { label: "Fresh", tone: "success" as const, detail: `${relativeDays(daysLeft)} left` };
    }
    return null;
  })();

  // How long the stock lasts at the observed rate. Null until the estimator
  // has seen this item move — an invented rate would be worse than silence.
  const paceLine = (() => {
    if (!ctx) return null;
    const days = ctx.rate?.daysUntilOut;
    if (days === undefined || days === null || !Number.isFinite(days)) return null;
    if (days >= MAX_DISPLAY_DAYS) return `more than ${MAX_DISPLAY_DAYS} days at this rate`;
    return `about ${relativeDays(Math.round(days))} left at your pace`;
  })();

  // Per-serving figures scale to stock only when a unit IS a serving. For
  // weights and volumes that arithmetic is meaningless, so the row is omitted
  // rather than guessed at.
  const unitIsServing = ["count", "servings"].includes(normalizeUnit(item.unit));
  const stockCalories =
    unitIsServing && item.calories ? item.calories * item.state.totalQuantity : null;
  const stockProtein =
    unitIsServing && item.protein ? item.protein * item.state.totalQuantity : null;
  const targetShare =
    ctx?.targetCalories && item.calories
      ? Math.round((item.calories / ctx.targetCalories) * 100)
      : null;

  // The same control in the same place on both faces, so flipping back never
  // means hunting for it. Dark disc because it sits on white in both
  // positions — the image well and the panel.
  const flipButton = nutrition.isEmpty ? null : (
    <TouchableOpacity
      onPress={toggleFlip}
      style={styles.flipBtn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={showingBack ? "Back to product details" : "Show nutrition facts"}
    >
      <FlipHorizontal size={icons.sm} color={colors.text} strokeWidth={icons.strokeWidth} />
    </TouchableOpacity>
  );

  const moreActions = (): ItemAction[] => [
    { label: "Toss item…", icon: Trash2, destructive: true, onPress: handleToss },
  ];

  const renderSection = (title: string, content: React.ReactNode) => (
    <Card variant="panel" style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {content}
    </Card>
  );

  const renderDetailRow = (label: string, value: string | number | null | undefined) => (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || "Not set"}</Text>
    </View>
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          {/* Preview items aren't editable; and with no handler there is no
              action to offer, so the slot stays empty rather than inert. */}
          {!isPreview ? (
            <Button
              label="Edit"
              onPress={() => router.push(`/(tabs)/track/food-inventory/edit/${item.id}`)}
              variant="ghost"
              size="sm"
              icon={Pencil}
            />
          ) : onAddToInventory ? (
            <Button
              label="Add"
              onPress={onAddToInventory}
              variant="ghost"
              size="sm"
              icon={Plus}
            />
          ) : null}
        </View>

        {/* Two faces in one box, half a turn apart. The header sits outside
            it deliberately: Back and Edit belong to the screen, not to the
            card, and a nav bar that spun would be disorienting. */}
        <View style={styles.flipArea}>
        <Animated.View
          style={[styles.face, { transform: [{ perspective: 1200 }, { rotateY: frontSpin }] }]}
          pointerEvents={showingBack ? "none" : "auto"}
        >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.brand}
              colors={[colors.brand]}
            />
          }
        >
          {/* Product Image Carousel */}
          <View style={styles.imageSection}>
            {images.length > 0 ? (
              <>
                <ScrollView
                  ref={scrollViewRef}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={handleScroll}
                  scrollEventThrottle={16}
                  style={styles.imageCarousel}
                >
                  {images.map((imageUrl, index) => (
                    // The well is deliberately small — a white band must not
                    // flood a dark theme — but too small to read a packet.
                    // Tapping opens the photo full size. activeOpacity 1: the
                    // carousel still pages, and a flash on every swipe would
                    // read as a mis-tap.
                    <TouchableOpacity
                      key={index}
                      style={styles.imageContainer}
                      activeOpacity={1}
                      onPress={() => { setLightboxIndex(index); setLightboxOpen(true); }}
                      accessibilityRole="button"
                      accessibilityLabel={`View photo ${index + 1} full screen`}
                    >
                      <Image
                        source={{ uri: imageUrl }}
                        style={styles.productImage}
                        resizeMode="contain"
                      />
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                {/* Pagination Dots */}
                {images.length > 1 && (
                  <View style={styles.paginationContainer}>
                    {images.map((_, index) => (
                      <View
                        key={index}
                        style={[
                          styles.paginationDot,
                          index === activeImageIndex && styles.paginationDotActive,
                        ]}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : (
              <View style={styles.imagePlaceholder}>
                <Package size={80} color={colors.textFaint} />
              </View>
            )}
            {/* Top-right of the hero, because that is the corner you reach for
                to turn a packet over. */}
            {flipButton && <View style={styles.flipCorner}>{flipButton}</View>}
          </View>

          {/* Product Name & Brand */}
          <View style={styles.titleSection}>
            <Text style={styles.productName}>{item.name}</Text>
            {item.brand && <Text style={styles.productBrand}>{item.brand}</Text>}
            {item.flavor && <Text style={styles.productFlavor}>{item.flavor}</Text>}
            {/* A4: the same urgency the grid shows, with relative phrasing —
                the grid screamed "Expired" while this page whispered a bare
                calendar date. One truth, one weight, both surfaces. */}
            {/* Status, taxonomy and shelf as one chip row directly under the
                brand: the first glance should answer "is this still good?"
                without scrolling to a Dates card at the very bottom. */}
            <View style={styles.chipRow}>
              {freshness && (
                <View style={[styles.chip, styles[`chip_${freshness.tone}`]]}>
                  <Text style={[styles.chipText, styles[`chipText_${freshness.tone}`]]}>
                    {freshness.label} · {freshness.detail}
                  </Text>
                </View>
              )}
              {item.categories.map((cat) => (
                <View key={cat.id} style={[styles.chip, styles.chip_inventory]}>
                  <Text style={[styles.chipText, styles.chipText_inventory]}>{cat.name}</Text>
                </View>
              ))}
              {item.subcategories.map((sub) => (
                <View key={sub.id} style={styles.chip}>
                  <Text style={styles.chipText}>{sub.name}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* B1/B2 verbs — the daily-use actions, first-class on the detail
              page (and the VoiceOver-reachable path to what the grid tile's
              pointer-only "−" shortcut does). Hidden in preview mode and when
              there is no stock to act on. Side-by-side pair per style rule 26:
              Button cannot flex, so each sits in a flex:1 wrapper. */}
          {/* The one line worth arriving for: how much there is, and how long
              that lasts at the rate you actually consume it. */}
          {!isPreview && (
            <View style={styles.strip}>
              <Text style={styles.stripCount}>
                {formatQuantity(item.state.totalQuantity, item.unit)}
              </Text>
              <Text style={styles.stripLede}>
                {/* "Use it a few times" is advice that would never pay off on
                    a delivered meal: nothing is estimating its pace, and the
                    dish is unlikely to come back before the menu rotates. */}
                {paceLine
                  ?? (item.is_scheduled_supply
                    ? "delivered, so no pace to learn"
                    : "no pace learned yet — use it a few times")}
              </Text>
            </View>
          )}

          {/* B1 + the stepper's other half. A single "used one" button meant
              eating three, or unpacking six, sent you into the edit form.
              Toss moves to the overflow: it is the one destructive action here
              and it used to take half the row. */}
          {!isPreview && (
            <View style={styles.actionRow}>
              <View style={styles.stepper}>
                <TouchableOpacity
                  onPress={handleUsedOne}
                  disabled={item.state.totalQuantity === 0}
                  style={[styles.stepBtn, item.state.totalQuantity === 0 && styles.stepBtnOff]}
                  accessibilityRole="button"
                  accessibilityLabel={`Used one ${item.name}`}
                >
                  <Minus size={icons.sm} color={colors.text} strokeWidth={icons.strokeWidth} />
                </TouchableOpacity>
                <Text style={styles.stepCount}>{item.state.totalQuantity}</Text>
                <TouchableOpacity
                  onPress={handleAddOne}
                  style={[styles.stepBtn, styles.stepBtnOn]}
                  accessibilityRole="button"
                  accessibilityLabel={`Add one ${item.name}`}
                >
                  <Plus size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />
                </TouchableOpacity>
              </View>
              {/* The slot is kept either way so the stepper and the overflow
                  button stay where they are between items. You cannot add a
                  delivered meal to a shopping list in any useful sense — the
                  next one is already coming — so the button is replaced by
                  what is actually true about it rather than left there to be
                  tapped for nothing. */}
              <View style={styles.actionFill}>
                {item.is_scheduled_supply ? (
                  <Text style={styles.scheduledNote} numberOfLines={2}>
                    Arrives on a schedule
                  </Text>
                ) : (
                  <Button
                    label={ctx?.onShoppingList ? "On your list" : "Add to list"}
                    onPress={handleAddToList}
                    variant="secondary"
                    size="sm"
                    icon={ShoppingCart}
                    disabled={ctx?.onShoppingList === true}
                    fluid
                  />
                )}
              </View>
              <TouchableOpacity
                onPress={() => setShowMore(true)}
                style={styles.moreBtn}
                accessibilityRole="button"
                accessibilityLabel="More actions"
              >
                <MoreHorizontal size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              </TouchableOpacity>
            </View>
          )}

          {/* The item's place in the loop. Every input already existed — the
              concept graph, the assemblability check, the rate estimator — but
              nothing had ever asked them about a single item, so this page had
              no idea it was describing food you could cook with. */}
          {/* Always rendered once the context loads, never hidden when empty:
              "no meal can claim this" is the single most actionable thing the
              page can say, and it is exactly the case an emptiness check would
              have suppressed. */}
          {!isPreview && ctx &&
            renderSection(
              "In the loop",
              <>
                {ctx.meals.map((m) => (
                  <View key={m.name} style={styles.mealRow}>
                    <Text style={styles.mealName} numberOfLines={1}>{m.name}</Text>
                    {/* Three verdicts, not two. "Missing N" is reserved for
                        ingredients actually looked for and not found; a meal
                        we simply cannot check says so in neutral rather than
                        claiming a shortfall. */}
                    <Badge
                      label={
                        m.ready ? "Ready"
                        : m.missing.length > 0 ? `Missing ${m.missing.length}`
                        : `${m.unlinked.length} not linked`
                      }
                      tone={
                        m.ready ? "success"
                        : m.missing.length > 0 ? "warning"
                        : "neutral"
                      }
                    />
                  </View>
                ))}
                {ctx.meals.length === 0 && (
                  <Text style={styles.emptyNote}>
                    Not linked to any meals yet, so nothing in your library can claim it.
                  </Text>
                )}
                {ctx.runsOutOn && renderDetailRow("Runs out around", formatCalendarDate(ctx.runsOutOn))}
                {item.is_scheduled_supply
                  ? renderDetailRow("Restocking", "Arrives on a schedule")
                  : renderDetailRow("On shopping list", ctx.onShoppingList ? "Yes" : "Not yet")}
              </>,
            )}

          {/* One row per shelf with its own count, instead of a single
              "Location: Freezer" that cannot describe split stock. */}
          {item.locations.length > 0 && renderSection(
            "Where it is",
            <>
              {[...item.locations]
                .sort((a, b) => a.id.localeCompare(b.id))
                .map((loc) => (
                  <View key={loc.id} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>
                      {loc.location.charAt(0).toUpperCase() + loc.location.slice(1)}
                    </Text>
                    <View style={styles.locValue}>
                      <Text style={styles.detailValue}>{loc.quantity}</Text>
                      <Text style={styles.locNote}>
                        {loc.is_ready_to_consume ? "ready to eat" : "in storage"}
                      </Text>
                    </View>
                  </View>
                ))}
            </>
          )}

          {/* Relative first, calendar date as the small print. */}
          {renderSection(
            "Freshness",
            <>
              {item.expiration_date ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {item.state.expiration === "expired" ? "Expired" : "Good for"}
                  </Text>
                  <View style={styles.locValue}>
                    <Text style={styles.detailValue}>
                      {freshness?.detail ?? formatCalendarDate(item.expiration_date)}
                    </Text>
                    <Text style={styles.locNote}>{formatCalendarDate(item.expiration_date)}</Text>
                  </View>
                </View>
              ) : (
                renderDetailRow(
                  "Expiration date",
                  shelfLifeEstimate !== null
                    ? `Not set — typically lasts ~${shelfLifeEstimate}d`
                    : "Not set",
                )
              )}
              {item.requires_refrigeration ? renderDetailRow("Keep refrigerated", "Yes") : null}
              {renderDetailRow("You last checked", formatTimestamp(item.last_verified_at))}
            </>
          )}

          {/* Per serving, per shelf, and against the day you already track. */}
          {(item.calories || item.protein || item.carbs || item.fats || item.sugars
            || item.fiber_g) && renderSection(
            "Nutrition",
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{item.serving_size || "One serving"}</Text>
                <View style={styles.locValue}>
                  <Text style={styles.detailValue}>
                    {item.calories ? `${item.calories} kcal` : "—"}
                  </Text>
                  <Text style={styles.locNote}>
                    {[
                      item.protein ? `${item.protein}P` : null,
                      item.carbs ? `${item.carbs}C` : null,
                      item.fats ? `${item.fats}F` : null,
                    ].filter(Boolean).join(" · ")}
                  </Text>
                </View>
              </View>
              {stockCalories !== null && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    All {item.state.totalQuantity} on hand
                  </Text>
                  <View style={styles.locValue}>
                    <Text style={styles.detailValue}>
                      {stockCalories.toLocaleString()} kcal
                    </Text>
                    {stockProtein !== null && (
                      <Text style={styles.locNote}>{Math.round(stockProtein)}g protein</Text>
                    )}
                  </View>
                </View>
              )}
              {targetShare !== null && renderDetailRow("Share of today's target", `${targetShare}%`)}
              {item.fiber_g ? renderDetailRow("Fiber", `${item.fiber_g}g`) : null}
              {item.sugars ? renderDetailRow("Sugars", `${item.sugars}g`) : null}
            </>
          )}

          {/* Set once, read rarely — folded away rather than given three cards
              above the fold. */}
          <Card variant="panel" style={styles.section}>
            <TouchableOpacity
              style={styles.discloseRow}
              onPress={() => setShowDetails((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showDetails }}
              accessibilityLabel="Details and settings"
            >
              <Text style={styles.sectionTitle}>Details &amp; settings</Text>
              {showDetails
                ? <ChevronDown size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
                : <ChevronRight size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />}
            </TouchableOpacity>
            {showDetails && (
              <>
                {item.storage_type === "single-location"
                  ? renderDetailRow("Restock threshold", `${item.restock_threshold} ${item.unit}`)
                  : (
                    <>
                      {renderDetailRow("Fridge restock threshold", item.fridge_restock_threshold ? `${item.fridge_restock_threshold} ${item.unit}` : "Not set")}
                      {renderDetailRow("Total restock threshold", item.total_restock_threshold ? `${item.total_restock_threshold} ${item.unit}` : "Not set")}
                    </>
                  )}
                {/* D5: advisory only, and only once real usage disagrees with
                    the hand-set number. Apply is one tap, never silent. */}
                {suggestedThreshold !== null && suggestedThreshold !== item.restock_threshold && (
                  <View style={styles.suggestionRow}>
                    <Text style={styles.suggestionText}>
                      Your usage suggests {suggestedThreshold}
                    </Text>
                    <Button label="Apply" variant="ghost" size="sm" onPress={applySuggestedThreshold} />
                  </View>
                )}
                {item.barcode ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Barcode</Text>
                    <View style={styles.barcodeValue}>
                      <ScanBarcode size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                      <Text style={styles.barcodeText}>{item.barcode}</Text>
                    </View>
                  </View>
                ) : null}
                {renderDetailRow("Added", formatTimestamp(item.created_at))}
                {renderDetailRow("Last updated", formatTimestamp(item.updated_at))}
                {item.notes && (
                  <View style={styles.notesContainer}>
                    <Text style={styles.detailLabel}>Notes</Text>
                    <Text style={styles.notesText}>{item.notes}</Text>
                  </View>
                )}
              </>
            )}
          </Card>

          <View style={{ height: 40 }} />
        </ScrollView>
        </Animated.View>

        <Animated.View
          style={[styles.face, styles.backFace, { transform: [{ perspective: 1200 }, { rotateY: backSpin }] }]}
          pointerEvents={showingBack ? "auto" : "none"}
        >
          <NutritionFactsCard item={item} corner={flipButton} />
        </Animated.View>
        </View>

        <ImageLightbox
          visible={lightboxOpen}
          images={images}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxOpen(false)}
        />

        <ItemActionsSheet
          visible={showMore}
          title={item.name}
          actions={moreActions()}
          onClose={() => setShowMore(false)}
        />
      </View>
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
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    // Opaque and above the flip's compositing context — see `flipArea`.
    backgroundColor: colors.bg,
    zIndex: 1,
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
  content: {
    flex: 1,
  },
  // The one sanctioned white surface: product photos are shot on white.
  imageSection: {
    backgroundColor: colors.imageWell,
    marginHorizontal: spacing.screenGutter,
    marginTop: spacing.md,
    borderRadius: radii.panel,
    overflow: "hidden",
    paddingBottom: spacing.md,
  },
  imageCarousel: {
    width: WELL_WIDTH,
    height: 220,
  },
  imageContainer: {
    width: WELL_WIDTH,
    height: 220,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.lg,
  },
  productImage: {
    width: 200,
    height: 200,
    borderRadius: radii.control,
  },
  imagePlaceholder: {
    width: 200,
    height: 200,
    borderRadius: radii.control,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: spacing.xxl,
    alignSelf: "center",
  },
  paginationContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.textMuted,
  },
  paginationDotActive: {
    backgroundColor: colors.brand,
    width: 8,
    height: 8,
  },
  // The rotated faces establish a 3D compositing context, and on iOS that
  // context bled onto the sibling header above it — Edit vanished and the
  // header's rule stopped halfway across. Clipping the context to its own box
  // and lifting the header above it in the stack confines the effect.
  flipArea: { flex: 1, overflow: "hidden", zIndex: 0 },
  face: { ...StyleSheet.absoluteFillObject, backfaceVisibility: "hidden" },
  backFace: { padding: spacing.screenGutter },
  flipCorner: { position: "absolute", top: spacing.md, right: spacing.md },
  flipBtn: {
    width: 34, height: 34, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.md },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  chipText: { ...typography.caption, fontWeight: "600", color: colors.textMuted },
  chip_success: { backgroundColor: tint(colors.success), borderColor: tint(colors.success, 0.3) },
  chip_warning: { backgroundColor: tint(colors.warning), borderColor: tint(colors.warning, 0.3) },
  chip_danger: { backgroundColor: tint(colors.danger), borderColor: tint(colors.danger, 0.3) },
  chip_neutral: {},
  chip_inventory: {
    backgroundColor: tint(colors.accents.inventory),
    borderColor: tint(colors.accents.inventory, 0.3),
  },
  chipText_success: { color: colors.success },
  chipText_warning: { color: colors.warning },
  chipText_danger: { color: colors.danger },
  chipText_neutral: {},
  chipText_inventory: { color: colors.accents.inventory },

  // The decision line. surface2 so it reads as the one raised thing between
  // the title and the cards.
  strip: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.row,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stripCount: { fontSize: 22, fontWeight: "700", color: colors.text },
  stripLede: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },

  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  actionFill: { flex: 1 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepBtn: {
    width: 32, height: 32, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  stepBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  stepBtnOff: { opacity: 0.4 },
  stepCount: {
    ...typography.rowTitle, color: colors.text, minWidth: spacing.xxl, textAlign: "center",
  },
  moreBtn: {
    width: 36, height: 36, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
  },

  mealRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: spacing.md, paddingVertical: spacing.sm,
  },
  mealName: { ...typography.body, color: colors.text, flex: 1, minWidth: 0 },
  emptyNote: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.sm },
  // Occupies the slot a small button would, so the row keeps its height and
  // the overflow control does not shift left on delivered items.
  scheduledNote: {
    ...typography.caption, color: colors.textMuted, textAlign: "center",
  },
  locValue: { alignItems: "flex-end" },
  locNote: { ...typography.caption, color: colors.textFaint },
  discloseRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  suggestionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  suggestionText: { ...typography.caption, color: colors.textMuted, flexShrink: 1 },
  expiryStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  expiryStatusText: { ...typography.caption, color: colors.textMuted },
  barcodeValue: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barcodeText: {
    ...typography.body,
    color: colors.text,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  titleSection: {
    padding: spacing.xl,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  productName: {
    fontSize: 24,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  productBrand: {
    fontSize: 18,
    color: colors.textMuted,
    marginBottom: 2,
  },
  productFlavor: {
    fontSize: 16,
    color: colors.textFaint,
  },
  // Fill/radius/border/padding come from `Card variant="panel"`.
  section: {
    marginHorizontal: spacing.screenGutter,
    marginTop: spacing.md,
  },
  sectionTitle: {
    ...typography.section,
    marginBottom: spacing.md,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textMuted,
    flex: 1,
  },
  detailValue: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    textAlign: "right",
  },
  locationItem: {
    padding: spacing.md,
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    marginBottom: spacing.sm,
  },
  locationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  locationName: {
    ...typography.rowTitle,
    color: colors.text,
  },
  // Location identity — one of the two places the inventory violet survives.
  locationQuantity: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.accents.inventory,
  },
  locationStatus: {
    ...typography.caption,
    marginBottom: spacing.xs,
  },
  locationNotes: {
    ...typography.caption,
    color: colors.textFaint,
    fontStyle: "italic",
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    flex: 1,
    justifyContent: "flex-end",
  },
  notesContainer: {
    paddingVertical: spacing.sm,
  },
  notesText: {
    ...typography.body,
    color: colors.text,
    marginTop: spacing.sm,
    lineHeight: 20,
  },
});
