// mobile/src/components/track/meals/library/MealBuilder.tsx
//
// Making and changing a meal.
//
// The form used to be a stack of unlabelled chip rows over a list of ingredient
// names, with the live score — the thing nearly every field on the page moves —
// parked below all of them, and Save below that. Three of a meal's own
// properties (where it comes from, what to call that place, whether it is one
// finished portion) had no control at all and survived an edit only because the
// save passed them through untouched.
//
// The list of ingredients IS the page now: a draggable list whose header and
// footer are the rest of the form. Not a layout preference — ingredient order
// decides which photograph becomes the meal's face, and a plain ScrollView
// cannot hold a draggable list without nesting two scrollers.
import React, {
  forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState,
} from "react";
import {
  Alert, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View,
} from "react-native";
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from "react-native-draggable-flatlist";
import { Swipeable } from "react-native-gesture-handler";
import * as ImagePicker from "expo-image-picker";
import { Camera, Images, ImageOff, Link2, Plus, ScanBarcode, Store, Trash2 } from "lucide-react-native";
import type { FoodConcept, ConceptRating } from "@/src/types/nutrition-preferences";
import type { MealCategory, MealRole, MealWithItems } from "@/src/types/meal-library";
import { MEAL_TYPE_LABELS, ROLE_LABELS, ROLE_ORDER, toggleCategory, toggleRole } from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";
import { computeBrianScore } from "@/src/lib/mealScore";
import {
  DEFAULT_PREP_MINUTES, SERVING_STEP, clampServings, parsePrepMinutes, snapServings,
} from "@/src/lib/mealBuilderInputs";
import { suggestConcepts } from "@/src/lib/conceptMatch";
import { mealIngredients, type IngredientInventoryRow, type MealIngredient } from "@/src/lib/mealLibraryView";
import { mealFaceUrl } from "@/src/lib/mealFace";
import { caloriesLabel, isGenericProduct, stockedProductIds } from "@/src/lib/productKind";
import { uploadImage } from "@/src/lib/imageUpload";
import type { MealInput, MealItemInput, SourceSuggestion } from "@/src/lib/supabase/mealLibrary";
import { colors, elevation, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge } from "@/src/components/ui";
import { ItemActionsSheet, type ItemAction } from "@/src/components/track/ItemActionsSheet";
import { CategoryRail } from "./CategoryRail";
import { NewFoodSheet } from "./NewFoodSheet";
import { scoreTone } from "./styles";
import { monogram } from "@/src/lib/vendorMonogram";

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

/** Said the way you'd say it. The stored values ("love", "neutral") were on
 *  screen as themselves — the only enum in the app that never got a label. */
const TASTE_LABELS: Record<ConceptRating, string> = {
  love: "Love it",
  like: "Like it",
  neutral: "It's fine",
  dislike: "Dislike",
  never: "Never again",
};
const RATINGS: ConceptRating[] = ["love", "like", "neutral", "dislike", "never"];

const SOURCE_KINDS: Array<{ kind: MealWithItems["source_kind"]; label: string }> = [
  { kind: "home", label: "You made it" },
  { kind: "packaged", label: "You stock it" },
  { kind: "out", label: "You order it" },
];

/** Covers every real answer without a keyboard. "Other" opens the field for the
 *  rare meal that genuinely takes forty minutes. */
const PREP_PRESETS = [0, 2, 5, 15] as const;
const PREP_MINUTES_MAX_LENGTH = 4;

interface BuilderItem extends MealItemInput {
  savedFood: SavedFood;
}

export interface MealBuilderHandle {
  /** Validate and hand the input up. Called by the page's header Save. */
  save: () => void;
  /** Whether anything has changed since the form opened. */
  isDirty: () => boolean;
}

interface MealBuilderProps {
  /** null = create */
  initial: MealWithItems | null;
  savedFoods: SavedFood[];
  conceptsById: Map<string, FoodConcept>;
  conceptIdsBySavedFoodId: Map<string, string[]>;
  /** Optional: omit to render no stock state on the rows at all. */
  inventory?: IngredientInventoryRow[];
  /** Places a meal can come from — your vendors, plus any source already in
   *  use. Offered under the vendor field so the name maps back to a real one. */
  sourceSuggestions?: SourceSuggestion[];
  saving: boolean;
  onSave: (input: MealInput) => void;
  onQuickLink: (savedFoodId: string, conceptId: string) => void;
  /** Create a food that doesn't exist yet and return it, so it can be added
   *  here rather than by leaving the form and losing every edit. */
  onCreateFood: (food: {
    name: string; calories: number | null; protein: number | null; barcode: string | null;
  }) => Promise<SavedFood | null>;
  /** Raise the scanner and resolve with what it read, or null. */
  onScan?: () => Promise<string | null>;
}

export const MealBuilder = forwardRef<MealBuilderHandle, MealBuilderProps>(
  function MealBuilder({
    initial, savedFoods, conceptsById, conceptIdsBySavedFoodId, inventory,
    sourceSuggestions = [], saving, onSave, onQuickLink, onCreateFood, onScan,
  }, ref) {
    const [name, setName] = useState(initial?.name ?? "");
    const [nameTouched, setNameTouched] = useState(false);
    const [photo, setPhoto] = useState<string | null>(initial?.image_primary_url ?? null);
    // A SET, not one value. Writing a single category from here silently
    // refiled a meal that had been put on two shelves.
    const [categories, setCategories] = useState<MealCategory[]>(initial?.categories ?? ["lunch"]);
    const [defaultMealType, setDefaultMealType] = useState<MealType | null>(
      initial?.default_meal_type ?? null,
    );
    const [sourceKind, setSourceKind] = useState<MealWithItems["source_kind"]>(
      initial?.source_kind ?? "home",
    );
    const [sourceName, setSourceName] = useState(initial?.source_name ?? "");
    const [completePortion, setCompletePortion] = useState(initial?.is_complete_portion ?? false);
    // A SET, like categories. A shake that is genuinely the post-workout meal
    // AND the calorie booster had to pick one, and was then invisible to the
    // other question. `initial.role` is deliberately not consulted as a
    // fallback: it is a mirror of the set, so an empty set means no roles.
    const [roles, setRoles] = useState<MealRole[]>(initial?.roles ?? []);
    const [prepMinutes, setPrepMinutes] = useState(String(initial?.prep_minutes ?? DEFAULT_PREP_MINUTES));
    const [prepFreeform, setPrepFreeform] = useState(
      !(PREP_PRESETS as readonly number[]).includes(initial?.prep_minutes ?? DEFAULT_PREP_MINUTES),
    );
    const [tasteOverride, setTasteOverride] = useState<ConceptRating | null>(initial?.taste_override ?? null);
    const [notes, setNotes] = useState(initial?.notes ?? "");
    const [items, setItems] = useState<BuilderItem[]>(
      initial?.items.map((it) => ({
        saved_food_id: it.saved_food_id,
        servings: it.servings,
        small_pieces_ok: it.small_pieces_ok,
        savedFood: it.savedFood,
      })) ?? [],
    );
    const [search, setSearch] = useState("");
    const [sourceFocused, setSourceFocused] = useState(false);
    const [newFood, setNewFood] = useState<{ name: string; barcode: string | null } | null>(null);
    const [creatingFood, setCreatingFood] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [photoMenuOpen, setPhotoMenuOpen] = useState(false);

    const conceptsFor = useCallback(
      (savedFoodId: string): FoodConcept[] =>
        (conceptIdsBySavedFoodId.get(savedFoodId) ?? [])
          .map((id) => conceptsById.get(id))
          .filter((c): c is FoodConcept => !!c),
      [conceptIdsBySavedFoodId, conceptsById],
    );

    // null = the field is blank (or not a number), which is NOT the same as 0.
    const enteredPrep = parsePrepMinutes(prepMinutes);
    const prep = enteredPrep ?? DEFAULT_PREP_MINUTES;

    const scoreOf = useCallback(
      (
        forItems: BuilderItem[],
        forPrep: number,
        forRoles: readonly MealRole[],
        forTaste: ConceptRating | null,
      ) =>
        computeBrianScore({
          prepMinutes: forPrep,
          roles: forRoles,
          tasteOverride: forTaste,
          items: forItems.map((it) => ({
            calories: it.savedFood.calories,
            protein: it.savedFood.protein,
            servings: it.servings,
            smallPiecesOk: it.small_pieces_ok,
            concepts: conceptsFor(it.saved_food_id).map((c) => ({
              rating: c.rating,
              requiresSmallPieces: c.requires_small_pieces,
              prepIntensive: c.prep_intensive,
            })),
          })),
        }),
      [conceptsFor],
    );

    const score = useMemo(
      () => scoreOf(items, prep, roles, tasteOverride),
      [scoreOf, items, prep, roles, tasteOverride],
    );

    // What the meal scored when the form opened, so the bar can say what THIS
    // sitting has done to it. Computed from the same function rather than read
    // from a stored number, so a change to scoring can't make the delta lie.
    const openedAtScore = useRef<number | null>(null);
    if (openedAtScore.current === null) {
      openedAtScore.current = initial
        ? scoreOf(
            initial.items.map((it) => ({
              saved_food_id: it.saved_food_id,
              servings: it.servings,
              small_pieces_ok: it.small_pieces_ok,
              savedFood: it.savedFood,
            })),
            initial.prep_minutes,
            initial.roles ?? [],
            initial.taste_override,
          ).score
        : score.score;
    }
    const delta = score.score - (openedAtScore.current ?? score.score);

    /** Per-row stock, from the same predicate the meal page and the shelves
     *  use — so an ingredient cannot read in stock here and missing there. */
    const rowState = useMemo(() => {
      if (!inventory) return new Map<string, MealIngredient["state"]>();
      const rows = mealIngredients({
        items: items.map((it, idx) => ({
          id: it.saved_food_id,
          user_id: "",
          meal_id: "",
          saved_food_id: it.saved_food_id,
          servings: it.servings,
          display_order: idx,
          small_pieces_ok: it.small_pieces_ok,
          created_at: "",
          savedFood: it.savedFood,
        })),
        inventory,
        conceptIdsBySavedFoodId,
      });
      return new Map(rows.map((r) => [r.item.saved_food_id, r.state]));
    }, [inventory, items, conceptIdsBySavedFoodId]);

    /** Products some package on the shelf names, empty rows included. Built
     *  once from the whole inventory rather than per row, because the question
     *  "is anything on record a package of this?" is asked of every search
     *  result on every keystroke. */
    const stocked = useMemo(() => stockedProductIds(inventory ?? []), [inventory]);
    /** A stand-in rather than something you buy — its calories are a reference
     *  figure, so they are shown with a tilde wherever they appear. */
    const isGeneric = useCallback(
      (f: SavedFood) => isGenericProduct(f, stocked),
      [stocked],
    );

    // The first item WITH a photograph is the meal's face — unless the meal has
    // one of its own, in which case order decides nothing about the picture.
    const faceItemId = items.find((it) => it.savedFood.image_primary_url)?.saved_food_id ?? null;

    // What the meal looks like RIGHT NOW: its own photograph, or the one it is
    // borrowing. An empty well beside "without one, the meal keeps borrowing
    // the first ingredient's" showed nothing of the picture it was describing.
    const borrowedFace = useMemo(
      () => mealFaceUrl(items.map((it, idx) => ({
        displayOrder: idx,
        imageUrl: it.savedFood.image_primary_url,
        calories: (it.savedFood.calories ?? 0) * it.servings,
      }))),
      [items],
    );
    const shownFace = photo ?? borrowedFace;
    // A one-item meal IS its ingredient — a Thistle dish and the packet of it
    // are the same object, so the product shot is already a picture of the
    // meal. Only a meal assembled from several things is borrowing, and only
    // that case is worth dimming or offering to replace: a PB&J showing a jar
    // of peanut butter is not a picture of a sandwich.
    const borrowing = photo === null && borrowedFace !== null && items.length > 1;

    const results = useMemo(() => {
      const q = search.trim().toLowerCase();
      if (!q) return [];
      const chosen = new Set(items.map((it) => it.saved_food_id));
      return savedFoods
        .filter((f) => !chosen.has(f.id) && f.name.toLowerCase().includes(q))
        .slice(0, 8);
    }, [search, savedFoods, items]);

    /** Whether each search result is in the kitchen. Choosing between two
     *  cashew products is easier when one of them is in stock, and the answer
     *  comes from the same resolver the rows above use. */
    const resultStock = useMemo(() => {
      if (!inventory || results.length === 0) return new Map<string, boolean>();
      const rows = mealIngredients({
        items: results.map((f, idx) => ({
          id: f.id,
          user_id: "",
          meal_id: "",
          saved_food_id: f.id,
          servings: 1,
          display_order: idx,
          small_pieces_ok: false,
          created_at: "",
          savedFood: f,
        })),
        inventory,
        conceptIdsBySavedFoodId,
      });
      return new Map(
        rows.map((r) => [r.item.saved_food_id, r.state.kind === "in_stock" || r.state.kind === "expiring"]),
      );
    }, [inventory, results, conceptIdsBySavedFoodId]);

    /** Whole list while the field is empty, narrowed as you type. An exact
     *  match is dropped: the list would be offering what is already there. */
    const sourceMatches = useMemo(() => {
      const q = sourceName.trim().toLowerCase();
      if (q !== "" && sourceSuggestions.some((v) => v.name.toLowerCase() === q)) return [];
      return sourceSuggestions
        .filter((v) => q === "" || v.name.toLowerCase().includes(q))
        .slice(0, 6);
    }, [sourceName, sourceSuggestions]);

    const addItem = useCallback((f: SavedFood) => {
      setItems((prev) => [
        ...prev,
        { saved_food_id: f.id, servings: 1, small_pieces_ok: false, savedFood: f },
      ]);
      setSearch("");
    }, []);

    const setServings = (id: string, step: number) =>
      setItems((prev) =>
        prev.map((it) =>
          it.saved_food_id === id ? { ...it, servings: snapServings(it.servings, step) } : it,
        ),
      );

    // ── Photo ──────────────────────────────────────────────────────────────
    const putPhoto = async (uri: string | undefined) => {
      if (!uri) return;
      setUploading(true);
      // Uploaded now rather than on save: the URL is what gets stored, and a
      // form holding a local file URI would write a path that exists only on
      // this phone if the save happened to beat the upload.
      const url = await uploadImage(uri, "meal");
      setUploading(false);
      if (!url) {
        Alert.alert("Couldn't upload that", "The photo didn't save — try again.");
        return;
      }
      setPhoto(url);
    };

    const pickPhoto = async (fromCamera: boolean) => {
      const opts: ImagePicker.ImagePickerOptions = {
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.7,
        allowsEditing: true,
      };
      try {
        if (fromCamera) {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) throw new Error("camera permission not granted");
          const shot = await ImagePicker.launchCameraAsync(opts);
          if (shot.canceled) return;
          await putPhoto(shot.assets[0]?.uri);
          return;
        }
        const picked = await ImagePicker.launchImageLibraryAsync(opts);
        if (picked.canceled) return;
        await putPhoto(picked.assets[0]?.uri);
      } catch {
        // The camera is absent on a simulator and `launchCameraAsync` REJECTS
        // rather than returning a canceled result, so the library is the honest
        // fallback rather than a red console error.
        const picked = await ImagePicker.launchImageLibraryAsync(opts).catch(() => null);
        if (!picked || picked.canceled) return;
        await putPhoto(picked.assets[0]?.uri);
      }
    };

    // The house sheet, not `Alert`: the system menu renders light chrome over a
    // dark app and cannot be themed — the same reason the inventory long-press
    // menu was replaced.
    const photoActions = (): ItemAction[] => [
      { label: "Take a photo", icon: Camera, onPress: () => void pickPhoto(true) },
      { label: "Choose from library", icon: Images, onPress: () => void pickPhoto(false) },
      // Not "remove": clearing it falls back to the borrowed ingredient
      // picture, which is what the meal had before and never leaves it
      // faceless.
      ...(photo
        ? [{ label: "Use an ingredient's photo", icon: ImageOff, onPress: () => setPhoto(null) }]
        : []),
    ];

    // ── Adding foods ───────────────────────────────────────────────────────
    const handleScan = async () => {
      if (!onScan) return;
      const barcode = await onScan();
      if (!barcode) return;
      const known = savedFoods.find((f) => f.barcode === barcode);
      if (known) {
        if (items.some((it) => it.saved_food_id === known.id)) {
          Alert.alert("Already in this meal", known.name);
          return;
        }
        addItem(known);
        return;
      }
      // Nothing matched, so the scan becomes the start of a new food rather
      // than a dead end holding a number nobody can read.
      setNewFood({ name: search.trim(), barcode });
    };

    const handleCreateFood = async (food: {
      name: string; calories: number | null; protein: number | null; barcode: string | null;
    }) => {
      setCreatingFood(true);
      const created = await onCreateFood(food);
      setCreatingFood(false);
      if (!created) return;
      setNewFood(null);
      addItem(created);
    };

    // ── Save ───────────────────────────────────────────────────────────────
    const nameError = nameTouched && name.trim() === "";
    const normalisedSourceName =
      sourceKind === "home" ? null : (sourceName.trim() || "Unnamed");

    const handleSave = useCallback(() => {
      if (!name.trim()) {
        setNameTouched(true);
        Alert.alert("Missing name", "Give the meal a name first.");
        return;
      }
      if (items.length === 0) {
        // The generic line sent an ordered dish's owner hunting for groceries
        // it will never have. Point at the row that solves it instead.
        Alert.alert(
          "No ingredients",
          sourceKind === "out"
            ? "An ordered dish is its own ingredient — add it with the one-tap row in the ingredients card."
            : "Add at least one saved food.",
        );
        return;
      }
      onSave({
        name: name.trim(),
        // Head of the set: the primary, which is what the default logging slot
        // reads and what `set_meal_categories` keeps.
        category: categories[0],
        categories,
        roles,
        default_meal_type: defaultMealType,
        prep_minutes: prep,
        taste_override: tasteOverride,
        source_kind: sourceKind,
        // The database refuses a name on a home meal and demands one on the
        // other two, so a blank is normalised here rather than raised as a
        // constraint violation at the very end of the form.
        source_name: normalisedSourceName,
        is_complete_portion: completePortion,
        image_primary_url: photo,
        notes: notes.trim() || null,
        // Carried through unchanged: the builder has no tag UI (drinks are
        // saved from the log sheet), and dropping them on edit would strip a
        // beverage of what it is.
        beverage_kinds: initial?.beverage_kinds ?? null,
        // Clamped here as well as in the stepper: an item seeded from
        // `initial.items` above MAX_SERVINGS would otherwise be re-saved
        // unclamped if the user never tapped ±, and the whole point of the cap
        // is that `meal_logs.servings` (numeric(4,2)) cannot fail at log time.
        items: items.map(({ savedFood: _sf, ...it }) => ({
          ...it,
          servings: clampServings(it.servings),
        })),
      });
    }, [name, items, categories, roles, defaultMealType, prep, tasteOverride,
        sourceKind, normalisedSourceName, completePortion, photo, notes, onSave]);

    const isDirty = useCallback(() => {
      if (!initial) return name.trim() !== "" || items.length > 0;
      // Compared as values, not field by field: every field on this form is in
      // here, so a new one added later cannot quietly fall out of the check.
      const before = JSON.stringify({
        n: initial.name, c: [...initial.categories].sort(), r: initial.roles ?? [],
        d: initial.default_meal_type, p: initial.prep_minutes, t: initial.taste_override,
        sk: initial.source_kind, sn: initial.source_name, cp: initial.is_complete_portion,
        img: initial.image_primary_url, no: initial.notes,
        i: initial.items.map((it) => [it.saved_food_id, it.servings, it.small_pieces_ok]),
      });
      const now = JSON.stringify({
        n: name.trim(), c: [...categories].sort(), r: roles,
        d: defaultMealType, p: prep, t: tasteOverride,
        sk: sourceKind, sn: normalisedSourceName, cp: completePortion,
        img: photo, no: notes.trim() || null,
        i: items.map((it) => [it.saved_food_id, it.servings, it.small_pieces_ok]),
      });
      return before !== now;
    }, [initial, name, categories, roles, defaultMealType, prep, tasteOverride,
        sourceKind, normalisedSourceName, completePortion, photo, notes, items]);

    useImperativeHandle(ref, () => ({ save: handleSave, isDirty }), [handleSave, isDirty]);

    // ── Rows ───────────────────────────────────────────────────────────────
    const renderItem = useCallback(
      ({ item, drag, isActive }: RenderItemParams<BuilderItem>) => {
        const concepts = conceptsFor(item.saved_food_id);
        const needsSmallPieces = concepts.some((c) => c.requires_small_pieces);
        const unlinked = concepts.length === 0;
        const suggestion = unlinked
          ? suggestConcepts(item.savedFood.name, [...conceptsById.values()])[0]
          : undefined;
        const state = rowState.get(item.saved_food_id);
        const calories = Math.round((item.savedFood.calories ?? 0) * item.servings);
        const isFace = photo === null && item.saved_food_id === faceItemId;

        const facts = [
          caloriesLabel(calories, isGeneric(item.savedFood)),
          state?.kind === "expiring"
            ? (state.daysLeft === 0 ? "expires today" : `${state.daysLeft}d left`)
            : state?.kind === "in_stock" ? "in stock"
            : state?.kind === "missing" ? "not in stock"
            : null,
          isFace ? "face of this meal" : null,
        ].filter(Boolean).join(" · ");

        return (
          <ScaleDecorator>
            <Swipeable
              // The inset belongs to the swipe container, not the row: on the
              // row it would leave the red action sitting in the page gutter
              // outside the card it is deleting from.
              containerStyle={s.swipeContainer}
              renderRightActions={() => (
                <TouchableOpacity
                  style={s.swipeDelete}
                  onPress={() =>
                    setItems((prev) => prev.filter((p) => p.saved_food_id !== item.saved_food_id))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.savedFood.name}`}
                >
                  <Trash2 size={icons.md} color={colors.onBrand} strokeWidth={icons.strokeWidth} />
                </TouchableOpacity>
              )}
            >
              <View style={[s.ingRow, isActive && s.ingRowActive]}>
                <TouchableOpacity
                  onLongPress={drag}
                  delayLongPress={150}
                  disabled={isActive}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Reorder ${item.savedFood.name}`}
                >
                  <View style={s.grip}>
                    <View style={s.gripDot} /><View style={s.gripDot} />
                    <View style={s.gripDot} /><View style={s.gripDot} />
                    <View style={s.gripDot} /><View style={s.gripDot} />
                  </View>
                </TouchableOpacity>

                <View style={s.thumb}>
                  {item.savedFood.image_primary_url ? (
                    <Image
                      source={{ uri: item.savedFood.image_primary_url }}
                      style={s.thumbImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <Text style={s.thumbText}>{monogram(item.savedFood.name)}</Text>
                  )}
                </View>

                <View style={s.ingBody}>
                  <View style={s.ingNameRow}>
                    {state && (
                      <View style={[
                        s.dot,
                        state.kind === "in_stock" ? s.dotOk
                        : state.kind === "expiring" ? s.dotSoon
                        : s.dotGone,
                      ]} />
                    )}
                    <Text style={s.ingName} numberOfLines={1}>{item.savedFood.name}</Text>
                  </View>
                  <Text style={s.ingSub} numberOfLines={1}>{facts}</Text>
                </View>

                <View style={s.stepper}>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setServings(item.saved_food_id, -SERVING_STEP)}
                    accessibilityRole="button"
                    accessibilityLabel={`One less serving of ${item.savedFood.name}`}
                  >
                    <Text style={s.stepperText}>−</Text>
                  </TouchableOpacity>
                  <Text style={s.qty}>×{item.servings}</Text>
                  <TouchableOpacity
                    style={s.stepperBtn}
                    onPress={() => setServings(item.saved_food_id, SERVING_STEP)}
                    accessibilityRole="button"
                    accessibilityLabel={`One more serving of ${item.savedFood.name}`}
                  >
                    <Text style={s.stepperText}>＋</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Swipeable>

            {needsSmallPieces && (
              <View style={s.subRow}>
                <Text style={s.subRowText}>Already in small pieces? (EoE)</Text>
                <Switch
                  value={item.small_pieces_ok}
                  onValueChange={(v) =>
                    setItems((prev) =>
                      prev.map((p) =>
                        p.saved_food_id === item.saved_food_id ? { ...p, small_pieces_ok: v } : p,
                      ),
                    )
                  }
                />
              </View>
            )}

            {/* A records gap, not an error — nothing is wrong with the meal.
                Stated as what it costs you, because "unlinked" as a label meant
                nothing to anyone who had not read the schema. */}
            {unlinked && (
              <View style={s.linkLine}>
                <Text style={s.linkText}>
                  No ingredient type yet — this meal can&apos;t be checked against your kitchen
                </Text>
                {suggestion && (
                  <TouchableOpacity
                    // The parent refetches on success, so the chip does go —
                    // but only once the round trip lands, and a second tap
                    // meanwhile violates the link's uniqueness and raises an
                    // alert for an operation that already worked.
                    style={[s.linkBtn, saving && s.dim]}
                    disabled={saving}
                    onPress={() => onQuickLink(item.saved_food_id, suggestion.conceptId)}
                    accessibilityRole="button"
                  >
                    <Link2 size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
                    <Text style={s.linkBtnText}>
                      Link to “{conceptsById.get(suggestion.conceptId)?.name}”
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </ScaleDecorator>
        );
      },
      [conceptsFor, conceptsById, rowState, photo, faceItemId, saving, onQuickLink, isGeneric],
    );

    // ── The form around the list ───────────────────────────────────────────
    const header = (
      <View style={s.section}>
        <View style={s.card}>
          <View style={s.identity}>
            <TouchableOpacity
              onPress={() => setPhotoMenuOpen(true)}
              disabled={uploading}
              style={s.face}
              accessibilityRole="button"
              accessibilityLabel="Change the meal photo"
            >
              {shownFace ? (
                <Image
                  source={{ uri: shownFace }}
                  // Dimmed only while it is genuinely borrowed, so the well
                  // shows what the meal looks like without claiming a picture
                  // of one ingredient is a picture of the dish.
                  style={[s.faceImage, borrowing && s.faceBorrowed]}
                  resizeMode="cover"
                />
              ) : (
                <Camera size={icons.lg} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
              )}
              <View style={s.faceTag}>
                {/* Says what tapping it DOES. The first version labelled the
                    state — "Borrowed" — which meant nothing to anyone who
                    hadn't read the code, and the caption beside it already
                    explains the borrowing. Dimming carries that; the tag
                    carries the verb. */}
                <Text style={s.faceTagText}>
                  {uploading ? "…" : shownFace && !borrowing ? "Change" : "Add photo"}
                </Text>
              </View>
            </TouchableOpacity>

            <View style={s.identityBody}>
              <Text style={s.label}>NAME</Text>
              <TextInput
                style={[s.input, nameError && s.inputError]}
                placeholder="Meal name (e.g. Korean Beef Bowl)"
                placeholderTextColor={colors.textFaint}
                value={name}
                onChangeText={setName}
                onBlur={() => setNameTouched(true)}
              />
              {nameError ? (
                <Text style={s.errorText}>A meal needs a name before it can be saved.</Text>
              ) : (
                <Text style={s.sub}>
                  {items.length === 1
                    ? "The ingredient's photo — which is a photo of this meal. Replace it if you'd rather use your own."
                    : "Its own photo. Without one, the meal keeps borrowing the first ingredient's."}
                </Text>
              )}
            </View>
          </View>

          <View style={s.field}>
            <Text style={s.label}>EATEN AS</Text>
            <Text style={s.sub}>
              Files the meal on each shelf, and makes it eligible in that window.
            </Text>
            <CategoryRail
              selected={categories}
              primary={categories[0]}
              onToggle={(c) => setCategories((prev) => toggleCategory(prev, c))}
            />
          </View>

          <View style={s.field}>
            <Text style={s.label}>LOGS AS, BY DEFAULT</Text>
            <View style={s.seg}>
              {MEAL_TYPES.map((t, i) => {
                const on = defaultMealType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[s.segItem, i > 0 && s.segDivider, on && s.segOn]}
                    // Tapping the chosen one clears it, which hands the slot
                    // back to the primary category's default.
                    onPress={() => setDefaultMealType(on ? null : t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>
                      {MEAL_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={s.card}>
          <Text style={s.cardTitle}>WHERE IT COMES FROM</Text>
          <View style={s.seg}>
            {SOURCE_KINDS.map((sk, i) => {
              const on = sourceKind === sk.kind;
              return (
                <TouchableOpacity
                  key={sk.kind}
                  style={[s.segItem, i > 0 && s.segDivider, on && s.segOn]}
                  onPress={() => setSourceKind(sk.kind)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{sk.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {sourceKind !== "home" && (
            <View style={s.field}>
              <TextInput
                style={s.input}
                placeholder="Thistle, DoorDash · Chipotle…"
                placeholderTextColor={colors.textFaint}
                value={sourceName}
                onChangeText={setSourceName}
                onFocus={() => setSourceFocused(true)}
                // Blur is deferred: a tap on a suggestion below blurs the field
                // first, and unmounting the list on blur would cancel the tap
                // that was aimed at it.
                onBlur={() => setTimeout(() => setSourceFocused(false), 150)}
              />
              {/* Free text still works — a one-off restaurant is a real answer
                  — but a place you already buy from should be the same string
                  every time, or the library ends up with two Thistles. */}
              {sourceFocused && sourceMatches.length > 0 && (
                <View style={s.suggestions}>
                  {sourceMatches.map((v) => (
                    <TouchableOpacity
                      key={v.name}
                      style={s.suggestion}
                      onPress={() => { setSourceName(v.name); setSourceFocused(false); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use ${v.name}`}
                    >
                      <Store
                        size={icons.sm}
                        color={v.isVendor ? colors.brand : colors.textFaint}
                        strokeWidth={icons.strokeWidth}
                      />
                      <Text style={s.suggestionName} numberOfLines={1}>{v.name}</Text>
                      {!v.isVendor && <Text style={s.suggestionTag}>used before</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <Text style={s.sub}>The brand or venue as you&apos;d say it.</Text>
            </View>
          )}
          <View style={s.switchRow}>
            <View style={s.switchBody}>
              <Text style={s.switchLabel}>Sold as one finished portion</Text>
              <Text style={s.sub}>Shifts the calorie band — its size wasn&apos;t your decision.</Text>
            </View>
            <Switch value={completePortion} onValueChange={setCompletePortion} />
          </View>
        </View>

        {/* The lid of the ingredients card. Its rows are list items rather
            than children, so the card is drawn in three parts — this, the
            rows' own side borders, and the cap at the top of the footer. */}
        <View style={s.cardTop}>
          <Text style={s.cardTitle}>INGREDIENTS · {items.length}</Text>
          <Text style={s.hint}>hold to reorder · swipe to remove</Text>
        </View>
      </View>
    );

    const footer = (
      <View style={s.section}>
        {/* The base of the ingredients card — see `cardTop`. */}
        <View style={s.cardBottom} />

        <View style={s.card}>
          {/* An ordered dish IS its only ingredient. A Thistle-style meal gets
              its product minted by the delivery flow, but a restaurant dish has
              no flow behind it, and the search below cannot find a product that
              doesn't exist yet — which read as "I can't save this meal". One
              tap mints the product from the meal's own name: the same shape as
              "keep this for next time", started from the library side. */}
          {sourceKind === "out" && items.length === 0 && name.trim() !== "" && (
            <TouchableOpacity
              style={s.result}
              onPress={() => setNewFood({ name: name.trim(), barcode: null })}
              accessibilityRole="button"
            >
              <Plus size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
              <Text style={s.resultAction} numberOfLines={1}>
                Add “{name.trim()}” — the dish is the ingredient
              </Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={s.input}
            placeholder="Search saved foods to add…"
            placeholderTextColor={colors.textFaint}
            value={search}
            onChangeText={setSearch}
          />
          {results.map((f) => {
            const generic = isGeneric(f);
            return (
              <TouchableOpacity key={f.id} style={s.result} onPress={() => addItem(f)}>
                <Plus size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
                <Text style={s.resultName} numberOfLines={1}>{f.name}</Text>
                <Text style={s.resultMeta}>
                  {[f.calories != null ? caloriesLabel(f.calories, generic) : null,
                    resultStock.get(f.id) ? "in stock" : null]
                    .filter(Boolean).join(" · ")}
                </Text>
              </TouchableOpacity>
            );
          })}
          {/* Said once under the list rather than as a chip on every row: the
              tilde is the whole signal, and a word repeated beside it would
              cost more width than it explains. Withheld when nothing in view
              carries one, so it reads as a note about what you can see. */}
          {results.some(isGeneric) && (
            <Text style={s.hint}>
              ~ is a reference figure. Real stock replaces it when you have some.
            </Text>
          )}
          {onScan && (
            <TouchableOpacity style={s.result} onPress={() => void handleScan()}>
              <ScanBarcode size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
              <Text style={s.resultAction}>Scan a barcode</Text>
            </TouchableOpacity>
          )}
          {search.trim() !== "" && (
            <TouchableOpacity
              style={s.result}
              onPress={() => setNewFood({ name: search.trim(), barcode: null })}
            >
              <Plus size={icons.sm} color={colors.brand} strokeWidth={icons.strokeWidth} />
              <Text style={s.resultAction}>Create “{search.trim()}” as a new product</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={s.card}>
          <View style={s.field}>
            <Text style={s.label}>PREP TIME</Text>
            <View style={s.seg}>
              {PREP_PRESETS.map((m, i) => {
                const on = !prepFreeform && prep === m;
                return (
                  <TouchableOpacity
                    key={m}
                    style={[s.segItem, i > 0 && s.segDivider, on && s.segOn]}
                    onPress={() => { setPrepFreeform(false); setPrepMinutes(String(m)); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.segText, on && s.segTextOn]}>
                      {m === 0 ? "None" : `${m} min`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[s.segItem, s.segDivider, prepFreeform && s.segOn]}
                onPress={() => setPrepFreeform(true)}
                accessibilityRole="button"
                accessibilityState={{ selected: prepFreeform }}
              >
                <Text style={[s.segText, prepFreeform && s.segTextOn]}>Other</Text>
              </TouchableOpacity>
            </View>
            {prepFreeform && (
              <TextInput
                style={s.input}
                keyboardType="number-pad"
                maxLength={PREP_MINUTES_MAX_LENGTH}
                value={prepMinutes}
                onChangeText={setPrepMinutes}
                placeholder="Minutes"
                placeholderTextColor={colors.textFaint}
              />
            )}
            <Text style={s.sub}>Convenience is a quarter of the score.</Text>
            {prepFreeform && enteredPrep === null && (
              <Text style={s.errorText}>
                That isn&apos;t a whole number of minutes — it will save as{" "}
                {DEFAULT_PREP_MINUTES}.
              </Text>
            )}
          </View>

          <View style={s.field}>
            <Text style={s.label}>ROLE <Text style={s.optional}>optional</Text></Text>
            <Text style={s.sub}>
              Makes the meal eligible when the app is looking for that specific
              job. Pick as many as it can do.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.chipScroller}
              contentContainerStyle={s.chipRow}
            >
              {ROLE_ORDER.map((r) => {
                const on = roles.includes(r);
                return (
                  <TouchableOpacity
                    key={r}
                    style={[s.chip, on && s.chipOn]}
                    onPress={() => setRoles((prev) => toggleRole(prev, r))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{ROLE_LABELS[r]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={s.field}>
            <Text style={s.label}>HOW IT TASTES <Text style={s.optional}>optional</Text></Text>
            <Text style={s.sub}>
              Overrides what the ingredients&apos; ratings would say about the whole meal.
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.chipScroller}
              contentContainerStyle={s.chipRow}
            >
              {RATINGS.map((r) => {
                const on = tasteOverride === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={[s.chip, on && s.chipOn]}
                    onPress={() => setTasteOverride((prev) => (prev === r ? null : r))}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{TASTE_LABELS[r]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          <View style={s.field}>
            <Text style={s.label}>NOTES <Text style={s.optional}>optional</Text></Text>
            <TextInput
              style={[s.input, s.notesInput]}
              placeholder="Anything you want to remember about making it…"
              placeholderTextColor={colors.textFaint}
              value={notes}
              onChangeText={setNotes}
              multiline
            />
          </View>
        </View>

        {/* Clears the sticky bar, which floats over the end of the list. */}
        <View style={s.tail} />
      </View>
    );

    return (
      <View style={s.root}>
        <DraggableFlatList
          data={items}
          keyExtractor={(it) => it.saved_food_id}
          onDragEnd={({ data }) => setItems(data)}
          renderItem={renderItem}
          ListHeaderComponent={header}
          ListFooterComponent={footer}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={s.listContent}
        />

        {/* Follows you down the page: nearly every field above moves it, and it
            used to sit below all of them. */}
        <View style={s.scoreBar}>
          <Text style={s.scoreNum}>{score.score}</Text>
          {delta !== 0 && (
            <Text style={[s.delta, delta > 0 ? s.deltaUp : s.deltaDown]}>
              {delta > 0 ? `+${delta}` : delta}
            </Text>
          )}
          {score.approved && <Badge label="Approved" tone={scoreTone(score.score)} />}
          <Text style={s.scoreMacros}>
            {Math.round(score.totalCalories)} cal · {Math.round(score.totalProtein)}g P
          </Text>
        </View>

        <ItemActionsSheet
          visible={photoMenuOpen}
          title="Meal photo"
          actions={photoActions()}
          onClose={() => setPhotoMenuOpen(false)}
        />

        <NewFoodSheet
          visible={newFood !== null}
          initialName={newFood?.name ?? ""}
          initialBarcode={newFood?.barcode ?? null}
          saving={creatingFood}
          onCancel={() => setNewFood(null)}
          onCreate={(food) => void handleCreateFood(food)}
        />
      </View>
    );
  },
);

const s = StyleSheet.create({
  root: { flex: 1 },
  listContent: { paddingBottom: spacing.xl },
  section: { paddingHorizontal: spacing.screenGutter, gap: spacing.md, paddingTop: spacing.md },
  // The ingredients card, drawn around list items: a lid, the rows' own side
  // borders, and a base. `marginBottom: -spacing.md` cancels the section gap so
  // the lid meets the first row.
  cardTop: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.surface,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border,
    borderTopLeftRadius: radii.row, borderTopRightRadius: radii.row,
    padding: spacing.md,
    marginBottom: -spacing.md,
  },
  cardBottom: {
    height: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1, borderTopWidth: 0, borderColor: colors.border,
    borderBottomLeftRadius: radii.row, borderBottomRightRadius: radii.row,
    marginTop: -spacing.md,
  },

  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.row,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTitle: { ...typography.caption, color: colors.textMuted, fontWeight: "700" },
  hint: { ...typography.caption, color: colors.textFaint },

  identity: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  face: {
    width: 68, height: 68, borderRadius: radii.row, overflow: "hidden",
    backgroundColor: colors.surface2,
    alignItems: "center", justifyContent: "center",
  },
  faceImage: { width: "100%", height: "100%" },
  faceBorrowed: { opacity: 0.55 },
  faceTag: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    backgroundColor: tint(colors.bg, 0.72), paddingVertical: 2,
  },
  faceTagText: { ...typography.caption, color: colors.text, textAlign: "center", fontSize: 10 },
  identityBody: { flex: 1, minWidth: 0, gap: spacing.xs },

  field: { gap: spacing.xs },
  label: { ...typography.caption, color: colors.textMuted, fontWeight: "700" },
  optional: { color: colors.textFaint, fontWeight: "500" },
  sub: { ...typography.caption, color: colors.textFaint },
  errorText: { ...typography.caption, color: colors.danger, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
  },
  inputError: { borderColor: colors.danger },
  suggestions: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    backgroundColor: colors.surface2, overflow: "hidden",
  },
  suggestion: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  suggestionName: { ...typography.body, color: colors.text, flex: 1, minWidth: 0 },
  suggestionTag: { ...typography.caption, color: colors.textFaint },
  notesInput: { minHeight: 66, textAlignVertical: "top" },

  seg: {
    flexDirection: "row",
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    overflow: "hidden",
  },
  segItem: {
    flex: 1, alignItems: "center", justifyContent: "center",
    paddingVertical: spacing.sm, paddingHorizontal: 2,
  },
  segDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  segOn: { backgroundColor: tint(colors.brand) },
  segText: { ...typography.caption, color: colors.textMuted },
  segTextOn: { color: colors.brand, fontWeight: "700" },

  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchBody: { flex: 1, gap: 2 },
  switchLabel: { ...typography.body, color: colors.text },

  // Scrolls rather than wraps, so a card's height doesn't depend on how many
  // options happen to fit the width — the same reason the category rail does.
  chipScroller: { flexGrow: 0 },
  chipRow: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.md },
  chip: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  chipOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  chipText: { ...typography.body, color: colors.textMuted },
  chipTextOn: { color: colors.brand, fontWeight: "600" },

  swipeContainer: { marginHorizontal: spacing.screenGutter },
  ingRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
  },
  // Lifted while dragging, which is the one moment a row is outside the card.
  ingRowActive: { backgroundColor: colors.surface2 },
  grip: { width: 14, flexDirection: "row", flexWrap: "wrap", gap: 3 },
  gripDot: { width: 3, height: 3, borderRadius: radii.pill, backgroundColor: colors.textFaint },
  thumb: {
    width: 40, height: 40, borderRadius: radii.control, overflow: "hidden",
    backgroundColor: colors.imageWell, alignItems: "center", justifyContent: "center",
  },
  thumbImage: { width: "100%", height: "100%" },
  thumbText: { ...typography.caption, fontWeight: "700", color: colors.textFaint },
  ingBody: { flex: 1, minWidth: 0, gap: 2 },
  ingNameRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  ingName: { ...typography.body, color: colors.text, flexShrink: 1 },
  ingSub: { ...typography.caption, color: colors.textFaint },
  dot: { width: 7, height: 7, borderRadius: radii.pill },
  dotOk: { backgroundColor: colors.brand },
  dotSoon: { backgroundColor: colors.warning },
  dotGone: { backgroundColor: colors.danger },

  stepper: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control, overflow: "hidden",
  },
  stepperBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  stepperText: { ...typography.body, color: colors.brand, fontWeight: "700" },
  qty: {
    ...typography.caption, color: colors.text, minWidth: 34, textAlign: "center",
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.sm,
  },
  swipeDelete: {
    width: 76, alignItems: "center", justifyContent: "center",
    backgroundColor: colors.danger,
  },

  subRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginHorizontal: spacing.screenGutter,
    paddingLeft: 90, paddingRight: spacing.md, paddingBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
  },
  subRowText: { ...typography.caption, color: colors.textFaint },
  linkLine: {
    marginHorizontal: spacing.screenGutter,
    paddingLeft: 90, paddingRight: spacing.md, paddingBottom: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.border,
  },
  linkText: { ...typography.caption, color: colors.textMuted },
  linkBtn: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: spacing.xs,
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: tint(colors.brand, 0.4),
    borderRadius: radii.control, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
  },
  linkBtnText: { ...typography.caption, color: colors.brand, fontWeight: "600" },
  dim: { opacity: 0.6 },

  result: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm,
  },
  resultName: { ...typography.body, color: colors.text, flex: 1, minWidth: 0 },
  resultMeta: { ...typography.caption, color: colors.textFaint },
  resultAction: { ...typography.body, color: colors.brand, fontWeight: "600" },

  tail: { height: 72 },

  scoreBar: {
    position: "absolute", left: spacing.screenGutter, right: spacing.screenGutter,
    bottom: spacing.md,
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: tint(colors.brand, 0.4), borderRadius: radii.row,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    ...elevation.overlay,
  },
  scoreNum: { ...typography.rowTitle, color: colors.text },
  delta: { ...typography.caption, fontWeight: "700" },
  deltaUp: { color: colors.brand },
  deltaDown: { color: colors.danger },
  scoreMacros: { ...typography.caption, color: colors.textMuted, marginLeft: "auto" },
});
