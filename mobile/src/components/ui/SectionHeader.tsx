// mobile/src/components/ui/SectionHeader.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { typography } from "@/src/theme/tokens";

interface SectionHeaderProps {
  title: string;
  /**
   * Right-hand action slot. A slot rather than a `{ label, onPress }` shape:
   * real call sites need `disabled`, icons and the destructive variant, and
   * re-declaring those here would rebuild `Button` inside this component.
   * Pass a `<Button variant="ghost" size="sm" … />` (or any node).
   */
  action?: React.ReactNode;
  /** rendered beside the title (e.g. a count Badge) */
  badge?: React.ReactNode;
}

export function SectionHeader({ title, action, badge }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <Text style={typography.section}>{title}</Text>
        {badge}
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
});
