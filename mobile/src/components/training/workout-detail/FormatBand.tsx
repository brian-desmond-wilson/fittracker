// mobile/src/components/training/workout-detail/FormatBand.tsx
// The strip above the movement list (spec 2026-09-13 §4.8): the format in
// green caps, a plain-English gloss under it, the movement count on the
// right. Untagged with no rounds: the count alone.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radii } from "@/src/theme/tokens";
import type { FormatBanner } from "@/src/lib/workoutFormat";

interface FormatBandProps {
  banner: FormatBanner | null;
  movementCount: number;
}

export function FormatBand({ banner, movementCount }: FormatBandProps) {
  const count = `${movementCount} movement${movementCount === 1 ? "" : "s"}`;
  return (
    <View
      style={styles.band}
      accessible
      accessibilityLabel={banner ? `${banner.badge}. ${banner.gloss}. ${count}` : count}
    >
      {banner ? (
        <View style={styles.words}>
          <Text style={styles.badge}>{banner.badge}</Text>
          <Text style={styles.gloss} numberOfLines={2}>{banner.gloss}</Text>
        </View>
      ) : (
        <Text style={styles.badge}>{count.toUpperCase()}</Text>
      )}
      {banner && <Text style={styles.count}>{count}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md,
    backgroundColor: colors.surface, borderRadius: radii.row, paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  words: { flex: 1, minWidth: 0 },
  badge: { fontSize: 13, fontWeight: "800", letterSpacing: 1, color: colors.brand },
  gloss: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  count: { fontSize: 11, color: colors.textMuted, flexShrink: 0 },
});
