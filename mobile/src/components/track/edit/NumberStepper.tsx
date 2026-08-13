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
import { nudgeOnGrid, sanitizeInteger } from "@/src/lib/numericInput";

interface NumberStepperProps {
  value: string;
  onChange: (next: string) => void;
  min?: number;
  /** Ceiling, for values with one — a percentage stops at 100. */
  max?: number;
  /** How far one press moves. Presses SNAP to multiples of this (see
   *  `nudgeOnGrid`), so a typed 83 lands on 85 rather than 88. */
  step?: number;
  /** Rendered immediately after the number, inside the pill ("%"). */
  suffix?: string;
  label: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  suffix,
  label,
}: NumberStepperProps) {
  // The field holds a string because it is also a text input mid-typing, where
  // "" and "1" are both legitimate states. Nudging parses, clamps and writes
  // back a canonical integer; typing is left alone until then.
  const nudge = (direction: 1 | -1) => {
    const parsed = Number.parseInt(value, 10);
    const base = Number.isNaN(parsed) ? min : parsed;
    onChange(String(nudgeOnGrid(base, direction, { step, min, max })));
  };

  const current = Number.parseInt(value, 10) || 0;
  const atFloor = current <= min;
  const atCeiling = max != null && current >= max;

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
      <View style={styles.valueWrap}>
        <TextInput
          style={[styles.value, suffix ? styles.valueWithSuffix : null]}
          value={value}
          onChangeText={(t) => {
            const digits = sanitizeInteger(t);
            if (max == null || digits === "") return onChange(digits);
            // Typing past the ceiling clamps rather than being swallowed: a
            // silently ignored keystroke reads as a broken field.
            const n = Number.parseInt(digits, 10);
            onChange(String(Math.min(max, n)));
          }}
          keyboardType="number-pad"
          selectTextOnFocus
          accessibilityLabel={label}
        />
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </View>

      <TouchableOpacity
        onPress={() => nudge(1)}
        disabled={atCeiling}
        style={[styles.circ, styles.circOn, atCeiling && styles.circOff]}
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
  // With a suffix the pair is centred as a unit: the number gives up `flex`
  // and sits right against its suffix, instead of centring itself and leaving
  // the "%" hanging off to one side.
  valueWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
  },
  valueWithSuffix: { flex: 0, minWidth: 40, textAlign: "right" },
  suffix: { ...typography.rowTitle, color: colors.text },
});
