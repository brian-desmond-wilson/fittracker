// Log something — the sheet that replaced the inline form.
//
// The old form was rendered INTO the rail, so opening it shoved the day
// downward and you filled in a gap you could no longer see. It also opened on
// its two least-used fields: a date picker, on a screen already showing you a
// date, and seven macro boxes, for a log that usually carries its own numbers.
//
// So: a sheet over the rail, and recents first. One tap on something you have
// eaten before logs it outright — that is most logs. Typing something new is
// a step down, because it is the rarer thing. Inside, the card styling is
// Edit Meal's, so create and edit read as siblings.
import React, { useMemo } from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { ChevronRight, ScanBarcode, Search, Star } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, WhenSheet } from "@/src/components/ui";
import type { MealType, SavedFood } from "@/src/types/track";
import type { MealWithItems } from "@/src/types/meal-library";
import { mergeLogResults } from "@/src/lib/logResults";
import { BEVERAGE_KINDS, BEVERAGE_KIND_LABELS } from "@/src/types/meal-library";
import { mealFaceUrlFor } from "@/src/lib/mealFace";
import { computeMealTotals } from "@/src/lib/supabase/mealLibrary";
import type { MealAddFormState } from "./useMealAddForm";
import { monogram } from "@/src/lib/vendorMonogram";
import { MealSourceFields } from "./MealSourceFields";
import type { SourceSuggestion } from "@/src/lib/supabase/mealLibrary";

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
];

/** Enough to cover the usual suspects without the grid becoming a list. */
const RECENTS_SHOWN = 6;
const RESULTS_SHOWN = 5;

/** How far down you must drag before releasing dismisses rather than
 *  springing back. A flick past `DISMISS_VELOCITY` counts regardless — the
 *  gesture people actually make is fast and short, not slow and long. */
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.7;
/** Enough to carry any sheet fully off-screen on the way out. */
const EXIT_TRAVEL = 900;

interface LogMealSheetProps {
  visible: boolean;
  onClose: () => void;

  /** Inherited context — whoever opened the sheet already knew these. */
  mealType: MealType;
  onMealTypeChange: (next: MealType) => void;
  loggedAt: Date;
  onLoggedAtChange: (next: Date) => void;
  /** Label for the day the log lands on ("today", "Mon 11 Aug"). */
  dayLabel: string;

  recentFoods: SavedFood[];
  favorites: SavedFood[];
  onLogFood: (food: SavedFood) => void;
  /** Id of the food currently being written, for its spinner. */
  loggingFoodId: string | null;

  query: string;
  onQueryChange: (next: string) => void;
  searching: boolean;
  searchResults: SavedFood[];
  mealResults: MealWithItems[];
  /** Log this meal here and now, with the slot and time above. The common
   *  case, and the one that records WHICH MEAL you ate. */
  onLogMeal: (meal: MealWithItems) => void;
  /** Open the meal's own page, for a half portion or another day. */
  onOpenMeal: (mealId: string) => void;
  /** Id of the meal currently being written, for its spinner. */
  loggingMealId?: string | null;
  onScan: () => void;

  /** The manual path: same form state the old inline version used. */
  form: MealAddFormState;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  onSubmitManual: () => void;
  submitting: boolean;
  /** For the keep switch's source picker — vendors you keep plus names your
   *  meals already carry. */
  sourceSuggestions: SourceSuggestion[];
  /** Beverage mode: no slot picker (the clock decides where it draws on the
   *  rail), a what-kind tag row, and a "Counts as a meal" switch that decides
   *  whether it fills the window its time lands in. */
  beverage: boolean;
}

/** The picture the shelves would show for this meal — its own, else the first
 *  ingredient's. Computed here so the sheet and the library never disagree
 *  about what a meal looks like. */
function faceOf(meal: MealWithItems): string | null {
  return mealFaceUrlFor(meal.image_primary_url, meal.items.map((it) => ({
    displayOrder: it.display_order,
    imageUrl: it.savedFood.image_primary_url,
    calories: (it.savedFood.calories ?? 0) * it.servings,
  })));
}

/** What you actually choose on: the calories, and the protein when there is
 *  any. "1 ingredient · 0 min" described the recipe, not the food. */
function macroLine(totals: { calories: number; protein: number }): string {
  const cals = `${Math.round(totals.calories)} cal`;
  return totals.protein > 0 ? `${cals} · ${Math.round(totals.protein)}g protein` : cals;
}

function fmtClock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

const labelFor = (t: MealType) => MEAL_TYPES.find((x) => x.value === t)?.label ?? t;

export function LogMealSheet({
  visible,
  onClose,
  mealType,
  onMealTypeChange,
  loggedAt,
  onLoggedAtChange,
  dayLabel,
  recentFoods,
  favorites,
  onLogFood,
  loggingFoodId,
  query,
  onQueryChange,
  searching,
  searchResults,
  mealResults,
  onLogMeal,
  onOpenMeal,
  loggingMealId = null,
  onScan,
  form,
  manualOpen,
  onManualOpenChange,
  onSubmitManual,
  submitting,
  sourceSuggestions,
  beverage,
}: LogMealSheetProps) {
  const [contextOpen, setContextOpen] = React.useState(false);

  // Swipe down to dismiss.
  //
  // The handlers sit on the sheet's HEAD — grab handle, title row, context
  // pill — and never on the scroller below it. A responder spanning both
  // would have to guess, on every touch, whether a downward drag means
  // "close this" or "scroll the recents up", and it would guess wrong at the
  // top of the list where the two gestures are identical. The head is the
  // part with nothing to scroll, so there is nothing to disambiguate.
  const dragY = React.useRef(new Animated.Value(0)).current;
  // The responder is built once, so it must not close over a stale `onClose`.
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;
  const pan = React.useRef(
    PanResponder.create({
      // Claim only a deliberate DOWNWARD drag, so a tap on the context pill
      // still registers as a tap.
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 6 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => {
        // Downward only: dragging up would lift the sheet off its own bottom
        // edge and show the page behind it.
        dragY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        const dismiss = g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY;
        if (dismiss) {
          Animated.timing(dragY, {
            toValue: EXIT_TRAVEL,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            // Close ONLY. Resetting the offset here would snap the sheet back
            // to its resting position for the frame or two before `visible`
            // turns false and unmounts it — which is exactly the flash of a
            // sheet you have just thrown away. The reset happens on the way
            // IN instead, below.
            onCloseRef.current();
          });
        } else {
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 0,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
      },
    }),
  ).current;

  // Opening always starts from rest, and from the quick paths rather than
  // wherever the last visit left the context panel.
  //
  // `useLayoutEffect`, not `useEffect`: a dismissed sheet is left parked at
  // `EXIT_TRAVEL`, and a passive effect would run after the next open had
  // already painted — one frame with the sheet still off-screen, the mirror
  // image of the flash this replaced.
  React.useLayoutEffect(() => {
    if (visible) {
      dragY.setValue(0);
      setContextOpen(false);
    }
  }, [visible, dragY]);

  // One list, and which row survives a collision is a rule with a test:
  // `mergeLogResults`. ABOVE the early return: a hook after it runs on some
  // renders and not others, which is the "more hooks than during the previous
  // render" crash — the sheet renders once closed and again open.
  const mergedResults = useMemo(
    () => mergeLogResults({ meals: mealResults, foods: searchResults, limit: RESULTS_SHOWN }),
    [mealResults, searchResults],
  );

  if (!visible) return null;

  const searchingNow = query.trim().length >= 2;
  // Favourites first, then plain recents — the same ordering the old
  // quick-add row used, minus its second row of duplicates.
  const quickFoods = [
    ...favorites,
    ...recentFoods.filter((r) => !favorites.some((f) => f.id === r.id)),
  ].slice(0, RECENTS_SHOWN);

  const foodChip = (food: SavedFood, showStar: boolean) => (
    <TouchableOpacity
      key={food.id}
      style={styles.chip}
      onPress={() => onLogFood(food)}
      disabled={loggingFoodId !== null}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Log ${food.name}`}
    >
      {food.image_primary_url ? (
        <Image source={{ uri: food.image_primary_url }} style={styles.chipThumb} />
      ) : showStar ? (
        <Star size={icons.sm} color={colors.warning} strokeWidth={icons.strokeWidth} />
      ) : null}
      <Text style={styles.chipName} numberOfLines={1}>
        {food.name}
      </Text>
      {food.calories != null && (
        <Text style={styles.chipCals}>
          {loggingFoodId === food.id ? "…" : food.calories}
        </Text>
      )}
    </TouchableOpacity>
  );

  return (
    <>
      {/* The scrim thins as the sheet is dragged away, so the drag reads as
          one movement rather than a card sliding under a fixed pane. */}
      <Animated.View
        style={[
          styles.scrim,
          {
            opacity: dragY.interpolate({
              inputRange: [0, DISMISS_DISTANCE * 2],
              outputRange: [1, 0.15],
              extrapolate: "clamp",
            }),
          },
        ]}
      >
        <TouchableOpacity
          style={styles.scrimFill}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
      </Animated.View>
      <Animated.View
        style={[
          styles.sheet,
          manualOpen && styles.sheetTall,
          { transform: [{ translateY: dragY }] },
        ]}
      >
        {/* Everything above the scroller drags the sheet — see the responder. */}
        <View {...pan.panHandlers}>
          <View
            style={styles.grab}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="Drag down to close"
          />
          <View style={styles.headRow}>
            <Text style={styles.title}>
              {manualOpen ? "Type something new" : beverage ? "Log a beverage" : "Log something"}
            </Text>
            <TouchableOpacity
              onPress={manualOpen ? () => onManualOpenChange(false) : onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={manualOpen ? "Back" : "Cancel"}
            >
              <Text style={styles.headAction}>{manualOpen ? "Back" : "Cancel"}</Text>
            </TouchableOpacity>
          </View>

          {/* The context the opener already knew, as a statement rather than
              two fields. Tapping it opens the only two things worth changing. */}
          <TouchableOpacity
            style={styles.ctxPill}
            onPress={() => setContextOpen((v) => !v)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={
              beverage
                ? `Logging a beverage, ${dayLabel} at ${fmtClock(loggedAt)}. Tap to change the time.`
                : `Logging to ${labelFor(mealType)}, ${dayLabel} at ${fmtClock(loggedAt)}. Tap to change.`
            }
          >
            <Text style={styles.ctxText}>
              {/* No slot in beverage mode: the clock is the whole context. */}
              {beverage ? "Beverage" : labelFor(mealType)} · {dayLabel}, {fmtClock(loggedAt)}
            </Text>
            <ChevronRight
              size={icons.sm}
              color={colors.textFaint}
              strokeWidth={icons.strokeWidth}
            />
          </TouchableOpacity>
        </View>

        <WhenSheet
          visible={contextOpen}
          loggedAt={loggedAt}
          onLoggedAtChange={onLoggedAtChange}
          // Clock alone in beverage mode — a drink has no slot to pick.
          mealType={beverage ? undefined : mealType}
          onMealTypeChange={beverage ? undefined : onMealTypeChange}
          dayLabel={dayLabel}
          onClose={() => setContextOpen(false)}
        />

        <ScrollView
          style={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {manualOpen ? (
            <>
              <Text style={styles.label}>Meal name</Text>
              <TextInput
                style={styles.input}
                value={form.mealName}
                onChangeText={form.setMealName}
                placeholder="e.g., Grilled chicken with rice"
                placeholderTextColor={colors.textMuted}
                editable={!submitting}
                autoFocus
              />

              <Text style={styles.label}>Nutrition (optional)</Text>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.subLabel}>Calories</Text>
                  <TextInput
                    style={styles.input}
                    value={form.calories}
                    onChangeText={form.setCalories}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!submitting}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.subLabel}>Protein (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.protein}
                    onChangeText={form.setProtein}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!submitting}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.subLabel}>Carbs (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.carbs}
                    onChangeText={form.setCarbs}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!submitting}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.subLabel}>Fats (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.fats}
                    onChangeText={form.setFats}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!submitting}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.subLabel}>Sugars (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.sugars}
                    onChangeText={form.setSugars}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!submitting}
                  />
                </View>
                <View style={styles.half}>
                  <Text style={styles.subLabel}>Sodium (mg)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.sodiumMg}
                    onChangeText={form.setSodiumMg}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!submitting}
                  />
                </View>
              </View>
              <View style={styles.row}>
                <View style={styles.half}>
                  <Text style={styles.subLabel}>Fiber (g)</Text>
                  <TextInput
                    style={styles.input}
                    value={form.fiberG}
                    onChangeText={form.setFiberG}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textMuted}
                    editable={!submitting}
                  />
                </View>
                <View style={styles.half} />
              </View>

              {beverage && (
                <>
                  {/* What the drink IS — multi-select, one shake can be
                      high-protein AND high-calorie. Nothing selected reads as
                      "other" at write time rather than blocking the log. */}
                  <Text style={styles.label}>What kind of drink?</Text>
                  <View style={styles.bevChips}>
                    {BEVERAGE_KINDS.map((kind) => {
                      const active = form.bevKinds.includes(kind);
                      return (
                        <TouchableOpacity
                          key={kind}
                          style={[styles.bevChip, active && styles.bevChipActive]}
                          onPress={() => form.toggleBevKind(kind)}
                          disabled={submitting}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Text style={[styles.bevChipText, active && styles.bevChipTextActive]}>
                            {BEVERAGE_KIND_LABELS[kind]}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* What the drink DOES — follows the tags until flipped by
                      hand, then the hand answer sticks. */}
                  <View style={styles.keepRow}>
                    <View style={styles.keepBody}>
                      <Text style={styles.keepLabel}>Counts as a meal</Text>
                      <Text style={styles.keepSub}>
                        Fills the eating window its time lands in. Off, it rides
                        along without touching the plan.
                      </Text>
                    </View>
                    <Switch
                      value={form.bevCountsAsMeal}
                      onValueChange={(v) => form.setBevCountsOverride(v)}
                      disabled={submitting}
                    />
                  </View>
                </>
              )}

              {/* The gym-shake door: a typed log is gone the moment it is
                  saved, and re-buying the same thing next week means re-typing
                  it. The switch keeps it — the log still lands on today, and
                  the thing itself joins the Meal Library, searchable from this
                  very sheet next time. */}
              <View style={styles.keepRow}>
                <View style={styles.keepBody}>
                  <Text style={styles.keepLabel}>Keep this for next time</Text>
                  <Text style={styles.keepSub}>
                    Saves it to your Meal Library so you can log it again with one tap.
                  </Text>
                </View>
                <Switch
                  value={form.keep}
                  onValueChange={form.setKeep}
                  disabled={submitting}
                />
              </View>
              {form.keep && (
                <MealSourceFields
                  sourceKind={form.keepSourceKind}
                  onSourceKindChange={form.setKeepSourceKind}
                  sourceName={form.keepSourceName}
                  onSourceNameChange={form.setKeepSourceName}
                  suggestions={sourceSuggestions}
                  disabled={submitting}
                />
              )}
            </>
          ) : (
            <>
              <View style={styles.searchBar}>
                <Search size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={onQueryChange}
                  placeholder="Search foods and meals…"
                  placeholderTextColor={colors.textFaint}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                />
              </View>

              {searchingNow ? (
                <>
                  {/* One list, because a Thistle dish is ONE thing that happens
                      to be stored twice — as a meal and as the food that is its
                      only ingredient. Split under two headings it read as two
                      choices, and the one that looked quicker was the one that
                      never recorded which meal you had eaten. */}
                  <Text style={styles.label}>
                    {searching
                      ? "Searching…"
                      : mergedResults.length === 0
                        ? `Nothing matches "${query.trim()}"`
                        : "Results"}
                  </Text>
                  {mergedResults.map((r) =>
                    r.kind === "meal" ? (
                      <View key={`meal-${r.meal.id}`} style={styles.resultRow}>
                        {/* Two jobs, two controls. The row reads as navigation
                            — it ends in a chevron — so that is what the row
                            does, and logging gets a labelled button of its own.
                            One tap either way, and neither is a guess. */}
                        <TouchableOpacity
                          style={styles.resultTap}
                          onPress={() => onOpenMeal(r.meal.id)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${r.meal.name} to change the portion, day or time`}
                        >
                          <View style={styles.resultThumbWell}>
                            {faceOf(r.meal) ? (
                              <Image source={{ uri: faceOf(r.meal)! }} style={styles.resultThumb} />
                            ) : (
                              <Text style={styles.resultMonogram}>{monogram(r.meal.name)}</Text>
                            )}
                          </View>
                          <View style={styles.resultBody}>
                            <Text style={styles.resultName} numberOfLines={1}>{r.meal.name}</Text>
                            <Text style={styles.resultMeta} numberOfLines={1}>
                              {macroLine(computeMealTotals(r.meal.items))}
                            </Text>
                          </View>
                          <ChevronRight size={icons.md} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.logButton, loggingMealId !== null && styles.logButtonBusy]}
                          onPress={() => onLogMeal(r.meal)}
                          disabled={loggingMealId !== null}
                          accessibilityRole="button"
                          accessibilityLabel={`Log ${r.meal.name} to ${labelFor(mealType)}, ${dayLabel} at ${fmtClock(loggedAt)}`}
                        >
                          <Text style={styles.logButtonText}>
                            {loggingMealId === r.meal.id ? "…" : "Log"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      // A food has no page behind it, so there is nothing to
                      // navigate to and no chevron to promise it: the whole row
                      // and its button do the one thing.
                      <TouchableOpacity
                        key={`food-${r.food.id}`}
                        style={styles.resultRow}
                        onPress={() => onLogFood(r.food)}
                        disabled={loggingFoodId !== null}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Log ${r.food.name} to ${labelFor(mealType)}, ${dayLabel} at ${fmtClock(loggedAt)}`}
                      >
                        <View style={styles.resultThumbWell}>
                          {r.food.image_primary_url ? (
                            <Image source={{ uri: r.food.image_primary_url }} style={styles.resultThumb} />
                          ) : (
                            <Text style={styles.resultMonogram}>{monogram(r.food.name)}</Text>
                          )}
                        </View>
                        <View style={styles.resultBody}>
                          <Text style={styles.resultName} numberOfLines={1}>{r.food.name}</Text>
                          <Text style={styles.resultMeta} numberOfLines={1}>
                            {macroLine({
                              calories: r.food.calories ?? 0,
                              protein: r.food.protein ?? 0,
                            })}
                          </Text>
                        </View>
                        <View style={[styles.logButton, loggingFoodId !== null && styles.logButtonBusy]}>
                          <Text style={styles.logButtonText}>
                            {loggingFoodId === r.food.id ? "…" : "Log"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ),
                  )}
                </>
              ) : (
                <>
                  <Text style={styles.label}>Recent</Text>
                  {quickFoods.length === 0 ? (
                    <Text style={styles.emptyNote}>
                      Nothing logged yet — search above, or type it in below.
                    </Text>
                  ) : (
                    <View style={styles.grid}>
                      {quickFoods.map((f) => foodChip(f, f.is_favorite))}
                    </View>
                  )}
                  <Text style={styles.hint}>One tap logs it, with its own numbers.</Text>
                </>
              )}
            </>
          )}
        </ScrollView>

        {manualOpen ? (
          <View style={styles.actions}>
            <View style={styles.actionButton}>
              <Button
                variant="secondary"
                label="Cancel"
                onPress={() => onManualOpenChange(false)}
                disabled={submitting}
                fluid
              />
            </View>
            <View style={styles.actionButton}>
              <Button
                label="Log Meal"
                onPress={onSubmitManual}
                loading={submitting}
                disabled={form.mealName.trim().length === 0}
                fluid
              />
            </View>
          </View>
        ) : (
          <View style={styles.footerRows}>
            <TouchableOpacity
              style={styles.footerRow}
              onPress={() => onManualOpenChange(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Type something new"
            >
              <Text style={styles.footerRowText}>Type something new</Text>
              <ChevronRight size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerRow, styles.footerRowLast]}
              onPress={onScan}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Scan a barcode"
            >
              <ScanBarcode size={icons.sm} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
              <Text style={styles.footerRowText}>Scan a barcode</Text>
              <ChevronRight size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  scrimFill: { flex: 1 },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "80%",
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  // The manual form needs the height; the quick paths deliberately don't take
  // it, so the rail stays visible behind them.
  sheetTall: { maxHeight: "94%" },
  grab: {
    width: 38,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    alignSelf: "center",
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  headRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  title: { ...typography.titleBar, color: colors.text, flex: 1 },
  headAction: { ...typography.buttonSm, color: colors.brand },

  ctxPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  ctxText: { ...typography.buttonSm, color: colors.text },
  ctxPanel: { marginTop: spacing.md, gap: spacing.sm },

  // Edit Meal's segmented control, unchanged — create and edit are siblings.
  segTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: 2,
    borderRadius: radii.pill,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },

  body: { marginTop: spacing.md, flexShrink: 1 },

  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text },

  label: { ...typography.section, marginTop: spacing.lg, marginBottom: spacing.sm },
  subLabel: { ...typography.caption, marginBottom: spacing.xs },
  // Same line geometry as MealBuilder's switch rows, so "keep this" reads as
  // the same kind of decision there and here.
  keepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  bevChips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bevChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bevChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  bevChipText: { ...typography.buttonSm, color: colors.textMuted },
  bevChipTextActive: { color: colors.onBrand },
  keepBody: { flex: 1, gap: 2 },
  keepLabel: { ...typography.body, color: colors.text },
  keepSub: { ...typography.caption, color: colors.textFaint },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token — see STYLE_GUIDE §6
    color: colors.text,
  },
  row: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.md },
  half: { flex: 1 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    // Two per row with the gap accounted for, without a percentage width
    // double-counting the separation (rule 24).
    flexGrow: 1,
    flexBasis: "45%",
    maxWidth: "48%",
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  chipThumb: { width: 26, height: 26, borderRadius: radii.pill, backgroundColor: colors.imageWell },
  chipName: { ...typography.body, color: colors.text, flex: 1 },
  chipCals: { ...typography.caption, color: colors.textFaint },
  hint: { ...typography.caption, color: colors.textFaint, marginTop: spacing.sm },
  emptyNote: { ...typography.caption },

  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  resultBody: { flex: 1, minWidth: 0 },
  // The row's body is the log target and the chevron is its own; they are
  // separate touchables so their labels can say different things.
  resultTap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: spacing.md },
  resultThumbWell: {
    width: 40, height: 40, borderRadius: radii.control, overflow: "hidden",
    backgroundColor: colors.imageWell, alignItems: "center", justifyContent: "center",
  },
  resultThumb: { width: "100%", height: "100%" },
  resultMonogram: { ...typography.caption, fontWeight: "700", color: colors.textFaint },
  // Labelled, because the row beside it navigates: an unlabelled second target
  // is what made one row look like one button.
  logButton: {
    marginLeft: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.control,
    backgroundColor: tint(colors.brand),
    borderWidth: 1, borderColor: tint(colors.brand, 0.4),
  },
  logButtonBusy: { opacity: 0.6 },
  logButtonText: { ...typography.buttonSm, color: colors.brand },
  resultName: { ...typography.rowTitle, color: colors.text },
  resultMeta: { ...typography.caption, marginTop: 2 },

  footerRows: { marginTop: spacing.md },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footerRowLast: { borderBottomWidth: 1, borderBottomColor: colors.border },
  footerRowText: { ...typography.body, color: colors.text, flex: 1 },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionButton: { flex: 1 },
});
