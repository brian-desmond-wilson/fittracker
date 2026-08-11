import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Undo2 } from "lucide-react-native";
import { colors, elevation, radii, spacing, typography } from "@/src/theme/tokens";
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
   * The shadow is back, and legitimately: the token module now carries
   * `elevation.overlay`, added for exactly this case — a transient surface
   * floating over content, which no fill can express once `surface2` is
   * already the fill of every other raised panel. The old shadow was dropped
   * because its `shadowColor` was a raw black literal, not because the effect
   * was wrong; the colour now lives in the token module like every other.
   *
   * The `border` outline still contributes essentially nothing here, since
   * `colors.border` on `colors.surface2` differs by about one step per
   * channel; it is retained only so the snackbar matches every other raised
   * surface. It is still the last sibling in the screen's root `View`, so it
   * paints on top.
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
    ...elevation.overlay,
  },
  text: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  },
});
