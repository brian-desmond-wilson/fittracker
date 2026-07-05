import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
} from "react-native";
import { Plus } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import {
  WaterUnit,
  BEVERAGE_TYPES,
  BeverageType,
  beverageLabel,
  beverageColor,
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
      <Text style={styles.sectionTitle}>Log a Custom Amount</Text>
      <View style={styles.chipsRow}>
        {BEVERAGE_TYPES.map((t) => {
          const active = addType === t;
          return (
            <TouchableOpacity
              key={t}
              onPress={() => onChangeType(t)}
              style={[
                styles.chip,
                active && {
                  backgroundColor: beverageColor(t),
                  borderColor: beverageColor(t),
                },
              ]}
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
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder={`Amount (${displayUnit})`}
            placeholderTextColor={colors.mutedForeground}
            keyboardType="decimal-pad"
            value={addAmount}
            onChangeText={onChangeAmount}
          />
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={onSubmit}
          activeOpacity={0.7}
        >
          <Plus size={20} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  chipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.foreground,
  },
  chipTextActive: {
    color: "#FFFFFF",
  },
  form: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  inputContainer: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  addButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
