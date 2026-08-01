// mobile/src/components/ui/IconButton.tsx
import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, tint } from "@/src/theme/tokens";

interface IconButtonProps {
  icon: LucideIcon;
  onPress: () => void;
  variant?: "square" | "circle";
  /**
   * `danger` marks a destructive action. `danger` is a semantic token, not one
   * of the four domain accents the "every control is brand" rule governs, and
   * spec §5.1 makes it the legitimate color for destructive controls. An
   * icon-only delete has no label to carry that meaning, so it needs the color.
   * Both variants keep the calm `tint()` treatment — never a filled red.
   */
  tone?: "default" | "danger";
  accessibilityLabel: string;
  disabled?: boolean;
}

export function IconButton({
  icon: Icon, onPress, variant = "square", tone = "default",
  accessibilityLabel, disabled = false,
}: IconButtonProps) {
  const circle = variant === "circle";
  const danger = tone === "danger";
  return (
    <TouchableOpacity
      style={[
        circle ? styles.circle : styles.square,
        danger && (circle ? styles.circleDanger : styles.squareDanger),
        disabled && styles.disabled,
      ]}
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
        size={circle ? icons.sm : icons.md}
        color={danger ? colors.danger : circle ? colors.brand : colors.onBrand}
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
  squareDanger: { backgroundColor: tint(colors.danger) },
  circleDanger: { backgroundColor: tint(colors.danger) },
  disabled: { opacity: 0.5 },
});
