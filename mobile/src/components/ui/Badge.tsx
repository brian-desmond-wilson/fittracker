// mobile/src/components/ui/Badge.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { AccentKey, colors, radii, tint } from "@/src/theme/tokens";

export type BadgeTone = "warning" | "danger" | "success" | "neutral" | AccentKey;

const toneColor = (tone: BadgeTone): string => {
  switch (tone) {
    case "warning": return colors.warning;
    case "danger": return colors.danger;
    case "success": return colors.success;
    case "neutral": return colors.textMuted;
    default: return colors.accents[tone];
  }
};

export function Badge({
  label,
  tone,
  suffix,
}: {
  label: string;
  tone: BadgeTone;
  /**
   * Quiet trailing text inside the same pill — a unit or a scale ("/100"),
   * not a second label. Smaller and dimmer so the value still reads first,
   * and nested so it inherits the tone colour rather than picking its own.
   */
  suffix?: string;
}) {
  const c = toneColor(tone);
  return (
    <View style={[styles.pill, { backgroundColor: tint(c) }]}>
      <Text style={[styles.label, { color: c }]}>
        {label}
        {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3,
    alignSelf: "flex-start",
  },
  label: { fontSize: 12, fontWeight: "600" },
  suffix: { fontSize: 10, fontWeight: "500", opacity: 0.6 },
});
