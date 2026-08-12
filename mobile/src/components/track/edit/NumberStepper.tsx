// A number you nudge, not a number you type.
//
// Quantity and restock threshold are small integers adjusted by one or two.
// A numeric keyboard for those means: tap the field, wait for the keyboard,
// select the old value, type, dismiss. The stepper is one tap, and the field
// stays typable for the occasional jump from 2 to 24.
import React from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import { sanitizeInteger } from "@/src/lib/numericInput";

interface NumberStepperProps {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  label: string;
}

export function NumberStepper({ value, onChange, min = 0, label }: NumberStepperProps) {
  // The field holds a string because it is also a text input mid-typing, where
  // "" and "1" are both legitimate states. Nudging parses, clamps and writes
  // back a canonical integer; typing is left alone until then.
  const nudge = (delta: number) => {
    const parsed = Number.parseInt(value, 10);
    const base = Number.isNaN(parsed) ? min : parsed;
    onChange(String(Math.max(min, base + delta)));
  };

  const atFloor = (Number.parseInt(value, 10) || 0) <= min;

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={() => nudge(-1)}
        disabled={atFloor}
        style={[styles.circ, atFloor && styles.circOff]}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${label}`}
      >
        <Minus size={icons.sm} color={colors.text} strokeWidth={icons.strokeWidth} />
      </TouchableOpacity>

      {/* Sanitised, not merely hinted: `keyboardType` picks a keyboard and
          constrains nothing, so a hardware keyboard or a paste could otherwise
          leave letters in a field that `nudge` then reads as `min`. */}
      <TextInput
        style={styles.value}
        value={value}
        onChangeText={(t) => onChange(sanitizeInteger(t))}
        keyboardType="number-pad"
        selectTextOnFocus
        accessibilityLabel={label}
      />

      <TouchableOpacity
        onPress={() => nudge(1)}
        style={[styles.circ, styles.circOn]}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${label}`}
      >
        <Plus size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.pill,
    padding: spacing.xs,
  },
  circ: {
    width: 34, height: 34, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: colors.border,
  },
  circOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  circOff: { opacity: 0.4 },
  value: {
    flex: 1, textAlign: "center", fontSize: 16, fontWeight: "600", color: colors.text,
    paddingVertical: spacing.sm,
  },
});
