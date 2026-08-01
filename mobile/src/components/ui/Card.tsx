// mobile/src/components/ui/Card.tsx
import React from "react";
import { StyleSheet, TouchableOpacity, View, ViewStyle } from "react-native";
import { AccentKey, colors, radii, spacing, tint } from "@/src/theme/tokens";

interface CardProps {
  variant: "row" | "panel" | "tile";
  /** tile only: identity fill + glyph color source */
  accent?: AccentKey;
  onPress?: () => void;
  style?: ViewStyle;
  children: React.ReactNode;
}

export function Card({ variant, accent, onPress, style, children }: CardProps) {
  const base: ViewStyle[] = [
    variant === "row" ? styles.row : variant === "panel" ? styles.panel : styles.tile,
  ];
  if (variant === "tile") {
    base.push({ backgroundColor: tint(colors.accents[accent ?? "brand"]) });
  }
  if (style) base.push(style);
  if (onPress) {
    return (
      <TouchableOpacity style={base} onPress={onPress} activeOpacity={0.7}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={base}>{children}</View>;
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surface, borderRadius: radii.row,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  panel: {
    backgroundColor: colors.surface, borderRadius: radii.panel,
    padding: spacing.lg, borderWidth: 1, borderColor: colors.border,
  },
  tile: {
    borderRadius: radii.panel, padding: spacing.lg,
    aspectRatio: 1, minHeight: 140, maxHeight: 180,
    justifyContent: "space-between",
  },
});
