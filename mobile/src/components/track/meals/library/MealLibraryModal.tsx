// mobile/src/components/track/meals/library/MealLibraryModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, SectionList, StatusBar, Text,
  TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import type { MealCategory, MealTotals, MealWithItems } from "@/src/types/meal-library";
import {
  CATEGORY_LABELS, CATEGORY_SECTION_ORDER,
} from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";
import { computeBrianScore, type BrianScoreResult } from "@/src/lib/mealScore";
import {
  computeMealTotals, createMeal, createUserLink, deleteMeal,
  fetchDayCalories, fetchMealLibrary, logMeal, MealLoggedButDecrementFailed,
  undoMealLog, updateMeal,
  type MealInput, type MealLibraryData,
} from "@/src/lib/supabase/mealLibrary";
import { MealRow } from "./MealRow";
import { MealDetail } from "./MealDetail";
import { MealBuilder } from "./MealBuilder";
import { lib } from "./styles";

type View_ =
  | { mode: "list" }
  | { mode: "detail"; mealId: string }
  | { mode: "builder"; mealId: string | null };

interface MealLibraryModalProps {
  visible: boolean;
  savedFoods: SavedFood[];
  todayDate: string; // the viewed local date — logs land on this day
  onClose: () => void;
  onLogged: () => Promise<void> | void;
  /** Phase 3 (spec §7.1/§7.2): open straight onto this meal's detail instead
   *  of the list, for the Home card's `suggestMealId` deep link and the
   *  in-Meals "Suggested now" chips. Read only when `visible` flips to true
   *  (or while visible, if it changes) — see the effect below. A stale/deleted
   *  id is safe: `detailMeal` then resolves to `undefined` and the body chain
   *  falls through to the list. */
  initialMealId?: string | null;
}

export function MealLibraryModal({
  visible, savedFoods, todayDate, onClose, onLogged, initialMealId,
}: MealLibraryModalProps) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<MealLibraryData | null>(null);
  const [dayCalories, setDayCalories] = useState<number | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [view, setView] = useState<View_>({ mode: "list" });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (options?: { silent?: boolean }) => {
    try {
      const [d, cals] = await Promise.all([
        fetchMealLibrary(),
        fetchDayCalories(todayDate),
      ]);
      setData(d);
      setDayCalories(cals);
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      if (!options?.silent) {
        Alert.alert(
          "Failed to load Meal Library",
          e instanceof Error ? e.message : "Unknown error",
        );
      }
    }
  }, [todayDate]);

  useEffect(() => {
    if (visible) {
      setView(
        initialMealId
          ? { mode: "detail", mealId: initialMealId }
          : { mode: "list" },
      );
      load();
    }
  }, [visible, initialMealId, load]);

  // Stale-target recovery, and it has to run HERE rather than in the effect
  // above: at that point `load()` hasn't resolved, so `data` is null and there
  // is nothing to validate the id against. Reachable only narrowly — a meal
  // deleted between the recommendation that named it and the tap that opens it
  // — but without this the body chain falls through to the library list
  // (verified: `view.mode === "detail" && detailMeal` is false, `builder` is
  // false, so the final `else` renders the `SectionList`) while the header
  // still reads "Meal" with a `‹ Library` action that appears to do nothing
  // when tapped, because the list is already what's on screen. Resetting the
  // view makes the header agree with the body. Cannot loop: it only ever
  // moves `detail` → `list`, and the `view.mode === "detail"` test is false on
  // the next run.
  useEffect(() => {
    if (
      data &&
      view.mode === "detail" &&
      !data.meals.some((m) => m.id === view.mealId)
    ) {
      setView({ mode: "list" });
    }
  }, [data, view]);

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

  const scores = useMemo(() => {
    const map = new Map<string, BrianScoreResult>();
    if (!data) return map;
    for (const meal of data.meals) {
      map.set(
        meal.id,
        computeBrianScore({
          prepMinutes: meal.prep_minutes,
          role: meal.role,
          tasteOverride: meal.taste_override,
          items: meal.items.map((it) => ({
            calories: it.savedFood.calories,
            protein: it.savedFood.protein,
            servings: it.servings,
            smallPiecesOk: it.small_pieces_ok,
            concepts: (data.conceptIdsBySavedFoodId.get(it.saved_food_id) ?? [])
              .map((id) => data.conceptsById.get(id))
              .filter((c): c is NonNullable<typeof c> => !!c)
              .map((c) => ({
                rating: c.rating,
                requiresSmallPieces: c.requires_small_pieces,
                prepIntensive: c.prep_intensive,
              })),
          })),
        }),
      );
    }
    return map;
  }, [data]);

  // Built alongside `scores` and keyed the same way, so `renderItem` can hand
  // MealRow a STABLE totals object. Recomputing `computeMealTotals(item.items)`
  // inside renderItem produced a fresh object every invocation, which made
  // MealRow's React.memo unable to short-circuit on any render.
  const totalsById = useMemo(() => {
    const map = new Map<string, MealTotals>();
    if (!data) return map;
    for (const meal of data.meals) map.set(meal.id, computeMealTotals(meal.items));
    return map;
  }, [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    return CATEGORY_SECTION_ORDER.map((category) => {
      let meals = data.meals.filter((m) => m.category === category);
      if (category === "emergency") {
        // Biggest rescue first (spec §9.1).
        meals = [...meals].sort(
          (a, b) =>
            computeMealTotals(b.items).calories - computeMealTotals(a.items).calories,
        );
      }
      return { category, data: meals };
    }).filter((s) => s.data.length > 0);
  }, [data]);

  const remaining =
    data?.targetCalories != null && dayCalories != null
      ? Math.round(data.targetCalories - dayCalories)
      : null;

  const getUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not signed in");
    return user.id;
  };

  const handleLog = useCallback(
    async (meal: MealWithItems, mealType: MealType) => {
      if (!data) return;
      setBusy(true);
      try {
        const userId = await getUserId();
        const result = await logMeal(userId, meal, {
          date: todayDate,
          mealType,
          conceptIdsBySavedFoodId: data.conceptIdsBySavedFoodId,
          inventory: data.inventory,
        });
        await onLogged();
        await load({ silent: true });
        Alert.alert("Logged", `${meal.name} → ${mealType}`, [
          {
            text: "Undo",
            style: "destructive",
            onPress: () => {
              run("Failed to undo", async () => {
                await undoMealLog(meal.id, result.loggedAt, result.consumedIds);
                await onLogged();
              });
            },
          },
          { text: "OK", style: "default" },
        ]);
        setView({ mode: "list" });
      } catch (e) {
        if (e instanceof MealLoggedButDecrementFailed) {
          // Rows committed — only stock bookkeeping failed. Never roll back.
          // Narrowed into a const so the Undo closure below keeps the type
          // (a catch binding is not const, so narrowing does not survive into
          // a callback).
          const failure = e;
          await onLogged();
          await load({ silent: true });
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
                run("Failed to undo", async () => {
                  await undoMealLog(meal.id, failure.loggedAt, []);
                  await onLogged();
                });
              },
            },
            { text: "OK", style: "default" },
          ]);
          setView({ mode: "list" });
        } else {
          Alert.alert("Failed to log meal", e instanceof Error ? e.message : "Unknown error");
        }
      } finally {
        setBusy(false);
      }
    },
    [data, todayDate, onLogged, load, run],
  );

  const handleSave = useCallback(
    async (input: MealInput) => {
      const editingId = view.mode === "builder" ? view.mealId : null;
      const ok = await run(
        editingId ? "Failed to save meal" : "Failed to create meal",
        async () => {
          const userId = await getUserId();
          if (editingId) await updateMeal(userId, editingId, input);
          else await createMeal(userId, input);
        },
      );
      if (ok) setView({ mode: "list" });
    },
    [view, run],
  );

  const handleDelete = useCallback(
    async (meal: MealWithItems) => {
      const ok = await run("Failed to delete meal", () => deleteMeal(meal.id));
      if (ok) setView({ mode: "list" });
    },
    [run],
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

  // Stable across renders so MealRow's React.memo can actually short-circuit.
  const handleOpenDetail = useCallback(
    (meal: MealWithItems) => setView({ mode: "detail", mealId: meal.id }),
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: MealWithItems }) => {
      // `scores` and `totalsById` are both built from `data.meals`, and
      // `sections` is derived from that same array — so a miss here is
      // structurally impossible. It is deliberately NOT papered over with a
      // recomputed placeholder: scoring an empty item list yields a
      // confident-looking 55 that is indistinguishable from a real score, so
      // a derivation bug would ship as a wrong number rather than as a
      // visible absence. Drop the row and say so instead.
      const score = scores.get(item.id);
      const totals = totalsById.get(item.id);
      if (!score || !totals) {
        console.error(
          `MealLibraryModal: no computed score/totals for meal ${item.id} (${item.name}) — ` +
            "scores/totalsById are out of sync with the rendered sections.",
        );
        return null;
      }
      return (
        <MealRow
          meal={item}
          totals={totals}
          score={score}
          onPress={handleOpenDetail}
        />
      );
    },
    [scores, totalsById, handleOpenDetail],
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
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={lib.mutedText}>Couldn&apos;t load your Meal Library.</Text>
        <TouchableOpacity style={[lib.primaryButton, { marginTop: 16, paddingHorizontal: 24 }]} onPress={() => load()}>
          <Text style={lib.primaryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  } else if (!data) {
    body = (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color="#3B82F6" />
      </View>
    );
  } else if (view.mode === "detail" && detailMeal) {
    body = (
      <MealDetail
        meal={detailMeal}
        totals={computeMealTotals(detailMeal.items)}
        score={scores.get(detailMeal.id)!}
        logging={busy}
        onLog={handleLog}
        onEdit={(m) => setView({ mode: "builder", mealId: m.id })}
        onDelete={handleDelete}
      />
    );
  } else if (view.mode === "builder") {
    body = (
      <MealBuilder
        initial={builderMeal}
        savedFoods={savedFoods}
        conceptsById={data.conceptsById}
        conceptIdsBySavedFoodId={data.conceptIdsBySavedFoodId}
        saving={busy}
        onSave={handleSave}
        onQuickLink={handleQuickLink}
      />
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <View>
            <Text
              style={[
                lib.sectionHeader,
                section.category === "emergency" && lib.emergencyHeader,
              ]}
            >
              {CATEGORY_LABELS[section.category as MealCategory]}
            </Text>
            {section.category === "emergency" && remaining != null && (
              <Text style={lib.emergencySub}>
                ~{remaining} cal remaining today
              </Text>
            )}
          </View>
        )}
        ListEmptyComponent={
          <Text style={[lib.mutedText, { padding: 24, textAlign: "center" }]}>
            No meals yet — add your first one.
          </Text>
        }
      />
    );
  }

  const headerTitle =
    view.mode === "builder" ? (builderMeal ? "Edit Meal" : "New Meal")
    : view.mode === "detail" ? detailMeal?.name ?? "Meal"
    : "Meal Library";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <StatusBar barStyle="light-content" />
      <View style={[lib.screen, { paddingTop: insets.top }]}>
        {/* Header renders unconditionally: fullScreen modals have no iOS
            swipe-to-dismiss, so no load state may strand the user. */}
        <View style={lib.header}>
          {view.mode === "list" ? (
            <TouchableOpacity onPress={() => setView({ mode: "builder", mealId: null })}>
              <Text style={lib.headerAction}>＋ New</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setView({ mode: "list" })}>
              <Text style={lib.headerAction}>‹ Library</Text>
            </TouchableOpacity>
          )}
          <Text style={lib.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={lib.headerAction}>Done</Text>
          </TouchableOpacity>
        </View>
        {body}
      </View>
    </Modal>
  );
}
