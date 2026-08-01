// mobile/src/components/track/loop/Connector.tsx
// The data-bearing link between two station rows (spec §3): a short rule plus
// the label naming what actually flows down the pipe ("assemblability → 1 of 2
// meals ready"). Six stations, six connectors — station 6's is the loop
// CLOSING back to station 1, not a dangling tail.
import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/src/theme/tokens";

export function Connector({ label }: { label: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.line} />
      <Text style={styles.label}>{label} ▾</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.xs,
    // indent to the icon-circle centerline: card padding (12) + half of 34
    paddingLeft: spacing.md + 17,
  },
  line: { width: 2, height: 20, backgroundColor: colors.border },
  label: {
    // Monospace is deliberate — these labels are machine-ish data flow, not
    // prose. `tokens.ts` has no mono entry, so the family is resolved here the
    // same way the app's one other monospace surface does
    // (`track/meals/ManualFoodEntryModal.tsx:363`): "Menlo" does not exist on
    // Android and would silently fall back to the default sans there.
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    // Literal size: below `typography.caption`'s 12, and there is no smaller
    // token. The style-guide greps police color, not type scale.
    fontSize: 11,
    color: colors.textFaint,
  },
});
