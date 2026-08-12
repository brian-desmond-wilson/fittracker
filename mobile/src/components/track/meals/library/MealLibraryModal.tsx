// mobile/src/components/track/meals/library/MealLibraryModal.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Modal, SectionList, StatusBar, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import type { MealCategory, MealTotals, MealWithItems } from "@/src/types/meal-library";
import {
  CATEGORY_LABELS, CATEGORY_SECTION_ORDER,
} from "@/src/types/meal-library";
import type { MealType, SavedFood } from "@/src/types/track";
import { computeBrianScore, type BrianScoreResult } from "@/src/lib/mealScore";
import { brianScoreInputFor } from "@/src/lib/mealScoreInput";
import { assessAssemblability, type MealAssemblability } from "@/src/lib/stockState";
import {
  computeMealTotals, createMeal, createUserLink, deleteMeal,
  fetchDayCalories, fetchMealLibrary, logMeal, MealLoggedButDecrementFailed,
  undoMealLog, updateMeal,
  type MealInput, type MealLibraryData,
} from "@/src/lib/supabase/mealLibrary";
import { spacing } from "@/src/theme/tokens";
import { Button, EmptyState, LoadingState } from "@/src/components/ui";
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
  const [inStockOnly, setInStockOnly] = useState(false);

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

  // Falls back to the schema default while the library is still loading, so
  // the memo below has a stable primitive rather than churning between
  // undefined and a number on first paint.
  const maxPrepMinutes = data?.maxPrepMinutes ?? 5;

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

  // Same shape and lifetime as `scores`/`totalsById` above, for the same
  // reason: MealRow is React.memo'd, so it must receive an object whose
  // identity is stable between renders. Recomputing per renderItem call would
  // hand it a fresh object every time and defeat the memo.
  //
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

  const sections = useMemo(() => {
    if (!data) return [];
    return CATEGORY_SECTION_ORDER.map((category) => {
      let meals = data.meals.filter((m) => m.category === category);
      // Composes with the category split rather than replacing it: each
      // section is narrowed in place, and `.filter((s) => s.data.length > 0)`
      // below then drops any section left empty — so a category with no
      // makeable meal disappears instead of rendering a bare header.
      if (inStockOnly) {
        meals = meals.filter((m) => assemblabilityById.get(m.id)?.assemblable);
      }
      if (category === "emergency") {
        // Biggest rescue first (spec §9.1).
        meals = [...meals].sort(
          (a, b) =>
            computeMealTotals(b.items).calories - computeMealTotals(a.items).calories,
        );
      }
      return { category, data: meals };
    }).filter((s) => s.data.length > 0);
  }, [data, inStockOnly, assemblabilityById]);

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
          assemblability={assemblabilityById.get(item.id)}
          maxPrepMinutes={maxPrepMinutes}
          onPress={handleOpenDetail}
        />
      );
    },
    [scores, totalsById, assemblabilityById, maxPrepMinutes, handleOpenDetail],
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
        title="Couldn't load your Meal Library."
        action={{ label: "Retry", onPress: () => load() }}
      />
    );
  } else if (!data) {
    body = <LoadingState />;
  } else if (view.mode === "detail" && detailMeal) {
    body = (
      <MealDetail
        meal={detailMeal}
        totals={computeMealTotals(detailMeal.items)}
        score={scores.get(detailMeal.id)!}
        assemblability={assemblabilityById.get(detailMeal.id)}
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
        inventory={data.inventory}
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
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}
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
          // The filter must never strand the user in front of an empty list
          // that reads as "you have no meals". `sections` drops empty
          // sections, so an over-narrow filter yields [] exactly like an empty
          // library — the two cases have to say different things, and the
          // filtered one has to name the way out.
          <Text style={[lib.mutedText, { padding: spacing.xxl, textAlign: "center" }]}>
            {inStockOnly
              ? "No meals you can make from what's in stock. Tap “In stock only” again to see everything."
              : "No meals yet — add your first one."}
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
            <Button
              label="New"
              icon={Plus}
              variant="ghost"
              size="sm"
              onPress={() => setView({ mode: "builder", mealId: null })}
            />
          ) : (
            <Button
              label="Library"
              icon={ChevronLeft}
              variant="ghost"
              size="sm"
              onPress={() => setView({ mode: "list" })}
            />
          )}
          <Text style={lib.headerTitle} numberOfLines={1}>{headerTitle}</Text>
          <Button label="Done" variant="ghost" size="sm" onPress={onClose} />
        </View>
        {/* Filter bar, list mode only. Kept OUT of the scrolling SectionList
            so it can't scroll away while it is hiding rows — the state that
            most needs to stay visible is the one that shortens the list. */}
        {view.mode === "list" && data && (
          <View style={lib.filterBar}>
            <TouchableOpacity
              style={[lib.chip, { marginBottom: 0 }, inStockOnly && lib.chipFilterActive]}
              onPress={() => setInStockOnly((v) => !v)}
            >
              <Text style={[lib.chipText, inStockOnly && lib.chipFilterTextActive]}>
                In stock only
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {body}
      </View>
    </Modal>
  );
}
