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
import React from "react";
import {
  Animated,
  Image,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ChevronRight, ScanBarcode, Search, Star } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";
import type { MealType, SavedFood } from "@/src/types/track";
import type { MealWithItems } from "@/src/types/meal-library";
import type { MealAddFormState } from "./useMealAddForm";

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
  onOpenMeal: (mealId: string) => void;
  onScan: () => void;

  /** The manual path: same form state the old inline version used. */
  form: MealAddFormState;
  manualOpen: boolean;
  onManualOpenChange: (open: boolean) => void;
  onSubmitManual: () => void;
  submitting: boolean;
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
  onOpenMeal,
  onScan,
  form,
  manualOpen,
  onManualOpenChange,
  onSubmitManual,
  submitting,
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
            dragY.setValue(0);
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
  React.useEffect(() => {
    if (visible) {
      dragY.setValue(0);
      setContextOpen(false);
    }
  }, [visible, dragY]);

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
            <Text style={styles.title}>{manualOpen ? "Type something new" : "Log something"}</Text>
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
            accessibilityLabel={`Logging to ${labelFor(mealType)}, ${dayLabel} at ${fmtClock(loggedAt)}. Tap to change.`}
          >
            <Text style={styles.ctxText}>
              {labelFor(mealType)} · {dayLabel}, {fmtClock(loggedAt)}
            </Text>
            <ChevronRight
              size={icons.sm}
              color={colors.textFaint}
              strokeWidth={icons.strokeWidth}
            />
          </TouchableOpacity>
        </View>

        {contextOpen && (
          <View style={styles.ctxPanel}>
            <View style={styles.segTrack}>
              {MEAL_TYPES.map((t) => {
                const active = mealType === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => onMealTypeChange(t.value)}
                    style={[styles.segment, active && styles.segmentActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={t.label}
                  >
                    <Text
                      style={[styles.segmentText, active && styles.segmentTextActive]}
                      numberOfLines={1}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <DateTimePicker
              value={loggedAt}
              mode="time"
              display={Platform.OS === "ios" ? "spinner" : "default"}
              onChange={(_e, picked) => {
                if (!picked) return;
                const next = new Date(loggedAt);
                next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                onLoggedAtChange(next);
              }}
              textColor={colors.text}
            />
          </View>
        )}

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
                  {mealResults.length > 0 && (
                    <>
                      <Text style={styles.label}>Meals</Text>
                      {mealResults.slice(0, RESULTS_SHOWN).map((m) => (
                        <TouchableOpacity
                          key={m.id}
                          style={styles.resultRow}
                          onPress={() => onOpenMeal(m.id)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${m.name}`}
                        >
                          <View style={styles.resultBody}>
                            <Text style={styles.resultName} numberOfLines={1}>{m.name}</Text>
                            <Text style={styles.resultMeta}>
                              {m.items.length} ingredient{m.items.length === 1 ? "" : "s"} · {m.prep_minutes} min
                            </Text>
                          </View>
                          <ChevronRight size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                  <Text style={styles.label}>
                    {searching
                      ? "Searching…"
                      : searchResults.length === 0
                        ? `Nothing else matches "${query.trim()}"`
                        : "Foods"}
                  </Text>
                  <View style={styles.grid}>
                    {searchResults.slice(0, RESULTS_SHOWN * 2).map((f) => foodChip(f, false))}
                  </View>
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
  resultBody: { flex: 1 },
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
