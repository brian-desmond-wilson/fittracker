// mobile/src/components/ui/RefreshIndicator.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";

/**
 * The one pull-to-refresh treatment. Same brand spinner and muted caption as
 * `LoadingState`, so a refresh looks like every other wait in the app.
 *
 * Why the app draws this at all: Apple's `RefreshControl` spinner does not
 * render on current iOS builds (verified by probe — `onRefresh` fires, the
 * gesture works, nothing appears, on screens old and new alike). The gesture
 * still belongs to `RefreshControl`; only the visible feedback is ours.
 *
 * Floats rather than sitting in the flow: a refresh must not shove the page
 * down and back. Place it as a sibling immediately before the scroll
 * container so it positions against that container's parent, and keep that
 * parent below any fixed header you do not want it covering.
 */
export function RefreshIndicator({
  visible,
  label = "Refreshing...",
}: {
  visible: boolean;
  label?: string;
}) {
  if (!visible) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.caption}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: spacing.lg,
    left: 0,
    right: 0,
    zIndex: 1,
    alignItems: "center",
    gap: spacing.md,
  },
  caption: { ...typography.caption, textAlign: "center" },
});
