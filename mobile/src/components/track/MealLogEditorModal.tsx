// Edit Meal — the portion sheet.
//
// This used to be seven raw macro fields, so the only way to record "I ate
// half" was to divide seven numbers by two yourself. It now asks the question
// the sheet exists for — how much of it did you actually eat — and derives
// every macro from the answer. The arithmetic, including what 100% anchors to
// and why editing twice can't compound, lives in `lib/mealPortion.ts`.
//
// Raw amounts are not gone, only demoted: a hand-typed log has no source of
// truth, so a percentage of it is a percentage of a guess. "Edit exact
// amounts" opens the old fields for exactly that case.
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";
import { MealLog, MealType } from "@/src/types/track";
import {
  baseMacros,
  clampPercent,
  isDeletion,
  PORTION_MAX,
  PORTION_PRESETS,
  PORTION_STEP,
  portionImpactLine,
  portionPercentOf,
  scaleMacros,
  servingsForPercent,
  type PortionMacros,
} from "@/src/lib/mealPortion";
import { NumberStepper } from "./edit/NumberStepper";
import { monogram } from "@/src/lib/vendorMonogram";

export interface MealLogEdit extends PortionMacros {
  name: string;
  meal_type: MealType;
  servings: number;
  logged_at: string;
}

interface MealLogEditorModalProps {
  visible: boolean;
  meal: MealLog | null;
  saving: boolean;
  /** Borrowed product photo for this log, or null (falls back to initials). */
  faceUrl?: string | null;
  /** The day's calorie total and goal, for the impact line. */
  dayCalories?: number;
  goalCalories?: number | null;
  onClose: () => void;
  onSave: (updates: MealLogEdit) => void;
  /** Setting the portion to none is a deletion, not a zero-calorie receipt. */
  onDelete?: (mealId: string) => void;
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
  { value: "snack", label: "Snack" },
  { value: "dessert", label: "Dessert" },
];

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

const fmtG = (v: number | null): string => {
  if (v == null) return "—";
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

function fmtClock(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}


export function MealLogEditorModal({
  visible,
  meal,
  saving,
  faceUrl = null,
  dayCalories = 0,
  goalCalories = null,
  onClose,
  onSave,
  onDelete,
}: MealLogEditorModalProps) {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("breakfast");
  const [percent, setPercent] = useState(100);
  const [loggedAt, setLoggedAt] = useState<Date>(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showExact, setShowExact] = useState(false);
  // Raw fields, live only while the exact-amounts escape hatch is open. They
  // seed from the CURRENT scaled values, because that is what "exact" means
  // once a portion has been applied.
  const [exact, setExact] = useState<Record<keyof PortionMacros, string>>({
    calories: "", protein: "", carbs: "", fats: "", sugars: "",
    saturated_fat_g: "", sodium_mg: "", fiber_g: "",
  });

  useEffect(() => {
    if (!meal) return;
    setName(meal.name);
    setMealType(meal.meal_type);
    setPercent(portionPercentOf(meal.servings));
    setLoggedAt(new Date(meal.logged_at));
    setShowTimePicker(false);
    setShowExact(false);
  }, [meal]);

  // The 100% amounts — what the "was" line reports and everything scales from.
  const base = useMemo<PortionMacros | null>(
    () => (meal ? baseMacros(meal, meal.servings) : null),
    [meal],
  );
  const scaled = useMemo<PortionMacros | null>(
    () => (base ? scaleMacros(base, percent) : null),
    [base, percent],
  );

  // Seeding happens when the hatch opens, not on every keystroke.
  const openExact = () => {
    if (scaled) {
      setExact({
        calories: scaled.calories?.toString() ?? "",
        protein: scaled.protein?.toString() ?? "",
        carbs: scaled.carbs?.toString() ?? "",
        fats: scaled.fats?.toString() ?? "",
        sugars: scaled.sugars?.toString() ?? "",
        saturated_fat_g: scaled.saturated_fat_g?.toString() ?? "",
        sodium_mg: scaled.sodium_mg?.toString() ?? "",
        fiber_g: scaled.fiber_g?.toString() ?? "",
      });
    }
    setShowExact(true);
  };

  const deleting = isDeletion(percent);
  const impact = scaled && meal
    ? portionImpactLine({
        storedCalories: meal.calories,
        nextCalories: scaled.calories,
        dayCalories,
        goalCalories,
      })
    : null;

  const handleSave = () => {
    if (!meal || !scaled) return;
    if (deleting) {
      onDelete?.(meal.id);
      return;
    }
    // Typed amounts win over the derived ones and are stored at 100%: the
    // number you typed IS what you ate, so leaving a multiplier on it would
    // make the sheet re-scale your own figures the next time it opened.
    const macros: PortionMacros = showExact
      ? {
          calories: numOrNull(exact.calories),
          protein: numOrNull(exact.protein),
          carbs: numOrNull(exact.carbs),
          fats: numOrNull(exact.fats),
          sugars: numOrNull(exact.sugars),
          saturated_fat_g: numOrNull(exact.saturated_fat_g),
          sodium_mg: numOrNull(exact.sodium_mg),
          fiber_g: numOrNull(exact.fiber_g),
        }
      : scaled;
    onSave({
      ...macros,
      name: name.trim(),
      meal_type: mealType,
      servings: showExact ? 1 : servingsForPercent(percent),
      logged_at: loggedAt.toISOString(),
    });
  };

  const exactField = (key: keyof PortionMacros, label: string) => (
    <View style={styles.halfField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={exact[key]}
        onChangeText={(t) => setExact((prev) => ({ ...prev, [key]: t }))}
        keyboardType="decimal-pad"
        placeholder="0"
        placeholderTextColor={colors.textMuted}
        editable={!saving}
      />
    </View>
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <Card variant="panel" style={styles.card}>
          <Text style={styles.title}>Edit Meal</Text>
          {/* `handled` is mandatory in the sheet recipe: a scroller between a
              live keyboard and a control eats the first tap on that control. */}
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            {/* Artwork beside the name rather than above it — it keeps the
                portion control above the fold on a small phone, which is the
                whole reason this sheet gets opened. */}
            <View style={styles.identityRow}>
              <View style={styles.face}>
                {faceUrl ? (
                  <Image source={{ uri: faceUrl }} style={styles.faceImage} resizeMode="cover" />
                ) : (
                  <Text style={styles.faceInitials}>{monogram(name || "?")}</Text>
                )}
              </View>
              <View style={styles.identityBody}>
                <Text style={styles.labelFirst}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                  placeholder="Meal name"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                  multiline
                />
              </View>
            </View>

            {/* Grouped, mutually exclusive, shared track: the segmented
                treatment (rule 21), which also fits all five on one line
                where the old chips wrapped onto two. */}
            <Text style={styles.label}>Meal Type</Text>
            <View style={styles.segTrack}>
              {MEAL_TYPES.map((t) => {
                const active = mealType === t.value;
                return (
                  <TouchableOpacity
                    key={t.value}
                    onPress={() => setMealType(t.value)}
                    style={[styles.segment, active && styles.segmentActive]}
                    disabled={saving}
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

            <Text style={styles.label}>How much did you eat?</Text>
            <View style={styles.presetRow}>
              {PORTION_PRESETS.map((p) => {
                const active = percent === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPercent(p)}
                    style={[styles.preset, active && styles.presetActive]}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${p} percent`}
                  >
                    <Text style={[styles.presetText, active && styles.presetTextActive]}>
                      {p}%
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* The same stepper Food Inventory uses for quantity — one
                component, so the two screens can't drift apart. */}
            <View style={styles.stepperWrap}>
              <NumberStepper
                value={String(clampPercent(percent))}
                onChange={(next) => setPercent(next === "" ? 0 : clampPercent(Number(next)))}
                min={0}
                max={PORTION_MAX}
                step={PORTION_STEP}
                suffix="%"
                label="portion percentage"
              />
            </View>

            {/* Derived, never typed — with the original struck through beside
                it whenever the two differ, so the sheet admits it is an edit. */}
            {scaled && base && (
              <View style={styles.derivedRow}>
                <View style={styles.derivedBody}>
                  <Text style={styles.derivedCaption}>Counts as</Text>
                  <Text style={styles.derivedValue}>
                    {scaled.calories ?? 0} cal · {fmtG(scaled.protein)}g P · {fmtG(scaled.fiber_g)}g fiber
                  </Text>
                </View>
                {percent !== 100 && (
                  <View style={styles.wasBody}>
                    <Text style={styles.derivedCaption}>Was</Text>
                    <Text style={styles.wasValue}>{base.calories ?? 0} cal</Text>
                  </View>
                )}
              </View>
            )}

            <Text style={styles.label}>Eaten at</Text>
            <TouchableOpacity
              style={styles.input}
              onPress={() => setShowTimePicker(true)}
              disabled={saving}
              accessibilityRole="button"
              accessibilityLabel={`Eaten at ${fmtClock(loggedAt)}`}
            >
              <Text style={styles.inputText}>{fmtClock(loggedAt)}</Text>
            </TouchableOpacity>

            {showExact && (
              <>
                <Text style={styles.exactNote}>
                  Typed amounts replace the portion — they are stored as the whole meal.
                </Text>
                <Text style={styles.label}>Calories</Text>
                <TextInput
                  style={styles.input}
                  value={exact.calories}
                  onChangeText={(t) => setExact((prev) => ({ ...prev, calories: t }))}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
                <View style={styles.row}>
                  {exactField("protein", "Protein (g)")}
                  {exactField("carbs", "Carbs (g)")}
                </View>
                <View style={styles.row}>
                  {exactField("fats", "Fats (g)")}
                  {exactField("sugars", "Sugars (g)")}
                </View>
                <View style={styles.row}>
                  {exactField("sodium_mg", "Sodium (mg)")}
                  {exactField("fiber_g", "Fiber (g)")}
                </View>
                <View style={styles.row}>
                  {exactField("saturated_fat_g", "Saturated Fat (g)")}
                  {/* Eight fields, seven of them paired. */}
                  <View style={styles.halfField} />
                </View>
              </>
            )}
          </ScrollView>

          {deleting ? (
            <View style={styles.impactDanger}>
              <Text style={styles.impactDangerText}>
                None of it — saving will delete this log
              </Text>
            </View>
          ) : impact ? (
            <View style={impact.worse ? styles.impactWarning : styles.impact}>
              <Text style={impact.worse ? styles.impactWarningText : styles.impactText}>
                {impact.text}
              </Text>
            </View>
          ) : null}

          <View style={styles.actions}>
            <View style={styles.actionButton}>
              <Button
                variant="secondary"
                label="Cancel"
                onPress={onClose}
                disabled={saving}
                fluid
              />
            </View>
            <View style={styles.actionButton}>
              <Button
                label={deleting ? "Delete" : "Save"}
                variant={deleting ? "destructive" : "primary"}
                onPress={handleSave}
                loading={saving}
                fluid
              />
            </View>
          </View>

          {!showExact && (
            <TouchableOpacity
              onPress={openExact}
              disabled={saving}
              style={styles.exactLink}
              accessibilityRole="button"
              accessibilityLabel="Edit exact amounts"
            >
              <Text style={styles.exactLinkText}>Edit exact amounts</Text>
            </TouchableOpacity>
          )}
        </Card>

        {/* Time picker as a bottom action sheet. Rendered INSIDE this modal
            rather than as a second `Modal`: nesting modals on iOS makes the
            two fight over the presentation layer, and the sheet has to sit
            over the card it belongs to anyway. */}
        {showTimePicker && (
          <>
            <TouchableOpacity
              style={styles.sheetScrim}
              activeOpacity={1}
              onPress={() => setShowTimePicker(false)}
              accessibilityRole="button"
              accessibilityLabel="Close the time picker"
            />
            <View style={styles.timeSheet}>
              <Text style={styles.timeSheetTitle}>Eaten at</Text>
              <DateTimePicker
                value={loggedAt}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(_e, picked) => {
                  if (Platform.OS !== "ios") setShowTimePicker(false);
                  if (!picked) return;
                  // Keep the log's own date; only the clock time moves.
                  const next = new Date(loggedAt);
                  next.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                  setLoggedAt(next);
                }}
                textColor={colors.text}
              />
              <Button label="Done" onPress={() => setShowTimePicker(false)} fluid />
            </View>
          </>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  card: { width: "100%", maxHeight: "100%" },
  sheetScroll: { flexShrink: 1 },
  title: { ...typography.titleBar, color: colors.text, marginBottom: spacing.md },

  identityRow: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  identityBody: { flex: 1 },
  face: {
    width: 88,
    height: 88,
    borderRadius: radii.row,
    backgroundColor: colors.imageWell,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  faceImage: { width: "100%", height: "100%" },
  faceInitials: { ...typography.titleRoot, color: colors.labelInk },

  labelFirst: { ...typography.section, marginBottom: spacing.xs },
  label: { ...typography.section, marginTop: spacing.md, marginBottom: spacing.xs },
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
  inputText: { fontSize: 16, color: colors.text },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },

  // Same segmented control as Edit Product's Location, down to the pill
  // radius and the bordered trough — copied deliberately so the two screens
  // read as one app. Only the label size differs: five segments where that
  // one has four, so 12pt is what holds a single line at 393pt.
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

  presetRow: { flexDirection: "row", gap: spacing.sm },
  // Standalone toggles, not a shared track: tinted-brand active state.
  preset: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radii.control,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  presetActive: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  presetText: { ...typography.buttonSm, color: colors.text },
  presetTextActive: { color: colors.brand },

  stepperWrap: { marginTop: spacing.sm },

  derivedRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md,
    marginTop: spacing.md,
  },
  derivedBody: { flex: 1 },
  wasBody: { alignItems: "flex-end" },
  derivedCaption: { ...typography.caption, color: colors.textFaint },
  derivedValue: { ...typography.body, color: colors.text, fontWeight: "700" },
  wasValue: { ...typography.body, color: colors.textMuted, textDecorationLine: "line-through" },

  exactNote: { ...typography.caption, color: colors.warning, marginTop: spacing.md },

  impact: {
    backgroundColor: tint(colors.brand),
    borderWidth: 1,
    borderColor: tint(colors.brand, 0.3),
    borderRadius: radii.row,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  impactText: { ...typography.buttonSm, color: colors.brand },
  impactWarning: {
    backgroundColor: tint(colors.warning),
    borderWidth: 1,
    borderColor: tint(colors.warning, 0.3),
    borderRadius: radii.row,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  impactWarningText: { ...typography.buttonSm, color: colors.warning },
  impactDanger: {
    backgroundColor: tint(colors.danger),
    borderWidth: 1,
    borderColor: tint(colors.danger, 0.3),
    borderRadius: radii.row,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  impactDangerText: { ...typography.buttonSm, color: colors.danger },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  actionButton: { flex: 1 },
  exactLink: { alignItems: "center", paddingTop: spacing.md, paddingBottom: spacing.xs },
  exactLinkText: { ...typography.buttonSm, color: colors.brand },

  // Bottom action sheet for the time picker. Absolute inside the modal root,
  // so it covers the card without a second Modal.
  sheetScrim: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  timeSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    borderTopLeftRadius: radii.panel,
    borderTopRightRadius: radii.panel,
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  timeSheetTitle: { ...typography.titleBar, color: colors.text, textAlign: "center" },
});
