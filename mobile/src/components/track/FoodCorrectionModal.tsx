import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
  TextInput,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { BEVERAGE_KINDS, BEVERAGE_KIND_LABELS } from "@/src/types/meal-library";
import type { BeverageKind } from "@/src/types/track";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";

export interface FoodCorrectionValues {
  name: string;
  brand: string | null;
  serving_size: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fats: number | null;
  sugars: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  fiber_g: number | null;
  /** Null is food; kinds make it a drink. See beverageDoors.ts for what the
   *  label decides. */
  beverage_kinds: BeverageKind[] | null;
}

interface FoodCorrectionModalProps {
  visible: boolean;
  initialValues: FoodCorrectionValues;
  saving: boolean;
  onClose: () => void;
  onSave: (next: FoodCorrectionValues) => void;
}

function numOrNull(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  const n = parseFloat(t);
  return isNaN(n) ? null : n;
}

function toStr(v: number | null | undefined): string {
  return v != null ? String(v) : "";
}

export function FoodCorrectionModal({
  visible,
  initialValues,
  saving,
  onClose,
  onSave,
}: FoodCorrectionModalProps) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [servingSize, setServingSize] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");
  const [sodiumMg, setSodiumMg] = useState("");
  const [fiberG, setFiberG] = useState("");
  const [saturatedFatG, setSaturatedFatG] = useState("");
  const [bevKinds, setBevKinds] = useState<BeverageKind[]>([]);

  useEffect(() => {
    if (visible) {
      setName(initialValues.name ?? "");
      setBrand(initialValues.brand ?? "");
      setServingSize(initialValues.serving_size ?? "");
      setCalories(toStr(initialValues.calories));
      setProtein(toStr(initialValues.protein));
      setCarbs(toStr(initialValues.carbs));
      setFats(toStr(initialValues.fats));
      setSugars(toStr(initialValues.sugars));
      setSodiumMg(toStr(initialValues.sodium_mg));
      setFiberG(toStr(initialValues.fiber_g));
      setSaturatedFatG(toStr(initialValues.saturated_fat_g));
      setBevKinds(initialValues.beverage_kinds ?? []);
    }
  }, [visible, initialValues]);

  const handleSave = () => {
    onSave({
      name: name.trim() || initialValues.name,
      brand: brand.trim() === "" ? null : brand.trim(),
      serving_size: servingSize.trim() === "" ? null : servingSize.trim(),
      calories: numOrNull(calories),
      protein: numOrNull(protein),
      carbs: numOrNull(carbs),
      fats: numOrNull(fats),
      sugars: numOrNull(sugars),
      saturated_fat_g: numOrNull(saturatedFatG),
      sodium_mg: numOrNull(sodiumMg),
      fiber_g: numOrNull(fiberG),
      // Empty selection is "this is food", stored as null — the DB forbids an
      // empty array, and food is exactly what no kinds means.
      beverage_kinds: bevKinds.length > 0 ? bevKinds : null,
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.backdrop}
      >
        <Card variant="panel" style={styles.card}>
          <Text style={styles.title}>Edit Nutrition</Text>
          <Text style={styles.subtitle}>
            Values are per serving. Future scans of this food will use your
            corrected values.
          </Text>

          {/* `handled` is mandatory in the sheet recipe: a scroller between a
              live keyboard and a control eats the first tap on that control.
              No `autoFocus` here, so this is the latent case, not a live one. */}
          <ScrollView style={styles.sheetScroll} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Food name"
              placeholderTextColor={colors.textMuted}
              editable={!saving}
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Brand</Text>
                <TextInput
                  style={styles.input}
                  value={brand}
                  onChangeText={setBrand}
                  placeholder="Optional"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Serving Size</Text>
                <TextInput
                  style={styles.input}
                  value={servingSize}
                  onChangeText={setServingSize}
                  placeholder="e.g. 1 bottle (237 mL)"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
            </View>

            <Text style={styles.label}>Calories (per serving)</Text>
            <TextInput
              style={styles.input}
              value={calories}
              onChangeText={setCalories}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              editable={!saving}
            />

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Fats (g)</Text>
                <TextInput
                  style={styles.input}
                  value={fats}
                  onChangeText={setFats}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sodium (mg)</Text>
                <TextInput
                  style={styles.input}
                  value={sodiumMg}
                  onChangeText={setSodiumMg}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sugars (g)</Text>
                <TextInput
                  style={styles.input}
                  value={sugars}
                  onChangeText={setSugars}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Fiber (g)</Text>
                <TextInput
                  style={styles.input}
                  value={fiberG}
                  onChangeText={setFiberG}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Saturated Fat (g)</Text>
                <TextInput
                  style={styles.input}
                  value={saturatedFatG}
                  onChangeText={setSaturatedFatG}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  editable={!saving}
                />
              </View>
              {/* Nine fields do not divide into pairs; the empty half keeps
                  this input the width of every other one. */}
              <View style={styles.halfField} />
            </View>

            {/* What the product IS, not how it was logged once: kinds here
                decide which quick-log door offers it. No kinds = food.
                Meal Replacement Shake is the one label that opens both doors
                and fills the window it lands in by default. */}
            <Text style={styles.label}>It's a beverage</Text>
            <View style={styles.kindWrap}>
              {BEVERAGE_KINDS.map((k) => {
                const on = bevKinds.includes(k);
                return (
                  <TouchableOpacity
                    key={k}
                    style={[styles.kindChip, on && styles.kindChipOn]}
                    onPress={() =>
                      setBevKinds((prev) =>
                        on ? prev.filter((x) => x !== k) : [...prev, k],
                      )
                    }
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={BEVERAGE_KIND_LABELS[k]}
                  >
                    <Text style={[styles.kindText, on && styles.kindTextOn]}>
                      {BEVERAGE_KIND_LABELS[k]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.kindHint}>
              Leave all off for food. Drinks show in the Beverage door; a Meal
              Replacement Shake shows in meal logging too.
            </Text>
          </ScrollView>

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
              <Button label="Save" onPress={handleSave} loading={saving} fluid />
            </View>
          </View>
        </Card>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  kindWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  kindChip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radii.pill, backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border,
  },
  kindChipOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  kindText: { ...typography.caption, color: colors.textMuted },
  kindTextOn: { color: colors.brand },
  kindHint: { ...typography.caption, color: colors.textFaint, marginTop: spacing.sm },
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  /**
   * Width + a cap the sheet can never exceed. `maxHeight: "100%"` resolves
   * against the backdrop's content box (screen minus its `spacing.xl` padding),
   * which replaces the hand-picked `maxHeight: 460`/`500` those numbers could
   * not adapt: on a 568pt device the chrome alone (title, actions, padding)
   * eats ~146pt, so a 460pt scroller still pushed the footer off-screen.
   */
  card: {
    width: "100%",
    maxHeight: "100%",
  },
  /** Shrinks first, so the title and the footer buttons always render. */
  sheetScroll: {
    flexShrink: 1,
  },
  title: {
    ...typography.titleBar,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  subtitle: {
    ...typography.caption,
    marginBottom: spacing.lg,
  },
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  /** `Button` can stretch (`fluid`) but cannot flex; the wrapper supplies it. */
  actionButton: { flex: 1 },
});
