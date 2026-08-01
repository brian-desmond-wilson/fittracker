// mobile/src/components/ui/Button.tsx
import React, { useState } from "react";
import {
  ActivityIndicator, LayoutChangeEvent, StyleSheet, Text, TouchableOpacity,
} from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";

export type ButtonVariant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: "md" | "sm";
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to fill the row (full-width CTAs). */
  fluid?: boolean;
  icon?: LucideIcon;
}

export function Button({
  label, onPress, variant = "primary", size = "md",
  loading = false, disabled = false, fluid = false, icon: Icon,
}: ButtonProps) {
  // Capture rendered width so swapping the label for a spinner doesn't reflow.
  // Assumes first layout happens with the label visible — mounting with
  // loading={true} would capture the spinner's width instead.
  const [minWidth, setMinWidth] = useState<number | undefined>(undefined);
  const onLayout = (e: LayoutChangeEvent) => {
    if (minWidth === undefined) setMinWidth(e.nativeEvent.layout.width);
  };
  const labelColor =
    variant === "primary" ? colors.onBrand
    : variant === "secondary" ? colors.text
    : variant === "destructive" ? colors.danger
    : colors.brand;
  const blocked = disabled || loading;
  return (
    <TouchableOpacity
      style={[
        styles.base, styles[variant], size === "sm" && styles.sm,
        fluid && styles.fluid, disabled && styles.disabled, { minWidth },
      ]}
      onPress={onPress}
      disabled={blocked}
      activeOpacity={0.7}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityState={{ disabled: blocked, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === "primary" ? colors.onBrand : colors.brand}
        />
      ) : (
        <>
          {Icon ? <Icon size={icons.md} color={labelColor} strokeWidth={icons.strokeWidth} /> : null}
          <Text style={[size === "sm" ? typography.buttonSm : typography.button, { color: labelColor }]}>
            {label}
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: spacing.sm, borderRadius: radii.control,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xl,
  },
  primary: { backgroundColor: colors.brand },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  destructive: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.danger },
  ghost: { backgroundColor: "transparent", paddingHorizontal: spacing.sm },
  sm: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  fluid: { alignSelf: "stretch" },
  disabled: { opacity: 0.5 },
});
