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

export function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const c = toneColor(tone);
  return (
    <View style={[styles.pill, { backgroundColor: tint(c) }]}>
      <Text style={[styles.label, { color: c }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3,
    alignSelf: "flex-start",
  },
  label: { fontSize: 12, fontWeight: "600" },
});
