import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Undo2 } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";

interface WaterUndoSnackbarProps {
  visible: boolean;
  label: string;
  onUndo: () => void;
}

export function WaterUndoSnackbar({
  visible,
  label,
  onUndo,
}: WaterUndoSnackbarProps) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;
  return (
    <View style={[styles.snackbar, { bottom: insets.bottom + spacing.md }]}>
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
      <Button
        variant="ghost"
        size="sm"
        label="Undo"
        icon={Undo2}
        onPress={onUndo}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The drop shadow is gone: its `shadowColor` was a raw black literal and the
   * token module has no elevation scale (the system is deliberately flat, the
   * same call Task 5 made for the inventory tile's tag overlay). Separation
   * from `bg` is carried by the `surface2` FILL alone — the `border` outline
   * contributes essentially nothing here, since `colors.border` on
   * `colors.surface2` differs by about one step per channel; it is retained
   * only so the snackbar matches every other raised surface in the system. It
   * is still the last sibling in the screen's root `View`, so it paints on top.
   *
   * `bottom` is supplied at the call site as `insets.bottom + spacing.md`: a
   * flat `spacing.xxl` put the bar inside the 34pt home-indicator zone on a
   * notched device, which is exactly the clearance the same commit added to
   * the scroller.
   */
  snackbar: {
    position: "absolute",
    left: spacing.screenGutter,
    right: spacing.screenGutter,
    backgroundColor: colors.surface2,
    borderRadius: radii.row,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  text: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
