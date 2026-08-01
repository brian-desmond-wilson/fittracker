// mobile/src/components/ui/IconButton.tsx
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, tint } from "@/src/theme/tokens";

interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  variant?: "square" | "circle";
  accessibilityLabel: string;
  disabled?: boolean;
}

export function IconButton({
  icon: Icon, onPress, variant = "square", accessibilityLabel, disabled = false,
}: IconButtonProps) {
  const circle = variant === "circle";
  return (
    <TouchableOpacity
      style={[circle ? styles.circle : styles.square, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      // circle is 32pt visually; pad the touch target to >= 44pt
      hitSlop={circle ? { top: 6, bottom: 6, left: 6, right: 6 } : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      <Icon
        size={circle ? icons.sm : 22}
        color={circle ? colors.brand : colors.onBrand}
        strokeWidth={icons.strokeWidth}
      />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  square: {
    width: 44, height: 44, borderRadius: radii.control,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  circle: {
    width: 32, height: 32, borderRadius: radii.pill,
    backgroundColor: tint(colors.brand), alignItems: "center", justifyContent: "center",
  },
  disabled: { opacity: 0.5 },
});
