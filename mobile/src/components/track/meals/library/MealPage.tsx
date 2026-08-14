// mobile/src/components/track/meals/library/MealPage.tsx
//
// One meal, as a page: its detail, and the builder that makes or edits one.
//
// This was `MealLibraryModal`, which also owned a catalog of its own — a
// searchable, in-stock-filtered SectionList that was the Meal Library before
// `MealLibraryScreen` was. Two catalogs meant a meal opened from the shelves
// had a back button that led to the OTHER library, a page nothing else linked
// to and that answered the same questions worse. The list is gone; what is left
// is every write path that already worked — logging, editing, deleting, linking
// an ingredient — now mounted by a route rather than raised as a sheet, so
// Track › Meal Library › meal is a real stack and back means back.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Pencil } from "lucide-react-native";
import { createSavedFood } from "@/src/services/savedFoodsService";
import { supabase } from "@/src/lib/supabase";
import type { MealCategory, MealWithItems } from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";
import { computeBrianScore, type BrianScoreResult } from "@/src/lib/mealScore";
import { brianScoreInputFor } from "@/src/lib/mealScoreInput";
import { addSuggestions } from "@/src/lib/supabase/shopping";
import { assessAssemblability, type MealAssemblability } from "@/src/lib/stockState";
import { mealIngredients, mealNutrition } from "@/src/lib/mealLibraryView";
import { mealFaceUrlFor } from "@/src/lib/mealFace";
import { getLocalDateString } from "@/src/lib/dates";
import {
  createMeal, createUserLink, deleteMeal,
  fetchMealLibrary, logMeal, MealLoggedButDecrementFailed,
  setMealArchived, setMealCategories, setMealFavorite,
  undoMealLog, updateMeal,
  type MealInput, type MealLibraryData,
} from "@/src/lib/supabase/mealLibrary";
import { colors, icons, spacing } from "@/src/theme/tokens";
import { Button, EmptyState, LoadingState } from "@/src/components/ui";
import { MealDetail } from "./MealDetail";
import { MealBuilder, type MealBuilderHandle } from "./MealBuilder";
import { BarcodeScannerModal } from "@/src/components/track/BarcodeScannerModal";
import { ConceptPickerSheet } from "./ConceptPickerSheet";
import { lib } from "./styles";

type View_ =
  | { mode: "detail"; mealId: string }
  | { mode: "builder"; mealId: string | null };

interface MealPageProps {
  /** The meal this page is about, or null to open a blank builder. */
  mealId: string | null;
  savedFoods: SavedFood[];
  todayDate: string; // the viewed local date — logs land on this day
  /** Leave the page: pop back to the library. */
  onClose: () => void;
  /** Open an ingredient's product in Food Inventory. */
  onOpenProduct: (inventoryId: string) => void;
  /** Slot and time chosen before this page opened — the quick-log sheet's
   *  context, so it doesn't have to be set twice. */
  initialMealType?: MealType;
  initialLoggedAt?: Date;
}

export function MealPage({
  mealId, savedFoods, todayDate, onClose, onOpenProduct,
  initialMealType, initialLoggedAt,
}: MealPageProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MealLibraryData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<View_>(
    mealId ? { mode: "detail", mealId } : { mode: "builder", mealId: null },
  );
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const d = await fetchMealLibrary();
      setData(d);
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert(
          "Failed to load this meal",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Stale-target recovery, and it has to run HERE rather than beside the state
  // above: at that point `load()` hasn't resolved, so `data` is null and there
  // is nothing to validate the id against. Reachable only narrowly — a meal
  // deleted between the recommendation that named it and the tap that opens it
  // — and leaving is the honest answer now that this page has nothing else to
  // show. Cannot fight the delete path, which pops for the same reason.
  useEffect(() => {
    if (
      data &&
      view.mode === "detail" &&
      !data.meals.some((m) => m.id === view.mealId)
    ) {
      onClose();
    }
  }, [data, view, onClose]);

  const builderRef = useRef<MealBuilderHandle>(null);

  // The scanner is a modal this page owns, but the builder is what wants the
  // answer — so it hands back a promise that settles when the camera closes,
  // and the builder can `await` a barcode without knowing any of that.
  const [scanning, setScanning] = useState(false);
  const scanResolver = useRef<((barcode: string | null) => void) | null>(null);
  const requestScan = useCallback(() => {
    setScanning(true);
    return new Promise<string | null>((resolve) => { scanResolver.current = resolve; });
  }, []);
  const settleScan = useCallback((barcode: string | null) => {
    setScanning(false);
    scanResolver.current?.(barcode);
    scanResolver.current = null;
  }, []);

  const handleCreateFood = useCallback(
    async (food: { name: string; calories: number | null; protein: number | null; barcode: string | null }) => {
      try {
        return await createSavedFood({
          name: food.name,
          brand: null,
          barcode: food.barcode,
          calories: food.calories,
          protein: food.protein,
          carbs: null,
          fats: null,
          sugars: null,
          sodium_mg: null,
          fiber_g: null,
          is_favorite: false,
        } as Parameters<typeof createSavedFood>[0]);
      } catch (e) {
        console.error("create food from builder:", e);
        Alert.alert("Couldn't create that", e instanceof Error ? e.message : "Unknown error");
        return null;
      }
    },
    [],
  );

  const run = useCallback(
    async (title: string, fn: () => Promise<void>): Promise<boolean> => {
      setBusy(true);
      try {
        await fn();
        await load();
        return true;
      } catch (e) {
        Alert.alert(title, e instanceof Error ? e.message : "Unknown error");
        await load({ silent: true });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  // `brianScoreInputFor`, not a hand-rolled copy of it. This screen carried a
  // third inline transcription of that mapping — the exact duplication the
  // builder was extracted to end — and it had already drifted: the builder
  // learned `completePortion` and this copy did not, so a delivered meal
  // scored as a whole meal everywhere in the app EXCEPT the one screen where
  // you read its score breakdown. The mapping is under test; an inline copy
  // never can be.
  const scores = useMemo(() => {
    const map = new Map<string, BrianScoreResult>();
    if (!data) return map;
    for (const meal of data.meals) {
      map.set(
        meal.id,
        computeBrianScore(
          brianScoreInputFor(meal, data.conceptIdsBySavedFoodId, data.conceptsById),
        ),
      );
    }
    return map;
  }, [data]);

  // `useEatNext` builds a SECOND map over this same predicate
  // (`buildStockByMealId` in `lib/eatNext.ts`). Not shared, deliberately —
  // different value type and different lifetime; the reasoning is recorded in
  // that function's doc comment. If you change what this computes, read it.
  const assemblabilityById = useMemo(() => {
    const map = new Map<string, MealAssemblability>();
    if (!data) return map;
    for (const meal of data.meals) {
      map.set(
        meal.id,
        assessAssemblability({
          items: meal.items.map((it) => ({
            savedFoodId: it.saved_food_id,
            name: it.savedFood.name,
            barcode: it.savedFood.barcode,
            conceptIds: data.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [],
          })),
          inventory: data.inventory,
        }),
      );
    }
    return map;
  }, [data]);

  const getUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    return user.id;
  };

  const handleLog = useCallback(
    async (
      meal: MealWithItems,
      { mealType, portion, daysAgo, loggedAt }:
        { mealType: MealType; portion: number; daysAgo: number; loggedAt: Date },
    ) => {
      if (!data) return;
      setBusy(true);
      try {
        const userId = await getUserId();
        // `todayDate` is the day the page was opened on; the picker moves back
        // from it, never forward — you cannot have eaten it yet.
        const date = daysAgo === 0
          ? todayDate
          : getLocalDateString(new Date(Date.now() - daysAgo * 86_400_000));
        const result = await logMeal(userId, meal, {
          date,
          mealType,
          portion,
          // The clock the picker holds, on the day the stepper chose.
          loggedAt: (() => {
            const at = new Date(Date.now() - daysAgo * 86_400_000);
            at.setHours(loggedAt.getHours(), loggedAt.getMinutes(), 0, 0);
            return at;
          })(),
          conceptIdsBySavedFoodId: data.conceptIdsBySavedFoodId,
          inventory: data.inventory,
        });
        Alert.alert("Logged", `${meal.name} → ${mealType}`, [
          {
            text: "Undo",
            style: "destructive",
            onPress: () => {
              run("Failed to undo", () =>
                undoMealLog(meal.id, result.loggedAt, result.consumedIds));
            },
          },
          { text: "OK", style: "default" },
        ]);
        onClose();
      } catch (e) {
        if (e instanceof MealLoggedButDecrementFailed) {
          // Rows committed — only stock bookkeeping failed. Never roll back.
          // Narrowed into a const so the Undo closure below keeps the type
          // (a catch binding is not const, so narrowing does not survive into
          // a callback).
          const failure = e;
          Alert.alert("Logged (inventory not updated)", failure.message, [
            {
              text: "Undo",
              style: "destructive",
              // Undo is still offered here, and refunding NOTHING is correct:
              // consume_inventory_units is plpgsql, so an error aborts the
              // whole function body and no unit was taken. Without this the
              // user's only recourse was deleting the rows one at a time from
              // the day view. (Caveat: a network timeout lands in this same
              // branch and the decrement may in fact have committed with no
              // ids to refund — the log rows still come out, stock reads one
              // unit short. That is the documented unrecoverable case, and it
              // is strictly better than leaving the rows behind too.)
              onPress: () => {
                run("Failed to undo", () =>
                  undoMealLog(meal.id, failure.loggedAt, []));
              },
            },
            { text: "OK", style: "default" },
          ]);
          onClose();
        } else {
          Alert.alert("Failed to log meal", e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        setBusy(false);
      }
    },
    [data, todayDate, onClose, run],
  );

  // E1. Concept links are the curation chore the whole loop is gated on, and
  // the builder — the one moment you are already thinking about what an
  // ingredient IS — was saving meals with none at all. This asks the existing
  // matcher for proposals over the meal's unlinked items.
  //
  // `dryRun: true`, so the function proposes and writes NOTHING. Linking here
  // happens in a foreground moment the owner is looking at, which makes the
  // right shape a suggestion to accept rather than a silent write; and it is
  // the owner's concept graph, not the model's.
  const suggestLinksFor = useCallback(async (targetMealId: string) => {
    const library = await fetchMealLibrary();
    const meal = library.meals.find((m) => m.id === targetMealId);
    if (!meal) return;
    const unlinked = meal.items
      .map((it) => it.saved_food_id)
      .filter((id) => (library.conceptIdsBySavedFoodId.get(id) ?? []).length === 0);
    if (unlinked.length === 0) return;
    try {
      const { data, error } = await supabase.functions.invoke("inventory-intelligence", {
        body: { savedFoodIds: unlinked, dryRun: true },
      });
      if (error) throw error;
      const proposals = ((data?.results ?? []) as Array<{
        id: string; name: string; concept: { id: string; name: string } | null;
      }>).filter((r) => r.concept !== null);
      if (proposals.length === 0) return;
      const summary = proposals
        .map((r) => `${r.name} → ${r.concept!.name}`)
        .join("\n");
      Alert.alert(
        proposals.length === 1 ? "Link this ingredient?" : `Link ${proposals.length} ingredients?`,
        `${summary}\n\nLinking lets the app check your kitchen for them.`,
        [
          { text: "Not now", style: "cancel" },
          {
            text: "Link",
            onPress: () => {
              void run("Couldn't link those", async () => {
                const userId = await getUserId();
                for (const r of proposals) {
                  await createUserLink(userId, r.concept!.id, { savedFoodId: r.id });
                }
              });
            },
          },
        ],
      );
    } catch (e) {
      // Silent: this is an offer, and a matcher that is down should not
      // interrupt saving a meal.
      console.error("suggestLinksFor:", e);
    }
  }, [run]);

  const handleSave = useCallback(
    async (input: MealInput) => {
      const editingId = view.mode === "builder" ? view.mealId : null;
      let savedMealId: string | null = editingId;
      const ok = await run(
        editingId ? "Failed to save meal" : "Failed to create meal",
        async () => {
          const userId = await getUserId();
          if (editingId) await updateMeal(userId, editingId, input);
          else savedMealId = await createMeal(userId, input);
        },
      );
      if (ok) {
        // An edit came from this meal's detail and returns to it; a new meal
        // has no detail behind it, so saving one leaves for the library.
        if (editingId) setView({ mode: "detail", mealId: editingId });
        else onClose();
        // E1: offered after the save lands, so a matcher that is slow or down
        // never delays or blocks saving a meal.
        if (savedMealId) void suggestLinksFor(savedMealId);
      }
    },
    [view, run, onClose, suggestLinksFor],
  );

  // B2. Name-only rows on purpose: an unresolved ingredient has no inventory
  // row to point at — that is what makes it missing — so `food_inventory_id`
  // is null and the demand engine's name-based suppression is what stops it
  // suggesting the same thing again. Priority 1: you asked for this one
  // explicitly, which outranks anything the engine inferred.
  const [addingToList, setAddingToList] = useState(false);
  const [addedToListMealId, setAddedToListMealId] = useState<string | null>(null);
  const handleAddMissing = useCallback(
    async (names: string[]) => {
      if (names.length === 0 || view.mode !== "detail") return;
      const targetMealId = view.mealId;
      setAddingToList(true);
      try {
        const userId = await getUserId();
        await addSuggestions(userId, names.map((name) => ({
          name,
          foodInventoryId: null,
          vendorId: null,
          quantity: 1,
          unit: null,
          priority: 1 as const,
          reasons: ["needed for a meal you opened"],
        })));
        setAddedToListMealId(targetMealId);
      } catch (e) {
        console.error("add missing to shopping list:", e);
        Alert.alert("Couldn't add to the list", "Nothing was added — try again.");
      } finally {
        setAddingToList(false);
      }
    },
    [view],
  );

  // D4. Repairing a concept link from the meal that is broken by its absence.
  // Resolves the ingredient NAME back to its saved-food id here rather than
  // threading ids through `MealAssemblability`, which deliberately reports
  // display names — the verdict is about what to tell the reader, not about
  // identity.
  const [linkTarget, setLinkTarget] = useState<
    { savedFoodId: string; name: string } | null
  >(null);
  const handleLinkIngredient = useCallback(
    (savedFoodName: string) => {
      if (view.mode !== "detail" || !data) return;
      const meal = data.meals.find((m) => m.id === view.mealId);
      const item = meal?.items.find((it) => it.savedFood.name === savedFoodName);
      if (!item) return;
      setLinkTarget({ savedFoodId: item.saved_food_id, name: savedFoodName });
    },
    [view, data],
  );
  const handlePickConcept = useCallback(
    async (conceptId: string) => {
      if (!linkTarget) return;
      const ok = await run("Couldn't link that", async () => {
        const userId = await getUserId();
        await createUserLink(userId, conceptId, { savedFoodId: linkTarget.savedFoodId });
      });
      if (ok) setLinkTarget(null);
    },
    [linkTarget, run],
  );

  const handleToggleFavorite = useCallback(
    (meal: MealWithItems) =>
      run("Couldn't save that", () => setMealFavorite(meal.id, !meal.is_favorite)),
    [run],
  );

  /** Writes straight through — the rail is a control, not a form. `run`
   *  reloads, so the chips settle on what the database actually holds rather
   *  than on what was tapped. */
  const handleSetCategories = useCallback(
    (meal: MealWithItems, next: MealCategory[]) =>
      run("Couldn't file that", async () => {
        const { error } = await setMealCategories(meal.id, next);
        if (error) throw error;
      }),
    [run],
  );

  const handleArchive = useCallback(
    (meal: MealWithItems, archived: boolean) =>
      run(archived ? "Couldn't archive that" : "Couldn't unarchive that",
        () => setMealArchived(meal.id, archived)),
    [run],
  );

  const handleDelete = useCallback(
    async (meal: MealWithItems) => {
      const ok = await run("Failed to delete meal", () => deleteMeal(meal.id));
      if (ok) onClose();
    },
    [run, onClose],
  );

  const handleQuickLink = useCallback(
    (savedFoodId: string, conceptId: string) => {
      run("Failed to link food", async () => {
        const userId = await getUserId();
        await createUserLink(userId, conceptId, { savedFoodId });
      });
    },
    [run],
  );

  const detailMeal =
    view.mode === "detail" ? data?.meals.find((m) => m.id === view.mealId) : undefined;
  const builderMeal =
    view.mode === "builder" && view.mealId
      ? data?.meals.find((m) => m.id === view.mealId) ?? null
      : null;

  let body: React.ReactNode;
  if (!data && loadFailed) {
    body = (
      <EmptyState
        title="Couldn't load this meal."
        action={{ label: "Retry", onPress: () => load() }}
      />
    );
  } else if (!data) {
    body = <LoadingState />;
  } else if (view.mode === "detail" && detailMeal) {
    body = (
      <MealDetail
        meal={detailMeal}
        // Priced from the fridge, not from the build — the same numbers the
        // shelves show, so a card and its page can never disagree.
        nutrition={mealNutrition({
          meal: detailMeal,
          inventory: data.inventory,
          conceptIdsBySavedFoodId: data.conceptIdsBySavedFoodId,
          nutritionByInventoryId: data.nutritionByInventoryId,
        })}
        ingredients={mealIngredients({
          items: detailMeal.items,
          inventory: data.inventory,
          conceptIdsBySavedFoodId: data.conceptIdsBySavedFoodId,
        })}
        score={scores.get(detailMeal.id)!}
        assemblability={assemblabilityById.get(detailMeal.id)}
        timesLogged={data.timesLoggedByMealId.get(detailMeal.id) ?? 0}
        lastLoggedDate={data.lastLoggedByMealId.get(detailMeal.id) ?? null}
        faceUrl={mealFaceUrlFor(detailMeal.image_primary_url, detailMeal.items.map((it) => ({
          displayOrder: it.display_order,
          imageUrl: it.savedFood.image_primary_url,
          calories: (it.savedFood.calories ?? 0) * it.servings,
        })))}
        logging={busy}
        saving={busy}
        onToggleFavorite={() => handleToggleFavorite(detailMeal)}
        onToggleCategory={(next) => handleSetCategories(detailMeal, next)}
        onAddMissing={handleAddMissing}
        onLinkIngredient={handleLinkIngredient}
        onOpenProduct={onOpenProduct}
        addingToList={addingToList}
        addedToList={addedToListMealId === detailMeal.id}
        onLog={handleLog}
        onArchive={handleArchive}
        onDelete={handleDelete}
      />
    );
  } else if (view.mode === "builder") {
    body = (
      <MealBuilder
        ref={builderRef}
        initial={builderMeal}
        savedFoods={savedFoods}
        conceptsById={data.conceptsById}
        conceptIdsBySavedFoodId={data.conceptIdsBySavedFoodId}
        inventory={data.inventory}
        sourceSuggestions={data.sourceSuggestions}
        saving={busy}
        onSave={handleSave}
        onQuickLink={handleQuickLink}
        onCreateFood={handleCreateFood}
        onScan={requestScan}
      />
    );
  } else {
    // `detail` with the meal not yet resolved: the stale-target effect above
    // pops out of here on the next commit, so this is one frame at most.
    body = <LoadingState />;
  }

  const headerTitle =
    view.mode === "builder" ? (builderMeal ? "Edit Meal" : "New Meal")
    : detailMeal?.name ?? "Meal";

  // Editing backs out to the meal it edits; everything else backs out to the
  // library — the same "one screen back" the chevron promises on any pushed
  // page, now that there is only one library to go back to.
  const editing = view.mode === "builder" && view.mealId !== null;
  const leave = useCallback(() => {
    if (editing) setView({ mode: "detail", mealId: view.mealId as string });
    else onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, view, onClose]);

  // A form that throws work away on a back tap is the one place in this app
  // where leaving is destructive. Three answers, because "save and leave" is
  // usually what was meant.
  const back = () => {
    if (view.mode !== "builder" || !builderRef.current?.isDirty()) {
      leave();
      return;
    }
    Alert.alert(
      "Leave without saving?",
      "Nothing is written until you save.",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: leave },
        { text: "Save and leave", onPress: () => builderRef.current?.save() },
      ],
    );
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[lib.screen, { paddingTop: insets.top }]}>
        {/* Header renders unconditionally: no load state may strand the user
            on a page whose only way out is its own back button. */}
        {/* The Food Inventory product page's bar, to the pixel: a 24pt
            chevron and the word Back at 17pt, with Edit as the one trailing
            action. Two sibling detail pages that read differently make the
            app feel assembled from parts. */}
        <View style={lib.header}>
          <TouchableOpacity
            onPress={back}
            style={s.backButton}
            accessibilityRole="button"
            accessibilityLabel={editing ? "Back to the meal" : "Back to the library"}
          >
            <ChevronLeft size={icons.lg} color={colors.text} strokeWidth={icons.strokeWidth} />
            <Text style={s.backText}>Back</Text>
          </TouchableOpacity>
          {view.mode === "detail" && detailMeal ? (
            <Button
              label="Edit"
              icon={Pencil}
              variant="ghost"
              size="sm"
              onPress={() => setView({ mode: "builder", mealId: detailMeal.id })}
            />
          ) : (
            <>
              <Text style={lib.headerTitle} numberOfLines={1}>{headerTitle}</Text>
              {/* Save sits where the meal page keeps Edit. The form is long
                  enough that its own commit used to be off-screen from
                  everything that changes it. */}
              <TouchableOpacity
                onPress={() => builderRef.current?.save()}
                disabled={busy}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Save this meal"
              >
                <Text style={[s.save, busy && s.saveBusy]}>Save</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
        {body}
        <BarcodeScannerModal
          visible={scanning}
          onClose={() => settleScan(null)}
          onBarcodeScanned={(barcode) => settleScan(barcode)}
        />
        <ConceptPickerSheet
          visible={linkTarget !== null}
          subject={linkTarget?.name ?? ""}
          concepts={data ? [...data.conceptsById.values()] : []}
          busy={busy}
          onPick={handlePickConcept}
          onClose={() => setLinkTarget(null)}
        />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  backButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  backText: { fontSize: 17, color: colors.text },
  save: { fontSize: 15, fontWeight: "700", color: colors.brand },
  saveBusy: { color: colors.textFaint },
});
