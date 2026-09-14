// mobile/src/components/ui/ClockInput.tsx
// Minutes and seconds, side by side — the pair SetTimeSheet types a set's
// duration into, lifted so the score sheet asks for a finish time the same
// way. Text in, text out: the caller parses with parseClock, which is where
// "blank means none" and "75 seconds carries" live.
import React from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { colors, radii } from "@/src/theme/tokens";

interface ClockInputProps {
  mins: string;
  secs: string;
  onChange: (next: { mins: string; secs: string }) => void;
  disabled?: boolean;
  /** Read out before "minutes" / "seconds". */
  label?: string;
}

export function ClockInput({ mins, secs, onChange, disabled = false, label = "" }: ClockInputProps) {
  const prefix = label ? `${label} ` : "";
  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.field, disabled && styles.fieldDisabled]}
        value={mins}
        onChangeText={(v) => onChange({ mins: v, secs })}
        keyboardType="number-pad"
        selectTextOnFocus
        editable={!disabled}
        maxLength={3}
        accessibilityLabel={`${prefix}minutes`}
      />
      <Text style={styles.unit}>min</Text>
      <TextInput
        style={[styles.field, disabled && styles.fieldDisabled]}
        value={secs}
        onChangeText={(v) => onChange({ mins, secs: v })}
        keyboardType="number-pad"
        selectTextOnFocus
        editable={!disabled}
        maxLength={2}
        accessibilityLabel={`${prefix}seconds`}
      />
      <Text style={styles.unit}>sec</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  field: {
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    borderRadius: radii.control, paddingVertical: 12, paddingHorizontal: 18,
    fontSize: 20, color: colors.text, minWidth: 74, textAlign: "center",
  },
  fieldDisabled: { opacity: 0.5 },
  unit: { fontSize: 13, color: colors.textMuted },
});
