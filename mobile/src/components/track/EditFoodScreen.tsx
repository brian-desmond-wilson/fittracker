import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Modal,
  Image,
  LayoutAnimation,
  StatusBar,
  type LayoutChangeEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Camera, Barcode, Trash2, Plus, ChevronDown, Circle, CheckCircle } from "lucide-react-native";
import { colors, icons, spacing } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { uploadImage } from "@/src/lib/imageUpload";
import { FoodLocation, StorageType, FoodCategory, FoodSubcategory } from "@/src/types/track";
import {
  replaceItemLocations,
  type InventoryItemWithState,
} from "@/src/lib/supabase/inventory";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString, parseLocalDate } from "@/src/lib/dates";
import { daysBetweenLocalDates } from "@/src/lib/stockState";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { getProductByBarcode } from "@/src/services/openFoodFactsApi";
import { styles } from "./edit-food/styles";
import { SectionHeader } from "./edit-food/SectionHeader";
import { SuggestField } from "./edit/SuggestField";
import { NumberStepper } from "./edit/NumberStepper";
import { CategoryPickerSheet } from "./edit/CategoryPickerSheet";
import { VendorTiles } from "./edit/VendorTiles";
import { fetchInventoryVocab, type InventoryVocab } from "@/src/lib/supabase/inventoryVocab";
import { invalidateBorrowedFoodImages } from "@/src/lib/supabase/borrowedFoodImages";
import {
  basicSummary, storageSummary, nutritionSummary, expirySummary,
  photosSummary, notesSummary, changeCount, changeLabel, relativeDays,
} from "@/src/lib/editSummaries";
import { estimateShelfLifeDays } from "@/src/lib/expiryPolicy";
import { sanitizeInteger, sanitizeDecimal } from "@/src/lib/numericInput";
import { SectionKey, UNITS, LocationEntry } from "./edit-food/constants";
import { useFoodImages } from "./edit-food/useFoodImages";

/** `food_inventory_locations.quantity` is int4; anything above this overflows. */
const INT4_MAX = 2_147_483_647;

/**
 * Parse a quantity text field into the number that will actually be written,
 * or null if it isn't writable. One function so validation and the write can
 * never disagree — they used to: validation ran `parseFloat` and the write ran
 * `parseInt`, so ".5" passed validation (0.5 >= 0) and reached the insert as
 * NaN, and "1.5" was silently truncated to 1. Both are typeable on the numeric
 * keypad, which includes ".".
 *
 * `Number` rather than `parseInt`, deliberately: `parseInt("1.5")` returns 1
 * (accepting a value the user did not type), while `Number("1.5")` is 1.5 and
 * fails the integer test. It also rejects trailing garbage ("12abc" -> NaN)
 * that `parseInt` would happily truncate. The explicit empty/whitespace check
 * comes first because `Number("")` and `Number(" ")` are both 0, not NaN.
 */
function parseQuantityInput(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > INT4_MAX) return null;
  return value;
}

/** The macro columns are `DECIMAL(10, 2) CHECK (>= 0)` (20250206_tracking_tables.sql:55-58,
 *  re-declared 20250209_extend_food_inventory.sql:12-15), so 99999999.99 is the ceiling. */
const DECIMAL_10_2_MAX = 99_999_999.99;

/**
 * Continuous sibling of `parseQuantityInput`, for the gram macros. Same
 * contract — one function shared by validation and the write, so they cannot
 * disagree — but it ACCEPTS decimals, because grams genuinely are continuous
 * where the quantity/threshold columns are `INTEGER`. Reusing the integer
 * parser here would reject "1.5 g of fat", which is a legitimate value.
 *
 * Replaces a bare `parseFloat`, which failed the same silent way the integer
 * fields did: `parseFloat("abc")` is NaN, which serialises to null and CLEARS
 * a stored macro while the user is told "Item updated successfully". It also
 * truncated on trailing garbage — `parseFloat("1,5")` is 1, so a comma decimal
 * separator silently stored 1 g instead of 1.5 g. `Number` rejects both.
 * Values beyond two decimal places are still rounded by the column itself.
 */
function parseDecimalInput(raw: string): number | null {
  if (raw.trim() === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > DECIMAL_10_2_MAX) return null;
  return value;
}

interface EditFoodScreenProps {
  item: InventoryItemWithState;
  onClose: () => void;
  onSave: (newItemId?: string) => void;  // Changed to accept optional newItemId
  isNew?: boolean;  // NEW prop to indicate if this is a new item
}

export function EditFoodScreen({ item, onClose, onSave, isNew = false }: EditFoodScreenProps) {
  const insets = useSafeAreaInsets();

  // Categories & Subcategories Data
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [subcategories, setSubcategories] = useState<FoodSubcategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    item.categories.map(cat => cat.id)
  );
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>(
    item.subcategories.map(sub => sub.id)
  );
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    new Set(item.categories.map(cat => cat.id))
  );

  // Basic Info
  const [name, setName] = useState(item.name);
  const [brand, setBrand] = useState(item.brand || "");
  const [flavor, setFlavor] = useState(item.flavor || "");
  const [barcode, setBarcode] = useState(item.barcode || "");

  // Quantity & Storage
  const [storageType, setStorageType] = useState<StorageType>(item.storage_type);
  // Seeded from the projection (Σ location rows), NOT from item.quantity —
  // that column is a cache, and on the path where the two diverge, seeding
  // from it would show the stale number and then write it back into the
  // location rows on save, laundering drift into the one source of truth.
  const [quantity, setQuantity] = useState(item.state.totalQuantity.toString());
  const [unit, setUnit] = useState(item.unit);
  const [location, setLocation] = useState<FoodLocation | null>(item.location ?? null);
  const [restockThreshold, setRestockThreshold] = useState(item.restock_threshold.toString());
  const [requiresRefrigeration, setRequiresRefrigeration] = useState(item.requires_refrigeration);
  const [fridgeRestockThreshold, setFridgeRestockThreshold] = useState(
    item.fridge_restock_threshold?.toString() || ""
  );
  const [totalRestockThreshold, setTotalRestockThreshold] = useState(
    item.total_restock_threshold?.toString() || ""
  );

  // Multi-location entries
  const [locationEntries, setLocationEntries] = useState<LocationEntry[]>([]);

  // Nutritional Info
  const [calories, setCalories] = useState(item.calories?.toString() || "");
  const [protein, setProtein] = useState(item.protein?.toString() || "");
  const [carbs, setCarbs] = useState(item.carbs?.toString() || "");
  const [fats, setFats] = useState(item.fats?.toString() || "");
  const [sugars, setSugars] = useState(item.sugars?.toString() || "");
  // `?? null` for the same reason preferred_vendor_id needs it below: rows
  // fetched before the column landed come back undefined through the untyped
  // client, and `undefined?.toString()` would be fine but `item.fiber_g` being
  // absent must still seed "".
  const [fiber, setFiber] = useState(item.fiber_g?.toString() || "");
  const [servingSize, setServingSize] = useState(item.serving_size || "");

  // Resupplied on a cadence rather than bought when low — a delivered meal,
  // not a grocery. Everything the app would otherwise say about restocking it
  // is noise, so this flag silences those signals rather than describing food.
  const [isScheduledSupply, setIsScheduledSupply] = useState(
    item.is_scheduled_supply ?? false,
  );

  // Expiration. `parseLocalDate`, not `new Date(str)`: the bare constructor
  // reads a YYYY-MM-DD DATE column as UTC midnight, so the picker's label
  // rendered a day early west of Greenwich — and disagreed with the grid and
  // the detail screen, which both go through `parseLocalDate`. The noon anchor
  // also keeps the write below (`getLocalDateString`) on the intended day.
  const [expirationDate, setExpirationDate] = useState<Date | null>(
    item.expiration_date ? parseLocalDate(item.expiration_date) : null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Notes
  const [notes, setNotes] = useState(item.notes || "");

  // Preferred vendor. `?? null`, not a bare read: `item.preferred_vendor_id`
  // comes back `undefined` (not `null`) on rows fetched before the
  // column-adding migration lands — the untyped client casts through
  // `as FoodInventoryItem[]` regardless of what the row actually has — and
  // the add path's synthetic literal (add.tsx/preview.tsx) already sets it
  // to `null`, so this seeds correctly on both the add and edit paths.
  const [preferredVendorId, setPreferredVendorId] = useState<string | null>(
    item.preferred_vendor_id ?? null,
  );
  const [vendors, setVendors] = useState<NutritionVendor[]>([]);

  // Images (state + camera/library picker live in a hook)
  const {
    imagePrimary,
    imageFront,
    imageBack,
    imageSide,
    setImagePrimary,
    setImageFront,
    setImageBack,
    setImageSide,
    pickImage,
  } = useFoodImages(item);

  // UI State
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProductData, setLoadingProductData] = useState(false);

  // Accordion state
  const [expandedSection, setExpandedSection] = useState<SectionKey>("basic");
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Fetch categories and subcategories
    fetchCategoriesAndSubcategories();

    // For multi-location items, fetch location entries
    if (item.storage_type === 'multi-location') {
      fetchLocationEntries(item.id);
    }
  }, [item.id]);

  useEffect(() => {
    fetchVendors();
  }, []);

  // The brands and varieties already in the inventory, so the pickers can
  // offer an existing spelling instead of inviting a fourth way to write
  // "Kirkland". Decoration: a failure leaves both fields as plain text entry.
  const [vocab, setVocab] = useState<InventoryVocab | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchInventoryVocab()
      .then((v) => { if (!cancelled) setVocab(v); })
      .catch((e) => console.error("vocab fetch failed:", e));
    return () => { cancelled = true; };
  }, []);

  // What the form looked like when it opened, so Save can tell whether there
  // is anything to write. Captured once with a ref-like initial state rather
  // than diffed against `item` field by field, which would drift every time a
  // field is added.
  const [baseline] = useState(() => ({
    name: item.name,
    brand: item.brand || "",
    flavor: item.flavor || "",
    barcode: item.barcode || "",
    storageType: item.storage_type as string,
    quantity: item.state.totalQuantity.toString(),
    unit: item.unit,
    location: (item.location ?? null) as string | null,
    restockThreshold: item.restock_threshold.toString(),
    requiresRefrigeration: item.requires_refrigeration,
    calories: item.calories?.toString() || "",
    protein: item.protein?.toString() || "",
    carbs: item.carbs?.toString() || "",
    fats: item.fats?.toString() || "",
    sugars: item.sugars?.toString() || "",
    fiber: item.fiber_g?.toString() || "",
    isScheduledSupply: item.is_scheduled_supply ?? false,
    servingSize: item.serving_size || "",
    notes: item.notes || "",
    expiration: item.expiration_date ?? "",
    preferredVendorId: (item.preferred_vendor_id ?? null) as string | null,
    categoryIds: item.categories.map((c) => c.id),
    subcategoryIds: item.subcategories.map((s) => s.id),
    // The photos belong here as much as any other field. Left out, adding a
    // picture changed nothing the dirty tracker could see: the header kept
    // saying no changes and Save stayed disabled, so a photo on its own could
    // not be saved at all. `?? null` on both sides because a row fetched
    // before one of these columns existed comes back undefined through the
    // untyped client, which would otherwise read as an edit on open.
    imagePrimary: item.image_primary_url ?? null,
    imageFront: item.image_front_url ?? null,
    imageBack: item.image_back_url ?? null,
    imageSide: item.image_side_url ?? null,
  }));

  const pendingChanges = changeCount(baseline, {
    name, brand, flavor, barcode,
    storageType: storageType as string,
    quantity, unit,
    location: (location ?? null) as string | null,
    restockThreshold, requiresRefrigeration,
    calories, protein, carbs, fats, sugars, fiber, isScheduledSupply, servingSize, notes,
    expiration: expirationDate ? getLocalDateString(expirationDate) : "",
    preferredVendorId,
    categoryIds: selectedCategoryIds,
    subcategoryIds: selectedSubcategoryIds,
    imagePrimary: imagePrimary ?? null,
    imageFront: imageFront ?? null,
    imageBack: imageBack ?? null,
    imageSide: imageSide ?? null,
  });
  const isDirty = pendingChanges > 0;

  // Photograph the panel instead of typing six numbers off it. The function
  // transcribes and returns; nothing is written until Save, and anything it
  // could not read stays null rather than being guessed — a nutrition panel is
  // read literally, so an invented figure would flow into the day's targets
  // as fact.
  const [scanningLabel, setScanningLabel] = useState(false);
  const scanNutritionLabel = async () => {
    const opts: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7,
      base64: true,
    };

    // The camera is the point — you are standing in front of the packet — but
    // it can be absent (simulator) or refused, and `launchCameraAsync` REJECTS
    // in both cases rather than returning a canceled result. Left uncaught
    // that surfaces as a red console error; caught, the photo library is the
    // honest fallback, since a panel photographed earlier reads just as well.
    let base64: string | null = null;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error("camera permission not granted");
      const shot = await ImagePicker.launchCameraAsync(opts);
      if (shot.canceled) return;
      base64 = shot.assets[0]?.base64 ?? null;
    } catch {
      const picked = await ImagePicker.launchImageLibraryAsync(opts).catch(() => null);
      if (!picked || picked.canceled) return;
      base64 = picked.assets[0]?.base64 ?? null;
    }
    if (!base64) return;

    setScanningLabel(true);
    try {
      const { data, error } = await supabase.functions.invoke("nutrition-label", {
        body: { imageBase64: base64 },
      });
      if (error) throw error;
      if (!data?.found) {
        Alert.alert(
          "No panel found",
          data?.note ?? "That doesn't look like a Nutrition Facts panel.",
        );
        return;
      }
      // Only overwrite what was actually read. A null means the panel did not
      // show it, which must not wipe a figure you already had.
      if (data.servingSize !== null) setServingSize(String(data.servingSize));
      if (data.calories !== null) setCalories(String(data.calories));
      if (data.protein !== null) setProtein(String(data.protein));
      if (data.carbs !== null) setCarbs(String(data.carbs));
      if (data.fats !== null) setFats(String(data.fats));
      if (data.sugars !== null) setSugars(String(data.sugars));
      if (data.fiber !== null && data.fiber !== undefined) setFiber(String(data.fiber));
      if (data.note) Alert.alert("Read the panel", data.note);
    } catch (e) {
      console.error("nutrition label scan failed:", e);
      Alert.alert("Couldn't read it", "Try again with more light and the panel filling the frame.");
    } finally {
      setScanningLabel(false);
    }
  };

  // Cancel only interrupts when there is genuinely something to lose.
  const handleCancel = () => {
    if (!isDirty) {
      onClose();
      return;
    }
    Alert.alert(
      "Discard changes?",
      `${changeLabel(pendingChanges)} will be lost.`,
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onClose },
      ],
    );
  };

  // Subcategory names carry their parent — "Frozen › Breakfast Foods" — which
  // is the only thing separating that from the standalone Breakfast Foods
  // category with the same name.
  const qualifiedSubcategory = (sub: FoodSubcategory): string => {
    const parent = categories.find((c) => c.id === sub.category_id);
    return parent ? `${parent.name} › ${sub.name}` : sub.name;
  };

  const categoryPath = (() => {
    const chosenSubs = subcategories.filter((s) => selectedSubcategoryIds.includes(s.id));
    if (chosenSubs.length > 0) return qualifiedSubcategory(chosenSubs[0]);
    const chosenCats = categories.filter((c) => selectedCategoryIds.includes(c.id));
    return chosenCats.length > 0 ? chosenCats[0].name : null;
  })();

  const brandOptions = (vocab?.brands ?? []).map((b) => ({
    value: b.name,
    note: `${b.count} item${b.count === 1 ? "" : "s"}`,
  }));

  // Varieties narrow to the chosen brand: picking Kirkland should not offer
  // every flavour word in the database. With no brand yet, offer them all.
  const flavorOptions = (() => {
    if (!vocab) return [];
    const scoped = vocab.flavorsByBrand.get(brand.trim().toLowerCase());
    return (scoped ?? vocab.allFlavors).map((f) => ({ value: f }));
  })();
  const flavorScope = brand.trim().length > 0 && vocab?.flavorsByBrand.has(brand.trim().toLowerCase())
    ? `Already used for ${brand.trim()}`
    : "Used elsewhere in your inventory";

  // `daysBetweenLocalDates`, not hand-rolled millisecond arithmetic. The
  // version this replaces subtracted local MIDNIGHT today from a date
  // `parseLocalDate` anchors at local NOON, so every gap came out half a day
  // long and rounded up: a use-by five days out read "in 6 days" here while
  // the grid and the item page — both of which go through the shared
  // helper — said five. Same clock at both ends, one answer everywhere.
  const daysUntilExpiry = expirationDate
    ? daysBetweenLocalDates(getLocalDateString(), getLocalDateString(expirationDate))
    : null;

  const shelfLifeHint = estimateShelfLifeDays(
    categories.filter((c) => selectedCategoryIds.includes(c.id)).map((c) => c.name),
  );

  const fetchCategoriesAndSubcategories = async () => {
    try {
      const [categoriesResult, subcategoriesResult] = await Promise.all([
        supabase
          .from("food_categories")
          .select("*")
          .not("slug", "in", '("all-products","out-of-stock")')
          .order("display_order"),
        supabase
          .from("food_subcategories")
          .select("*")
          .order("display_order"),
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (subcategoriesResult.error) throw subcategoriesResult.error;

      setCategories(categoriesResult.data || []);
      setSubcategories(subcategoriesResult.data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      Alert.alert("Error", "Failed to load categories");
    }
  };

  const fetchLocationEntries = async (itemId: string) => {
    try {
      const { data, error } = await supabase
        .from("food_inventory_locations")
        .select("*")
        .eq("food_inventory_id", itemId)
        .order("is_ready_to_consume", { ascending: false });

      if (error) throw error;

      const entries: LocationEntry[] = (data || []).map(loc => ({
        id: loc.id,
        location: loc.location,
        quantity: loc.quantity.toString(),
        isReadyToConsume: loc.is_ready_to_consume,
        notes: loc.notes || "",
      }));

      setLocationEntries(entries);
    } catch (error) {
      console.error("Error fetching location entries:", error);
    }
  };

  // A failure here is benign — the picker just falls back to rendering only
  // "None" and stays functional — but wrapped for consistency with every
  // other fetch in this file (this was the one exception).
  const fetchVendors = async () => {
    try {
      const { data, error } = await supabase
        .from("nutrition_vendors")
        .select("*")
        .order("display_order");

      if (error) throw error;

      setVendors((data ?? []) as NutritionVendor[]);
    } catch (error) {
      console.error("Error fetching vendors:", error);
    }
  };

  const handleBarcodeScanned = async (scannedBarcode: string) => {
    setBarcode(scannedBarcode);
    setLoadingProductData(true);

    try {
      const productData = await getProductByBarcode(scannedBarcode);

      if (productData) {
        // Auto-populate form fields
        if (productData.name && !name) {
          setName(productData.name);
        }
        if (productData.brand && !brand) {
          setBrand(productData.brand);
        }
        if (productData.servingSize && !servingSize) {
          setServingSize(productData.servingSize);
        }
        if (productData.calories !== null && !calories) {
          setCalories(productData.calories.toString());
        }
        if (productData.protein !== null && !protein) {
          setProtein(productData.protein.toString());
        }
        if (productData.carbs !== null && !carbs) {
          setCarbs(productData.carbs.toString());
        }
        if (productData.fats !== null && !fats) {
          setFats(productData.fats.toString());
        }
        if (productData.sugars !== null && !sugars) {
          setSugars(productData.sugars.toString());
        }
        if (productData.imagePrimaryUrl && !imagePrimary) {
          setImagePrimary(productData.imagePrimaryUrl);
        }
        if (productData.imageFrontUrl && !imageFront) {
          setImageFront(productData.imageFrontUrl);
        }
        if (productData.imageBackUrl && !imageBack) {
          setImageBack(productData.imageBackUrl);
        }

        Alert.alert(
          "Product Found!",
          `${productData.name}${productData.brand ? ` by ${productData.brand}` : ""} has been loaded.`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "Product Not Found",
          "No product information found for this barcode. You can enter details manually.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("Error fetching product data:", error);
      Alert.alert("Error", "Failed to fetch product information. Please enter details manually.");
    } finally {
      setLoadingProductData(false);
    }
  };

  const addLocationEntry = () => {
    const newEntry: LocationEntry = {
      id: Date.now().toString(),
      location: "fridge",
      quantity: "",
      isReadyToConsume: true,
      notes: "",
    };
    setLocationEntries([...locationEntries, newEntry]);
  };

  const updateLocationEntry = (id: string, updates: Partial<LocationEntry>) => {
    setLocationEntries(locationEntries.map(entry =>
      entry.id === id ? { ...entry, ...updates } : entry
    ));
  };

  const removeLocationEntry = (id: string) => {
    setLocationEntries(locationEntries.filter(entry => entry.id !== id));
  };

  // Opening a section brings it to the top of the view, so the whole card is
  // visible instead of hanging off the bottom edge.
  //
  // The scroll cannot happen here: this accordion opens one section at a time,
  // so expanding a lower one collapses an upper one and every position below
  // it moves. The target's own onLayout is the first moment its new position
  // is known, so the request is recorded now and acted on there.
  const scrollRef = useRef<ScrollView>(null);
  const [pendingScrollTo, setPendingScrollTo] = useState<SectionKey | null>(null);

  const onSectionLayout = (section: SectionKey) => (e: LayoutChangeEvent) => {
    if (pendingScrollTo !== section) return;
    const y = e.nativeEvent.layout.y;
    // A little above the card, so it does not sit flush against the header.
    scrollRef.current?.scrollTo({ y: Math.max(0, y - spacing.md), animated: true });
    setPendingScrollTo(null);
  };

  const toggleSection = (section: SectionKey) => {
    if (Platform.OS === 'ios') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    // Only on open. Re-tapping the open section is a no-op today, and
    // scrolling on a close would yank the page for no reason.
    if (expandedSection !== section) setPendingScrollTo(section);
    setExpandedSection(expandedSection === section ? expandedSection : section);
  };

  const toggleCategory = (categoryId: string) => {
    const newExpandedIds = new Set(expandedCategoryIds);
    if (newExpandedIds.has(categoryId)) {
      newExpandedIds.delete(categoryId);
    } else {
      newExpandedIds.add(categoryId);
    }
    setExpandedCategoryIds(newExpandedIds);
  };

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedCategoryIds(prev => {
      if (prev.includes(categoryId)) {
        // Deselect category and all its subcategories
        const categorySubcategoryIds = subcategories
          .filter(sub => sub.category_id === categoryId)
          .map(sub => sub.id);

        setSelectedSubcategoryIds(prevSubs =>
          prevSubs.filter(id => !categorySubcategoryIds.includes(id))
        );

        return prev.filter(id => id !== categoryId);
      } else {
        // Select category and expand it
        setExpandedCategoryIds(prev => new Set([...prev, categoryId]));
        return [...prev, categoryId];
      }
    });
  };

  const toggleSubcategorySelection = (subcategoryId: string, categoryId: string) => {
    setSelectedSubcategoryIds(prev => {
      if (prev.includes(subcategoryId)) {
        return prev.filter(id => id !== subcategoryId);
      } else {
        // Ensure parent category is selected
        if (!selectedCategoryIds.includes(categoryId)) {
          setSelectedCategoryIds(prevCats => [...prevCats, categoryId]);
        }
        return [...prev, subcategoryId];
      }
    });
  };

  const handleSave = async () => {
    // Clear previous validation errors
    const errors = new Set<string>();

    // Validation
    if (!name.trim()) {
      errors.add("name");
      setValidationErrors(errors);
      setExpandedSection("basic");
      Alert.alert("Validation Error", "Product name is required");
      return;
    }

    // Validate categories and subcategories
    if (selectedCategoryIds.length === 0) {
      errors.add("categories");
      setValidationErrors(errors);
      setExpandedSection("basic");
      Alert.alert("Validation Error", "Please select at least one category");
      return;
    }

    if (selectedSubcategoryIds.length === 0) {
      errors.add("subcategories");
      setValidationErrors(errors);
      setExpandedSection("basic");
      Alert.alert("Validation Error", "Please select at least one subcategory");
      return;
    }

    // The exact set of location rows this save must end with — the only
    // quantity truth. BOTH storage types go through replaceItemLocations, so a
    // single-location save always leaves exactly one row and a multi -> single
    // flip leaves no orphan rows behind.
    //
    // Built HERE, inside validation, and this placement is load-bearing: the
    // numbers that get validated are by construction the numbers that get
    // written. There is no second parse downstream that could disagree.
    const locationRows: Array<{
      location: FoodLocation;
      quantity: number;
      is_ready_to_consume: boolean;
      notes?: string | null;
    }> = [];

    // ONE expression for a single-location item's location, used for BOTH the
    // location row that holds the stock and `food_inventory.location` below,
    // so the display column cannot disagree with the row. Matches the
    // reconcile's own `coalesce(fi.location, 'pantry')` (20260730100000:40-61).
    const singleLocation: FoodLocation = location ?? "pantry";

    const isSingle = storageType === 'single-location';

    // Validate based on storage type
    if (isSingle) {
      const parsedQuantity = parseQuantityInput(quantity);
      if (parsedQuantity === null) {
        errors.add("quantity");
        setValidationErrors(errors);
        setExpandedSection("storage");
        Alert.alert("Validation Error", "Valid quantity is required");
        return;
      }
      locationRows.push({
        location: singleLocation,
        quantity: parsedQuantity,
        is_ready_to_consume: true,
      });
    } else {
      // Multi-location validation
      if (locationEntries.length === 0) {
        errors.add("locationEntries");
        setValidationErrors(errors);
        setExpandedSection("storage");
        Alert.alert("Validation Error", "Please add at least one location entry");
        return;
      }

      for (const entry of locationEntries) {
        const parsedQuantity = parseQuantityInput(entry.quantity);
        if (parsedQuantity === null) {
          errors.add("locationEntries");
          setValidationErrors(errors);
          setExpandedSection("storage");
          Alert.alert("Validation Error", "All location entries must have valid quantities");
          return;
        }
        locationRows.push({
          location: entry.location,
          quantity: parsedQuantity,
          is_ready_to_consume: entry.isReadyToConsume,
          notes: entry.notes || null,
        });
      }
    }

    // Every remaining numeric field gets the treatment `quantity` got: ONE
    // parser shared by validation and the write, so the number that is checked
    // is by construction the number that is stored. They all used to run a bare
    // `parseInt`/`parseFloat` behind only a truthiness check, and because every
    // one of these columns is NULLABLE the failure was silent rather than loud
    // — a NaN serialises to null, so a fat-fingered entry CLEARED the stored
    // value while the user was told the save succeeded.
    //
    // Two parsers, because the columns are two different kinds:
    //   • INTEGER  — calories (20250206_tracking_tables.sql:54), restock_threshold
    //     (20250209_extend_food_inventory.sql:19), the two multi-location
    //     thresholds (20250217000003:57-58). Decimals are rejected.
    //   • DECIMAL(10,2) — protein/carbs/fats/sugars (20250206:55-58). Decimals
    //     are ACCEPTED; grams are continuous and "1.5" is a legitimate value,
    //     so reusing the integer parser here would reject real data.
    //
    // Scoped to the fields the ACTIVE storage type actually renders. The
    // threshold inputs are mutually exclusive on screen — "Restock Threshold"
    // is single-location only, "Ready"/"Total" are multi-location only — so
    // validating all four unconditionally could reject a value the user cannot
    // see or reach: type garbage into "Ready Threshold", flip to
    // single-location, and the save dead-ends on an alert pointing at a
    // section that no longer contains the field. You can only be blocked by
    // what you can edit; correspondingly, `itemData` below OMITS the inactive
    // pair entirely rather than rewriting it.
    type NumericField = {
      key: string;
      raw: string;
      section: SectionKey;
      label: string;
      parse: (raw: string) => number | null;
      rule: string;
    };
    const int = (key: string, raw: string, section: SectionKey, label: string): NumericField =>
      ({ key, raw, section, label, parse: parseQuantityInput, rule: "a whole number of 0 or more" });
    const dec = (key: string, raw: string, label: string): NumericField =>
      ({ key, raw, section: "nutrition", label, parse: parseDecimalInput, rule: "a number of 0 or more" });

    const visibleNumericFields: NumericField[] = [
      ...(isSingle
        ? [int("restockThreshold", restockThreshold, "storage", "Restock Threshold")]
        : [
            int("fridgeRestockThreshold", fridgeRestockThreshold, "storage", "Ready Threshold"),
            int("totalRestockThreshold", totalRestockThreshold, "storage", "Total Threshold"),
          ]),
      int("calories", calories, "nutrition", "Calories"),
      dec("protein", protein, "Protein"),
      dec("carbs", carbs, "Carbohydrates"),
      dec("fats", fats, "Fats"),
      dec("sugars", sugars, "Sugars"),
      dec("fiber", fiber, "Fiber"),
    ];
    for (const { key, raw, section, label, parse, rule } of visibleNumericFields) {
      // Empty means "not set" and stays null — only a non-empty value has to parse.
      if (raw.trim() !== "" && parse(raw) === null) {
        errors.add(key);
        setValidationErrors(errors);
        setExpandedSection(section);
        Alert.alert("Validation Error", `${label} must be ${rule}`);
        return;
      }
    }

    setValidationErrors(new Set());

    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in");
        return;
      }

      // Upload images if they are new (local URIs)
      let primaryUrl = imagePrimary;
      let frontUrl = imageFront;
      let backUrl = imageBack;
      let sideUrl = imageSide;

      if (imagePrimary && imagePrimary.startsWith("file://")) {
        primaryUrl = await uploadImage(imagePrimary, "primary");
      }
      if (imageFront && imageFront.startsWith("file://")) {
        frontUrl = await uploadImage(imageFront, "front");
      }
      if (imageBack && imageBack.startsWith("file://")) {
        backUrl = await uploadImage(imageBack, "back");
      }
      if (imageSide && imageSide.startsWith("file://")) {
        sideUrl = await uploadImage(imageSide, "side");
      }

      // This screen owns the app's only food photographs, and the eating half
      // of the app borrows them through a cached map — so a new or replaced
      // picture has to drop that cache or Quick Add and the Meal Library keep
      // showing the old one for up to a minute.
      invalidateBorrowedFoodImages();

      const itemData = {
        user_id: user.id,
        name: name.trim(),
        brand: brand.trim() || null,
        flavor: flavor.trim() || null,
        barcode: barcode.trim() || null,
        storage_type: storageType,
        // No `quantity` here: food_inventory.quantity is the legacy cache and
        // replaceItemLocations owns it now. Writing it from here is what let
        // the cache and the location rows tell two different stories.
        unit: unit,
        location: isSingle ? singleLocation : null,
        // C5: fridge-stored implies refrigeration — derived, not trusted to a
        // second hand-set flag. Storing milk in the Fridge while the row said
        // "Requires Refrigeration: No" was the DB contradicting itself; the
        // 2026-08-11 data fix corrected 8 such rows, and this keeps the pair
        // coherent for every future save. The user's explicit YES is never
        // downgraded — derivation only ever adds the requirement.
        requires_refrigeration: requiresRefrigeration || location === "fridge",
        // Only the thresholds the active storage type RENDERS appear in the
        // payload; the inactive ones are absent, so an UPDATE genuinely does
        // not touch those columns. Writing them from `item.*` instead would
        // rewrite them from a snapshot that can be STALE: on the update path a
        // `replaceItemLocations` failure keeps this screen mounted (see the
        // "Stock Not Saved — tap Save again" branch) after the item UPDATE has
        // already committed, so `item` still holds the pre-save values. A user
        // who then flips storage type and re-saves as instructed would silently
        // revert the threshold they just changed. Absence has no such failure
        // mode. (The INSERT re-supplies them at the call site — `item` there is
        // the synthetic literal from add.tsx/preview.tsx and cannot be stale.)
        ...(isSingle
          // `restock_threshold` keeps its historical 0 for "not set": unlike
          // its three nullable siblings the column is `INTEGER DEFAULT 1` with
          // no CHECK and the TS type is non-null, so 0 rather than null is the
          // consistent "unset" — a whitespace-only entry now writes 0 where it
          // used to write null.
          ? { restock_threshold: parseQuantityInput(restockThreshold) ?? 0 }
          : {
              fridge_restock_threshold: parseQuantityInput(fridgeRestockThreshold),
              total_restock_threshold: parseQuantityInput(totalRestockThreshold),
            }),
        // Validated above with these same two parsers, so no second parse can
        // disagree. The macros accept decimals; the integers do not.
        calories: parseQuantityInput(calories),
        protein: parseDecimalInput(protein),
        carbs: parseDecimalInput(carbs),
        fats: parseDecimalInput(fats),
        sugars: parseDecimalInput(sugars),
        fiber_g: parseDecimalInput(fiber),
        is_scheduled_supply: isScheduledSupply,
        serving_size: servingSize.trim() || null,
        // `getLocalDateString`, not `.toISOString().split("T")[0]`: the picker
        // returns the chosen date carrying a TIME component (iOS spinner keeps
        // it from `value`, which is `new Date()` on a first pick), and a
        // local-afternoon time converts to the NEXT UTC day — so picking Aug 15
        // at 17:00 local wrote "2026-08-16". Formatting the local calendar
        // fields makes the write independent of the time component entirely.
        expiration_date: expirationDate ? getLocalDateString(expirationDate) : null,
        notes: notes.trim() || null,
        preferred_vendor_id: preferredVendorId,
        image_primary_url: primaryUrl,
        image_front_url: frontUrl,
        image_back_url: backUrl,
        image_side_url: sideUrl,
      };

      let foodItemId: string;

      if (isNew) {
        // CREATE new item
        const { data: newItem, error: insertError } = await supabase
          .from("food_inventory")
          // `quantity` is dropped from itemData above, but the column is
          // INTEGER NOT NULL with no default (20250206_tracking_tables.sql:14),
          // so the INSERT still has to supply one. 0 is the only honest seed:
          // the replaceItemLocations RPC below is atomic, so a failure there
          // rolls back with zero location rows written — a 0 cache alongside
          // 0 location rows is what every reader agrees on.
          .insert({
            // `itemData` omits the thresholds the active storage type does not
            // render, so an UPDATE cannot disturb them. An INSERT has to supply
            // every column it wants set, and here the values come from the
            // synthetic literal in add.tsx / preview.tsx — a fresh object built
            // this render, so the staleness that motivated the omission cannot
            // arise. Spread first so the active threshold still wins.
            restock_threshold: item.restock_threshold,
            fridge_restock_threshold: item.fridge_restock_threshold,
            total_restock_threshold: item.total_restock_threshold,
            ...itemData,
            quantity: 0,
          })
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (!newItem) throw new Error("Failed to create item");

        foodItemId = newItem.id;

        // Runs after the item row exists, so foodItemId is real.
        //
        // ⚠️ CREATE PATH ONLY — the rollback below DELETES the item row. That
        // is correct here and only here, because this code created it moments
        // ago: creating is the item-row INSERT above followed by the atomic
        // replaceItemLocations RPC, and a failure in that RPC would strand the
        // item row with zero location rows, which the grid renders as a real
        // out-of-stock product and which every retry would duplicate.
        // The update path's equivalent call is deliberately NOT wrapped in
        // this — see the comment there.
        try {
          await replaceItemLocations(foodItemId, locationRows);
        } catch (locationError) {
          const { error: rollbackError } = await supabase
            .from("food_inventory")
            .delete()
            .eq("id", foodItemId);
          // Logged, never rethrown: the location failure is the one the user
          // has to see, and a failed rollback must not mask it.
          if (rollbackError) {
            console.error("Failed to roll back orphaned item after location write failed:", rollbackError);
          }
          throw locationError;
        }

        // Insert category mappings
        if (selectedCategoryIds.length > 0) {
          const categoryMappings = selectedCategoryIds.map(categoryId => ({
            food_inventory_id: foodItemId,
            category_id: categoryId,
            user_id: user.id,
          }));

          const { error: categoryInsertError } = await supabase
            .from("food_inventory_category_map")
            .insert(categoryMappings);

          if (categoryInsertError) throw categoryInsertError;
        }

        // Insert subcategory mappings
        if (selectedSubcategoryIds.length > 0) {
          const subcategoryMappings = selectedSubcategoryIds.map(subcategoryId => ({
            food_inventory_id: foodItemId,
            subcategory_id: subcategoryId,
            user_id: user.id,
          }));

          const { error: subcategoryInsertError } = await supabase
            .from("food_inventory_subcategory_map")
            .insert(subcategoryMappings);

          if (subcategoryInsertError) throw subcategoryInsertError;
        }

        // E1/E2: intelligence at birth — fire-and-forget. The function links
        // this item to a concept and (if none was chosen above) proposes a
        // category, so every new item joins the loop connected instead of
        // landing in the unlinked pile that starved assemblability, Forecast,
        // and Shopping. Failure is non-fatal by design: the item still exists,
        // and FoodMatchingScreen's "Needs review" remains the backstop.
        supabase.functions
          .invoke("inventory-intelligence", { body: { inventoryIds: [foodItemId] } })
          .then(({ error }) => {
            if (error) console.error("inventory-intelligence (on add):", error);
          });

        Alert.alert("Success", "Item added successfully");
        onSave(foodItemId);
        onClose();
      } else {
        // UPDATE existing item
        const { error } = await supabase
          .from("food_inventory")
          .update(itemData)
          .eq("id", item.id);

        if (error) throw error;

        foodItemId = item.id;

        // Handle category and subcategory mappings
        // Delete existing category mappings
        const { error: deleteCategoryError } = await supabase
          .from("food_inventory_category_map")
          .delete()
          .eq("food_inventory_id", item.id);

        if (deleteCategoryError) throw deleteCategoryError;

        // Delete existing subcategory mappings
        const { error: deleteSubcategoryError } = await supabase
          .from("food_inventory_subcategory_map")
          .delete()
          .eq("food_inventory_id", item.id);

        if (deleteSubcategoryError) throw deleteSubcategoryError;

        // Insert new category mappings
        if (selectedCategoryIds.length > 0) {
          const categoryMappings = selectedCategoryIds.map(categoryId => ({
            food_inventory_id: item.id,
            category_id: categoryId,
            user_id: user.id,
          }));

          const { error: categoryInsertError } = await supabase
            .from("food_inventory_category_map")
            .insert(categoryMappings);

          if (categoryInsertError) throw categoryInsertError;
        }

        // Insert new subcategory mappings
        if (selectedSubcategoryIds.length > 0) {
          const subcategoryMappings = selectedSubcategoryIds.map(subcategoryId => ({
            food_inventory_id: item.id,
            subcategory_id: subcategoryId,
            user_id: user.id,
          }));

          const { error: subcategoryInsertError } = await supabase
            .from("food_inventory_subcategory_map")
            .insert(subcategoryMappings);

          if (subcategoryInsertError) throw subcategoryInsertError;
        }

        // Deliberately LAST on the update path. Two reasons, both about what a
        // failure leaves behind:
        //
        // 1. It makes the alert below honest. This handler cannot roll back
        //    what it has already committed, so the only way to truthfully say
        //    "everything except the stock was saved" is for the stock write to
        //    be the final step. When the mapping writes ran after it, a mapping
        //    failure discarded the user's tag edits while the message claimed
        //    the details were saved.
        // 2. Every earlier failure now leaves the stock completely untouched,
        //    because nothing before this line writes a location row.
        //
        // Unconditional, not multi-location-only: the old code left a
        // single-location save's rows untouched, so a stale row survived every
        // edit and a multi -> single flip orphaned every row it used to have.
        //
        // NO rollback wrapper here, unlike the create path: this item
        // pre-existed the save, so deleting it would destroy the user's data
        // rather than clean up after ourselves.
        //
        // A failure here is not "the save didn't happen" — the item UPDATE
        // above already committed, independent of the stock write below.
        // That UPDATE can carry storage_type/location changes: a single ->
        // multi flip that then fails leaves storage_type flipped against
        // surviving single-location rows, which skews lowThresholdFor
        // (stockState.ts:81) until the next successful save — a real,
        // narrow residual the alert below does not mention, because it
        // speaks only to the stock.
        //
        // What the failure DOES leave untouched: replaceItemLocations is
        // now the atomic replace_item_locations RPC, so a failure rolls the
        // location-row writes and the cache resync back together, leaving
        // both exactly as they were before this save — the item's PREVIOUS
        // quantity, never a fabricated 0. The copy below states that
        // plainly rather than hedging: re-saving is idempotent and repairs
        // both the stock and the storage_type residual regardless.
        // That recovery only works if the user is told to re-save, so this gets
        // its own message instead of the generic one below, and the screen
        // stays open with the typed quantity intact so re-saving is one tap.
        try {
          await replaceItemLocations(foodItemId, locationRows);
        } catch (locationError) {
          console.error("Error saving location rows:", locationError);
          Alert.alert(
            "Stock Not Saved",
            "The item's other details were saved, but its stock was not — it still shows the previous quantity. Tap Save again to retry.",
          );
          return;
        }

        Alert.alert("Success", "Item updated successfully");
        onSave();
      }
    } catch (error: any) {
      console.error("Error saving item:", error);
      Alert.alert("Error", "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

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
          <Text style={styles.headerTitle}>{isNew ? "Add Product" : "Edit Product"}</Text>
          {/* Makes Save honest: you can see whether the form thinks anything
              moved, and how much, before you commit to it. */}
          <Text style={[styles.headerState, isDirty && styles.headerStateDirty]} numberOfLines={1}>
            {isNew ? "" : changeLabel(pendingChanges)}
          </Text>
        </View>

        {/* Form */}
        {/* `handled`: this scroller holds both the text fields and the controls
            (accordion headers, Scan, the location add/remove actions), so
            without it the first tap on any of them only dismisses the keyboard. */}
        <ScrollView
          ref={scrollRef}
          style={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Scan leads the form. The fastest way to fill this in correctly
              is not to fill it in by hand, and the barcode used to be the LAST
              field of Basic Information, below a twelve-category accordion —
              nobody scrolls past all that to scan first. */}
          <View style={styles.scanBar}>
            <View style={styles.scanBarText}>
              <Text style={styles.scanBarCode} numberOfLines={1}>
                {barcode || "No barcode yet"}
              </Text>
              <Text style={styles.scanBarNote}>
                {loadingProductData
                  ? "Reading the product…"
                  : barcode
                    ? "Rescan to refresh name, brand and nutrition"
                    : "Scan to fill in the name, brand and nutrition"}
              </Text>
            </View>
            {/* Fixed width, not intrinsic: Button grows to its content, which
                in a flex row starves the text column beside it. */}
            <View style={styles.scanBarAction}>
              <Button
                label={barcode ? "Rescan" : "Scan"}
                onPress={() => setShowBarcodeScanner(true)}
                size="sm"
                icon={Barcode}
                loading={loadingProductData}
                disabled={loadingProductData}
                fluid
              />
            </View>
          </View>

          {/* Basic Information Section */}
          <View style={styles.section} onLayout={onSectionLayout("basic")}>
            <SectionHeader
              title="Basic Information"
              summary={basicSummary(brand || null, categoryPath)}
              sectionKey="basic"
              isExpanded={expandedSection === "basic"}
              hasError={validationErrors.has("name")}
              onPress={() => toggleSection("basic")}
            />

            {expandedSection === "basic" && (
              <View style={styles.sectionContent}>
                {/* Identity, not management: enough to know you are editing
                    the right packet. The full photo manager is its own section
                    directly below — the top of an EDIT form belongs to
                    scanning, which is what saves you the typing. */}
                {[imagePrimary, imageFront, imageBack, imageSide].filter(Boolean).length > 0 && (
                  <View style={styles.identityRow}>
                    {[imagePrimary, imageFront, imageBack, imageSide]
                      .filter((u): u is string => !!u)
                      .map((uri, i) => (
                        <Image key={`${uri}:${i}`} source={{ uri }} style={styles.identityThumb} />
                      ))}
                  </View>
                )}

                <View style={styles.field}>
                  <Text style={styles.label}>
                    Product Name <Text style={styles.required}>*</Text>
                  </Text>
                  {/* Multiline: this is the field that identifies the item,
                      and it was the one field you could not read — a long
                      product name truncated with an ellipsis in a single line
                      box, so you could not check what you were editing. */}
                  <TextInput
                    style={[
                      styles.input,
                      styles.inputMultiline,
                      validationErrors.has("name") && styles.inputError,
                    ]}
                    placeholder="e.g., Greek Yogurt"
                    placeholderTextColor={colors.textFaint}
                    value={name}
                    onChangeText={setName}
                    multiline
                  />
                </View>

                <SuggestField
                  label="Brand"
                  noun="brand"
                  value={brand}
                  onChange={setBrand}
                  placeholder="e.g., Chobani"
                  options={brandOptions}
                />

                <SuggestField
                  label="Flavor / Variety"
                  noun="variety"
                  value={flavor}
                  onChange={setFlavor}
                  placeholder="e.g., Vanilla, Strawberry"
                  options={flavorOptions}
                  scopeNote={flavorScope}
                />

                {/* Categories & Subcategories — chips first. The accordion
                    opened on Produce with the item's real category buried
                    twelve rows down, so the one thing you most needed to see
                    was the one thing it never showed. */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Categories &amp; Subcategories <Text style={styles.required}>*</Text>
                    {selectedCategoryIds.length > 0 && selectedSubcategoryIds.length > 0 && (
                      <Text style={styles.satisfied}>  ✓</Text>
                    )}
                  </Text>
                  <Text style={styles.helpText}>
                    Select at least one category and subcategory
                  </Text>

                  <View style={styles.chipWrap}>
                    {categories
                      .filter((c) => selectedCategoryIds.includes(c.id))
                      .map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.pickChip, styles.pickChipCategory]}
                          onPress={() => toggleCategorySelection(c.id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${c.name}`}
                        >
                          <Text style={[styles.pickChipText, styles.pickChipTextCategory]}>
                            {c.name}  ✕
                          </Text>
                        </TouchableOpacity>
                      ))}
                    {subcategories
                      .filter((sub) => selectedSubcategoryIds.includes(sub.id))
                      .map((sub) => (
                        <TouchableOpacity
                          key={sub.id}
                          style={styles.pickChip}
                          onPress={() => toggleSubcategorySelection(sub.id, sub.category_id)}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${qualifiedSubcategory(sub)}`}
                        >
                          <Text style={styles.pickChipText}>
                            {qualifiedSubcategory(sub)}  ✕
                          </Text>
                        </TouchableOpacity>
                      ))}
                    <TouchableOpacity
                      style={[styles.pickChip, styles.pickChipAdd]}
                      onPress={() => setShowCategoryPicker(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Add a category"
                    >
                      <Text style={styles.pickChipText}>+ Add</Text>
                    </TouchableOpacity>
                  </View>

                  {categories.length === 0 && (
                    <Text style={styles.emptyText}>Loading categories...</Text>
                  )}
                </View>

              </View>
            )}
          </View>

          {/* Images Section */}
          <View style={styles.section} onLayout={onSectionLayout("images")}>
            <SectionHeader
              title="Product Images"
              summary={photosSummary([imagePrimary, imageFront, imageBack, imageSide].filter(Boolean).length)}
              sectionKey="images"
              isExpanded={expandedSection === "images"}
              hasError={false}
              onPress={() => toggleSection("images")}
            />

            {expandedSection === "images" && (
              <View style={styles.sectionContent}>
                <Text style={styles.sectionSubtitle}>Add photos to easily identify your products</Text>

                <View style={styles.imageGrid}>
                  {[
                    { label: "Primary", image: imagePrimary, type: "primary" as const },
                    { label: "Front", image: imageFront, type: "front" as const },
                    { label: "Back", image: imageBack, type: "back" as const },
                    { label: "Side", image: imageSide, type: "side" as const },
                  ].map(({ label, image, type }) => (
                    <View key={label} style={styles.imageContainer}>
                      <TouchableOpacity
                        style={[styles.imagePlaceholder, image && styles.imageWithPhoto]}
                        onPress={() => pickImage(type)}
                      >
                        {image ? (
                          <Image source={{ uri: image }} style={styles.productImage} />
                        ) : (
                          <>
                            <Camera size={32} color={colors.textFaint} />
                            <Text style={styles.imagePlaceholderText}>{label}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                      {image && (
                        <TouchableOpacity
                          style={styles.removeImageButton}
                          onPress={() => {
                            if (type === "primary") setImagePrimary(null);
                            else if (type === "front") setImageFront(null);
                            else if (type === "back") setImageBack(null);
                            else if (type === "side") setImageSide(null);
                          }}
                        >
                          <Trash2 size={icons.sm} color={colors.text} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>

          {/* Quantity & Storage Section */}
          <View style={styles.section} onLayout={onSectionLayout("storage")}>
            <SectionHeader
              title="Quantity & Storage"
              summary={storageSummary({
                storageType,
                quantity: Number.parseInt(quantity, 10) || 0,
                unit,
                location,
                locationCount: locationEntries.length,
                restockThreshold: Number.parseInt(restockThreshold, 10) || 0,
              })}
              sectionKey="storage"
              isExpanded={expandedSection === "storage"}
              hasError={validationErrors.has("quantity") || validationErrors.has("locationEntries")
                || validationErrors.has("restockThreshold") || validationErrors.has("fridgeRestockThreshold")
                || validationErrors.has("totalRestockThreshold")}
              onPress={() => toggleSection("storage")}
            />

            {expandedSection === "storage" && (
              <View style={styles.sectionContent}>
                {/* Storage Type Toggle */}
                <View style={styles.field}>
                  <Text style={styles.label}>Storage Type</Text>
                  <View style={styles.storageTypeButtons}>
                    <TouchableOpacity
                      style={[
                        styles.storageTypeButton,
                        storageType === "single-location" && styles.storageTypeButtonActive,
                      ]}
                      onPress={() => setStorageType("single-location")}
                    >
                      <Text
                        style={[
                          styles.storageTypeButtonText,
                          storageType === "single-location" && styles.storageTypeButtonTextActive,
                        ]}
                      >
                        Single Location
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.storageTypeButton,
                        storageType === "multi-location" && styles.storageTypeButtonActive,
                      ]}
                      onPress={() => setStorageType("multi-location")}
                    >
                      <Text
                        style={[
                          styles.storageTypeButtonText,
                          storageType === "multi-location" && styles.storageTypeButtonTextActive,
                        ]}
                      >
                        Multiple Locations
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Single Location Fields */}
                {storageType === "single-location" && (
                  <>
                    <View style={styles.row}>
                      <View style={[styles.field, styles.fieldHalf]}>
                        <Text style={styles.label}>
                          Quantity <Text style={styles.required}>*</Text>
                        </Text>
                        {/* A stepper, not a keyboard: this is a small integer
                            you nudge by one. The field inside stays typable
                            for the occasional jump from 2 to 24. */}
                        <NumberStepper
                          value={quantity}
                          onChange={setQuantity}
                          label="quantity"
                        />
                      </View>

                      <View style={[styles.field, styles.fieldHalf]}>
                        <Text style={styles.label}>Unit</Text>
                        <TouchableOpacity style={styles.pickerButton} onPress={() => setShowUnitPicker(true)}>
                          <Text style={styles.pickerButtonText}>{unit}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Location</Text>
                      {/* Segmented control, not four separate buttons: the
                          options are mutually exclusive and share a track, so
                          style rule 21's segmented case applies — surface2
                          trough, solid brand on the active segment, onBrand
                          label. Four independently-bordered filled buttons
                          read as four unrelated toggles. */}
                      <View style={styles.segTrack}>
                        {(["fridge", "freezer", "pantry", "cabinet"] as FoodLocation[]).map((loc) => (
                          <TouchableOpacity
                            key={loc}
                            style={[styles.segItem, location === loc && styles.segItemActive]}
                            onPress={() => setLocation(loc)}
                            accessibilityRole="button"
                            accessibilityState={{ selected: location === loc }}
                          >
                            <Text
                              style={[
                                styles.segText,
                                location === loc && styles.segTextActive,
                              ]}
                            >
                              {loc.charAt(0).toUpperCase() + loc.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>

                    <View style={styles.field}>
                      <Text style={styles.label}>Tell me to restock at</Text>
                      <View style={styles.thresholdRow}>
                        <NumberStepper
                          value={restockThreshold}
                          onChange={setRestockThreshold}
                          label="restock threshold"
                        />
                      </View>
                    </View>
                  </>
                )}

                {/* Multi-Location Fields */}
                {storageType === "multi-location" && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Unit</Text>
                      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowUnitPicker(true)}>
                        <Text style={styles.pickerButtonText}>{unit}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Requires Refrigeration Toggle */}
                    <View style={styles.field}>
                      <View style={styles.toggleRow}>
                        <View>
                          <Text style={styles.label}>Requires Refrigeration</Text>
                          <Text style={styles.helpText}>
                            Does this item need to be kept cold?
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.toggle,
                            requiresRefrigeration && styles.toggleActive,
                          ]}
                          onPress={() => setRequiresRefrigeration(!requiresRefrigeration)}
                        >
                          <View
                            style={[
                              styles.toggleThumb,
                              requiresRefrigeration && styles.toggleThumbActive,
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Location Entries */}
                    <View style={styles.field}>
                      <View style={styles.labelRow}>
                        <Text style={styles.label}>
                          Locations <Text style={styles.required}>*</Text>
                        </Text>
                        <Button
                          label="Add"
                          onPress={addLocationEntry}
                          size="sm"
                          icon={Plus}
                        />
                      </View>

                      {locationEntries.length === 0 && (
                        <Text style={styles.emptyText}>
                          No locations added yet. Tap "Add" to create one.
                        </Text>
                      )}

                      {validationErrors.has("locationEntries") && locationEntries.length === 0 && (
                        <View style={styles.errorBox}>
                          <Text style={styles.errorText}>Please add at least one location</Text>
                        </View>
                      )}

                      {locationEntries.map((entry) => (
                        <View key={entry.id} style={styles.locationEntryCard}>
                          <View style={styles.locationEntryHeader}>
                            <View style={styles.locationEntryField}>
                              <Text style={styles.locationEntryLabel}>Location</Text>
                              <View style={styles.locationEntryButtons}>
                                {(["fridge", "freezer", "pantry", "cabinet"] as FoodLocation[]).map((loc) => (
                                  <TouchableOpacity
                                    key={loc}
                                    style={[
                                      styles.locationEntryButton,
                                      entry.location === loc && styles.locationEntryButtonActive,
                                    ]}
                                    onPress={() => updateLocationEntry(entry.id, { location: loc })}
                                  >
                                    <Text
                                      style={[
                                        styles.locationEntryButtonText,
                                        entry.location === loc && styles.locationEntryButtonTextActive,
                                      ]}
                                    >
                                      {loc.charAt(0).toUpperCase() + loc.slice(1)}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>

                            <TouchableOpacity
                              style={styles.removeLocationButton}
                              onPress={() => removeLocationEntry(entry.id)}
                            >
                              <Trash2 size={icons.md} color={colors.danger} />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.locationEntryRow}>
                            <View style={[styles.locationEntryField, { flex: 1 }]}>
                              <Text style={styles.locationEntryLabel}>Quantity</Text>
                              <TextInput
                                style={styles.locationEntryInput}
                                placeholder="0"
                                placeholderTextColor={colors.textFaint}
                                value={entry.quantity}
                                onChangeText={(value) => updateLocationEntry(entry.id, { quantity: sanitizeInteger(value) })}
                                keyboardType="numeric"
                              />
                            </View>

                            <View style={[styles.locationEntryField, { flex: 1 }]}>
                              <Text style={styles.locationEntryLabel}>Status</Text>
                              <View style={styles.locationEntryButtons}>
                                <TouchableOpacity
                                  style={[
                                    styles.statusButton,
                                    entry.isReadyToConsume && styles.statusButtonActive,
                                  ]}
                                  onPress={() => updateLocationEntry(entry.id, { isReadyToConsume: true })}
                                >
                                  <Text
                                    style={[
                                      styles.statusButtonText,
                                      entry.isReadyToConsume && styles.statusButtonTextActive,
                                    ]}
                                  >
                                    Ready
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.statusButton,
                                    !entry.isReadyToConsume && styles.statusButtonActive,
                                  ]}
                                  onPress={() => updateLocationEntry(entry.id, { isReadyToConsume: false })}
                                >
                                  <Text
                                    style={[
                                      styles.statusButtonText,
                                      !entry.isReadyToConsume && styles.statusButtonTextActive,
                                    ]}
                                  >
                                    Storage
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>

                          <View style={styles.locationEntryField}>
                            <Text style={styles.locationEntryLabel}>Notes (optional)</Text>
                            <TextInput
                              style={styles.locationEntryInput}
                              placeholder="e.g., Bottom shelf, left side"
                              placeholderTextColor={colors.textFaint}
                              value={entry.notes}
                              onChangeText={(value) => updateLocationEntry(entry.id, { notes: value })}
                            />
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Threshold Fields */}
                    <View style={styles.row}>
                      <View style={[styles.field, styles.fieldHalf]}>
                        <Text style={styles.label}>Ready Threshold</Text>
                        <TextInput
                          style={[styles.input, validationErrors.has("fridgeRestockThreshold") && styles.inputError]}
                          placeholder="Min ready qty"
                          placeholderTextColor={colors.textFaint}
                          value={fridgeRestockThreshold}
                          onChangeText={(t) => setFridgeRestockThreshold(sanitizeInteger(t))}
                          keyboardType="numeric"
                        />
                        <Text style={styles.helpText}>
                          Move from storage when ready qty is low
                        </Text>
                      </View>

                      <View style={[styles.field, styles.fieldHalf]}>
                        <Text style={styles.label}>Total Threshold</Text>
                        <TextInput
                          style={[styles.input, validationErrors.has("totalRestockThreshold") && styles.inputError]}
                          placeholder="Min total qty"
                          placeholderTextColor={colors.textFaint}
                          value={totalRestockThreshold}
                          onChangeText={(t) => setTotalRestockThreshold(sanitizeInteger(t))}
                          keyboardType="numeric"
                        />
                        <Text style={styles.helpText}>
                          Add to shopping list when total is low
                        </Text>
                      </View>
                    </View>
                  </>
                )}

                {/* Sits directly above "Usually bought from" because it is the
                    answer to the same question. Some stock is not bought when
                    it runs low — it arrives on a cadence — and for those every
                    restock signal the app can raise is a false alarm. Rendered
                    for both storage types: a delivery can land in one place or
                    several. */}
                <View style={styles.field}>
                  <View style={styles.toggleRow}>
                    <View style={styles.toggleLabel}>
                      <Text style={styles.label}>Arrives on a schedule</Text>
                      <Text style={styles.helpText}>
                        Delivered on a set cadence, so never suggest buying more
                        and don't estimate when it runs out.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.toggle, isScheduledSupply && styles.toggleActive]}
                      onPress={() => setIsScheduledSupply(!isScheduledSupply)}
                      accessibilityRole="switch"
                      accessibilityState={{ checked: isScheduledSupply }}
                      accessibilityLabel="Arrives on a schedule"
                    >
                      <View
                        style={[
                          styles.toggleThumb,
                          isScheduledSupply && styles.toggleThumbActive,
                        ]}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Preferred vendor — filed here rather than under Notes
                    (where the plan's literal text placed it): it drives the
                    quantity/vendor math this whole section already owns
                    (lowThresholdFor, the restock thresholds above, the
                    "~Nd left" forecast) and both other consumers of this
                    value (the manual add and the shopping-demand engine, see
                    lib/supabase/shopping.ts) are restock-flow code, not
                    notes. Rendered once, outside the single/multi-location
                    branches above, since it applies to both storage types. */}
                <View style={styles.field}>
                  <Text style={styles.label}>Usually bought from</Text>
                  {/* The currently-selected vendor stays in the list even if
                      it has since gone inactive — otherwise a deactivated
                      vendor has no tile AND does not match null, so nothing
                      is highlighted and the field silently reads as unset
                      even though the value is untouched. */}
                  <VendorTiles
                    vendors={vendors.filter((v) => v.is_active || v.id === preferredVendorId)}
                    selectedId={preferredVendorId}
                    onSelect={setPreferredVendorId}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Nutritional Information Section */}
          <View style={styles.section} onLayout={onSectionLayout("nutrition")}>
            <SectionHeader
              title="Nutritional Information"
              summary={nutritionSummary({
                calories: Number.parseInt(calories, 10) || null,
                servingSize: servingSize || null,
              })}
              sectionKey="nutrition"
              isExpanded={expandedSection === "nutrition"}
              hasError={validationErrors.has("calories") || validationErrors.has("protein")
                || validationErrors.has("carbs") || validationErrors.has("fats")
                || validationErrors.has("sugars") || validationErrors.has("fiber")}
              onPress={() => toggleSection("nutrition")}
            />

            {expandedSection === "nutrition" && (
              <View style={styles.sectionContent}>
                {/* The app already reads groceries off a photograph; a panel
                    is an easier read than a shelf. Typing six numbers off the
                    back of a packet is the clearest waste on this form. */}
                <TouchableOpacity
                  style={styles.scanAssist}
                  onPress={scanNutritionLabel}
                  disabled={scanningLabel}
                  accessibilityRole="button"
                  accessibilityLabel="Photograph the nutrition panel"
                >
                  <Text style={styles.hintText}>
                    {scanningLabel
                      ? "Reading the panel…"
                      : "Photograph the panel and I'll fill these in"}
                  </Text>
                  <Text style={styles.hintAction}>{scanningLabel ? "" : "Scan"}</Text>
                </TouchableOpacity>

                <View style={styles.row}>
                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Calories</Text>
                    <TextInput
                      style={[styles.input, validationErrors.has("calories") && styles.inputError]}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      value={calories}
                      onChangeText={(t) => setCalories(sanitizeInteger(t))}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Serving Size</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="e.g., 1 cup"
                      placeholderTextColor={colors.textFaint}
                      value={servingSize}
                      onChangeText={setServingSize}
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Protein (g)</Text>
                    <TextInput
                      style={[styles.input, validationErrors.has("protein") && styles.inputError]}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      value={protein}
                      onChangeText={(t) => setProtein(sanitizeDecimal(t))}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Carbs (g)</Text>
                    <TextInput
                      style={[styles.input, validationErrors.has("carbs") && styles.inputError]}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      value={carbs}
                      onChangeText={(t) => setCarbs(sanitizeDecimal(t))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Fats (g)</Text>
                    <TextInput
                      style={[styles.input, validationErrors.has("fats") && styles.inputError]}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      value={fats}
                      onChangeText={(t) => setFats(sanitizeDecimal(t))}
                      keyboardType="decimal-pad"
                    />
                  </View>

                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Sugars (g)</Text>
                    <TextInput
                      style={[styles.input, validationErrors.has("sugars") && styles.inputError]}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      value={sugars}
                      onChangeText={(t) => setSugars(sanitizeDecimal(t))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>

                <View style={styles.row}>
                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Fiber (g)</Text>
                    <TextInput
                      style={[styles.input, validationErrors.has("fiber") && styles.inputError]}
                      placeholder="0"
                      placeholderTextColor={colors.textFaint}
                      value={fiber}
                      onChangeText={(t) => setFiber(sanitizeDecimal(t))}
                      keyboardType="decimal-pad"
                    />
                  </View>
                  {/* Five macro fields do not divide into pairs. An empty half
                      keeps Fiber the same width as every other input rather
                      than letting it stretch across the row on its own. */}
                  <View style={[styles.field, styles.fieldHalf]} />
                </View>

                {/* What the numbers become downstream: the panel on the item
                    page, the total standing in your kitchen, and the share of
                    a day. None of that is obvious from six input boxes. */}
                {Number.parseInt(calories, 10) > 0 && (
                  <Text style={styles.previewText}>
                    {Number.parseInt(calories, 10)} kcal a serving
                    {(Number.parseInt(quantity, 10) || 0) > 1
                      ? ` · ${(Number.parseInt(calories, 10) * (Number.parseInt(quantity, 10) || 0)).toLocaleString()} kcal across your ${Number.parseInt(quantity, 10)}`
                      : ""}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* Expiration Section */}
          <View style={styles.section} onLayout={onSectionLayout("expiration")}>
            <SectionHeader
              title="Expiration"
              summary={expirySummary(
                expirationDate ? expirationDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : null,
                daysUntilExpiry,
              )}
              sectionKey="expiration"
              isExpanded={expandedSection === "expiration"}
              hasError={false}
              onPress={() => toggleSection("expiration")}
            />

            {expandedSection === "expiration" && (
              <View style={styles.sectionContent}>
                <View style={styles.field}>
                  <Text style={styles.label}>Expiration Date</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Text style={[styles.pickerButtonText, !expirationDate && styles.placeholder]}>
                      {expirationDate
                        ? expirationDate.toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })
                        : "Select date"}
                    </Text>
                  </TouchableOpacity>
                  {/* Most dates are "about N from now", and a calendar picker
                      makes you count. These are the common spans, measured
                      from today rather than from whatever is already set — a
                      relative nudge off a stale date compounds the staleness. */}
                  <View style={styles.quickDates}>
                    {([
                      { label: "＋1 week", days: 7 },
                      { label: "＋1 month", days: 30 },
                      { label: "＋6 months", days: 182 },
                      { label: "＋1 year", days: 365 },
                    ] as const).map((q) => (
                      <TouchableOpacity
                        key={q.label}
                        style={styles.quickDate}
                        onPress={() => {
                          const d = new Date();
                          d.setHours(12, 0, 0, 0);
                          d.setDate(d.getDate() + q.days);
                          setExpirationDate(d);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel={`Expires ${q.label.replace("＋", "in ")}`}
                      >
                        <Text style={styles.quickDateText}>{q.label}</Text>
                      </TouchableOpacity>
                    ))}
                    {expirationDate && (
                      <TouchableOpacity
                        style={styles.quickDate}
                        onPress={() => setExpirationDate(null)}
                        accessibilityRole="button"
                        accessibilityLabel="No expiration date"
                      >
                        <Text style={styles.quickDateText}>No date</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* E4: the category's typical shelf life, offered rather than
                      assumed — a fabricated date would flow into the aging
                      bands as if a human had read it off the packet. */}
                  {!expirationDate && shelfLifeHint !== null && (
                    <TouchableOpacity
                      style={styles.hintRow}
                      onPress={() => {
                        const d = new Date();
                        d.setHours(12, 0, 0, 0);
                        d.setDate(d.getDate() + shelfLifeHint);
                        setExpirationDate(d);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use the typical shelf life of ${shelfLifeHint} days`}
                    >
                      <Text style={styles.hintText}>
                        This kind of food usually keeps about {shelfLifeHint} days
                      </Text>
                      <Text style={styles.hintAction}>Use</Text>
                    </TouchableOpacity>
                  )}

                  {/* What the date will actually DO — the part nobody can work
                      out from a calendar date alone. */}
                  {expirationDate && daysUntilExpiry !== null && (
                    <Text style={styles.previewText}>
                      Shows as {daysUntilExpiry < 0 ? "expired" : "fresh"} ·{" "}
                      {relativeDays(daysUntilExpiry)}
                    </Text>
                  )}
                </View>
              </View>
            )}
          </View>

          {/* Notes Section */}
          <View style={styles.section} onLayout={onSectionLayout("notes")}>
            <SectionHeader
              title="Notes"
              summary={notesSummary(notes)}
              sectionKey="notes"
              isExpanded={expandedSection === "notes"}
              hasError={false}
              onPress={() => toggleSection("notes")}
            />

            {expandedSection === "notes" && (
              <View style={styles.sectionContent}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Anything worth remembering — how you like it cooked, who it's for, whether to buy it again."
                  placeholderTextColor={colors.textFaint}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            )}
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          <View style={styles.footerButton}>
            <Button label="Cancel" onPress={handleCancel} variant="secondary" disabled={saving} fluid />
          </View>
          <View style={styles.footerButton}>
            {/* Inert until something actually moved. A new item is dirty by
                definition — there is nothing yet to compare it against. */}
            <Button
              label="Save"
              onPress={handleSave}
              loading={saving}
              disabled={saving || (!isNew && !isDirty)}
              fluid
            />
          </View>
        </View>

        {/* Unit Picker Modal */}
        <Modal visible={showUnitPicker} transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Select Unit</Text>
              <ScrollView>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={styles.pickerOption}
                    onPress={() => {
                      setUnit(u);
                      setShowUnitPicker(false);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.pickerClose} onPress={() => setShowUnitPicker(false)}>
                <Text style={styles.pickerCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        <CategoryPickerSheet
          visible={showCategoryPicker}
          categories={categories}
          subcategories={subcategories}
          selectedCategoryIds={selectedCategoryIds}
          selectedSubcategoryIds={selectedSubcategoryIds}
          onToggleCategory={toggleCategorySelection}
          onToggleSubcategory={toggleSubcategorySelection}
          onClose={() => setShowCategoryPicker(false)}
        />

        {/* Barcode Scanner Modal */}
        <BarcodeScannerModal
          visible={showBarcodeScanner}
          onClose={() => setShowBarcodeScanner(false)}
          onBarcodeScanned={handleBarcodeScanned}
        />

        {/* Date Picker Modal */}
        {showDatePicker && Platform.OS === "ios" && (
          <Modal transparent visible={showDatePicker} animationType="fade">
            <TouchableOpacity
              style={styles.datePickerModal}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            >
              <View style={styles.datePickerModalContent}>
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>Expiration Date</Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={expirationDate || new Date()}
                  mode="date"
                  display="spinner"
                  textColor={colors.text}
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      setExpirationDate(selectedDate);
                    }
                  }}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Android Date Picker */}
        {showDatePicker && Platform.OS === "android" && (
          <DateTimePicker
            value={expirationDate || new Date()}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) {
                setExpirationDate(selectedDate);
              }
            }}
          />
        )}
      </View>
    </>
  );
}
