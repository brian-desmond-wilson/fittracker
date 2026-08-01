import React from "react";
import { View, Text, StyleSheet } from "react-native";
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
  if (!visible) return null;
  return (
    <View style={styles.snackbar}>
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
   * same call Task 5 made for the inventory tile's tag overlay). The `surface2`
   * fill and the `border` outline are what separate it from `bg`. It is still
   * the last sibling in the screen's root `View`, so it paints on top.
   */
  snackbar: {
    position: "absolute",
    left: spacing.screenGutter,
    right: spacing.screenGutter,
    bottom: spacing.xxl,
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
