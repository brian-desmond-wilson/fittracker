import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Plus } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import { Button, SectionHeader } from "@/src/components/ui";
import {
  WaterUnit,
  BEVERAGE_TYPES,
  BeverageType,
  beverageLabel,
} from "@/src/lib/waterUnits";

interface WaterCustomLogFormProps {
  addType: BeverageType;
  addAmount: string;
  displayUnit: WaterUnit;
  onChangeType: (t: BeverageType) => void;
  onChangeAmount: (s: string) => void;
  onSubmit: () => void;
}

export function WaterCustomLogForm({
  addType,
  addAmount,
  displayUnit,
  onChangeType,
  onChangeAmount,
  onSubmit,
}: WaterCustomLogFormProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <SectionHeader title="Log a Custom Amount" />
      </View>
      <View style={styles.chipsRow}>
        {BEVERAGE_TYPES.map((t) => {
          const active = addType === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => onChangeType(t)}
              style={[styles.chip, active && styles.chipActive]}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.chipText, active && styles.chipTextActive]}
              >
                {beverageLabel(t)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder={`Amount (${displayUnit})`}
          placeholderTextColor={colors.textMuted}
          keyboardType="decimal-pad"
          value={addAmount}
          onChangeText={onChangeAmount}
        />
        <Button label="Add" icon={Plus} onPress={onSubmit} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: spacing.screenGutter,
    marginBottom: spacing.xxl,
  },
  // `SectionHeader` takes no style prop; the wrapper owns its spacing.
  sectionHeader: {
    marginBottom: spacing.md,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface2,
  },
  // Grouped, mutually-exclusive selector → solid brand fill + `onBrand` label.
  chipActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMuted,
  },
  chipTextActive: {
    color: colors.onBrand,
  },
  form: {
    flexDirection: "row",
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  // Takes the row's free width itself; it needed no wrapper to do that.
  input: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16, // §4.5 defines no input token
    color: colors.text,
  },
});
