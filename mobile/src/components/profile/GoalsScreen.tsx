// mobile/src/components/profile/GoalsScreen.tsx
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import { intOrNull, kgToLbs, lbsToKg } from "@/src/lib/bodyUnits";
import { OZ_PER_LITER } from "@/src/lib/waterUnits";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button, Card, Screen, SectionHeader } from "@/src/components/ui";

interface GoalsScreenProps {
  userId: string;
  initialData: {
    target_weight_kg: string;
    target_calories: string;
    target_protein_g: string;
    target_carbs_g: string;
    target_sodium_mg: string;
    target_fats_g: string;
    target_sugars_g: string;
    target_fiber_g: string;
    target_water_oz: string;
    water_workout_bonus_oz: string;
  };
  onClose: () => void;
  onSave: () => void;
}

type WaterUnit = "oz" | "L";

export function GoalsScreen({ userId, initialData, onClose, onSave }: GoalsScreenProps) {
  const insets = useSafeAreaInsets();
  const [formData, setFormData] = useState(initialData);
  const [waterUnit, setWaterUnit] = useState<WaterUnit>("oz");
  const [waterInput, setWaterInput] = useState(initialData.target_water_oz);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initialWeightLbs = (() => {
    const kg = parseFloat(initialData.target_weight_kg);
    if (!isNaN(kg) && kg > 0) return Math.round(kgToLbs(kg)).toString();
    return "";
  })();
  const [weightLbs, setWeightLbs] = useState(initialWeightLbs);

  const handleWaterUnitChange = (next: WaterUnit) => {
    if (next === waterUnit) return;
    const parsed = parseFloat(waterInput);
    if (!isNaN(parsed)) {
      setWaterInput(
        next === "L"
          ? (parsed / OZ_PER_LITER).toFixed(2)
          : Math.round(parsed * OZ_PER_LITER).toString()
      );
    }
    setWaterUnit(next);
  };

  const handleSave = async () => {
    setError(null);
    try {
      setSaving(true);

      let waterOz: number | null = null;
      if (waterInput.trim() !== "") {
        const parsed = parseFloat(waterInput);
        if (isNaN(parsed) || parsed <= 0) {
          setError("Water goal must be a positive number.");
          return;
        }
        waterOz =
          waterUnit === "oz" ? Math.round(parsed) : Math.round(parsed * OZ_PER_LITER);
      }

      const bonusOz =
        formData.water_workout_bonus_oz.trim() === ""
          ? 0
          : Math.max(0, Math.round(parseFloat(formData.water_workout_bonus_oz) || 0));

      let weightKg: number | null = null;
      const lbsN = parseFloat(weightLbs);
      if (!isNaN(lbsN) && lbsN > 0) {
        weightKg = Math.round(lbsToKg(lbsN) * 10) / 10;
      }

      const { error: dbError } = await supabase
        .from("profiles")
        .update({
          target_weight_kg: weightKg,
          target_calories: intOrNull(formData.target_calories),
          target_protein_g: intOrNull(formData.target_protein_g),
          target_carbs_g: intOrNull(formData.target_carbs_g),
          target_sodium_mg: intOrNull(formData.target_sodium_mg),
          target_fats_g: intOrNull(formData.target_fats_g),
          target_sugars_g: intOrNull(formData.target_sugars_g),
          target_fiber_g: intOrNull(formData.target_fiber_g),
          ...(waterOz !== null && { target_water_oz: waterOz }),
          water_workout_bonus_oz: bonusOz,
        })
        .eq("id", userId);

      if (dbError) throw dbError;

      onSave();
      onClose();
    } catch {
      setError("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen variant="detail" title="Goals" onBack={onClose} scroll={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <SectionHeader title="Body" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.label}>Target Weight (lbs)</Text>
            <TextInput
              style={styles.input}
              placeholder="175"
              placeholderTextColor={colors.textMuted}
              value={weightLbs}
              onChangeText={setWeightLbs}
              keyboardType="decimal-pad"
              editable={!saving}
            />
          </Card>

          <SectionHeader title="Nutrition" />
          <Card variant="panel" style={styles.sectionCard}>
            <Text style={styles.label}>Daily Calorie Goal</Text>
            <TextInput
              style={styles.input}
              placeholder="2000"
              placeholderTextColor={colors.textMuted}
              value={formData.target_calories}
              onChangeText={(t) => setFormData({ ...formData, target_calories: t })}
              keyboardType="number-pad"
              editable={!saving}
            />
            <Text style={styles.label}>Daily Protein Goal (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="150"
              placeholderTextColor={colors.textMuted}
              value={formData.target_protein_g}
              onChangeText={(t) => setFormData({ ...formData, target_protein_g: t })}
              keyboardType="number-pad"
              editable={!saving}
            />
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="225"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_carbs_g}
                  onChangeText={(t) => setFormData({ ...formData, target_carbs_g: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sodium (mg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2300"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_sodium_mg}
                  onChangeText={(t) => setFormData({ ...formData, target_sodium_mg: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Fats (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="65"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_fats_g}
                  onChangeText={(t) => setFormData({ ...formData, target_fats_g: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
              <View style={styles.halfField}>
                <Text style={styles.label}>Sugars (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="50"
                  placeholderTextColor={colors.textMuted}
                  value={formData.target_sugars_g}
                  onChangeText={(t) => setFormData({ ...formData, target_sugars_g: t })}
                  keyboardType="number-pad"
                  editable={!saving}
                />
              </View>
            </View>
            <Text style={styles.label}>Fiber (g)</Text>
            <TextInput
              style={styles.input}
              placeholder="30"
              placeholderTextColor={colors.textMuted}
              value={formData.target_fiber_g}
              onChangeText={(t) => setFormData({ ...formData, target_fiber_g: t })}
              keyboardType="number-pad"
              editable={!saving}
            />
          </Card>

          <SectionHeader title="Hydration" />
          <Card variant="panel" style={styles.sectionCard}>
            <View style={styles.labelRow}>
              <Text style={styles.labelInline}>Daily Water Goal</Text>
              <View style={styles.segmentTrack}>
                {(["oz", "L"] as WaterUnit[]).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[styles.segment, waterUnit === unit && styles.segmentActive]}
                    onPress={() => handleWaterUnitChange(unit)}
                    disabled={saving}
                    accessibilityRole="button"
                    accessibilityLabel={`Enter water goal in ${unit}`}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        waterUnit === unit && styles.segmentTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TextInput
              style={styles.input}
              placeholder={waterUnit === "oz" ? "64" : "2"}
              placeholderTextColor={colors.textMuted}
              value={waterInput}
              onChangeText={setWaterInput}
              keyboardType="decimal-pad"
              editable={!saving}
            />
            <Text style={styles.label}>Workout Water Bonus (oz)</Text>
            <Text style={styles.fieldHelp}>
              Extra oz added to your goal automatically on days you work out. Set to 0
              to disable.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              value={formData.water_workout_bonus_oz}
              onChangeText={(t) =>
                setFormData({ ...formData, water_workout_bonus_oz: t })
              }
              keyboardType="number-pad"
              editable={!saving}
            />
          </Card>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <Button label="Save Changes" onPress={handleSave} loading={saving} fluid />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  sectionCard: { marginBottom: spacing.sm },
  // Rule 19: one form-label token app-wide. The label owns the field rhythm.
  label: {
    ...typography.section,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  labelInline: { ...typography.section, marginTop: 0, marginBottom: 0 },
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
  row: { flexDirection: "row", gap: spacing.md },
  halfField: { flex: 1 },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  // Rule 21 segmented control: surface2 track, active = solid brand + onBrand.
  segmentTrack: {
    flexDirection: "row",
    backgroundColor: colors.surface2,
    borderRadius: radii.control,
    padding: 2,
    gap: 2,
  },
  segment: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.control - 2,
  },
  segmentActive: { backgroundColor: colors.brand },
  segmentText: { ...typography.buttonSm, color: colors.textMuted },
  segmentTextActive: { color: colors.onBrand },
  fieldHelp: { ...typography.caption, marginBottom: spacing.sm },
  errorText: { ...typography.body, color: colors.danger, textAlign: "center" },
});
