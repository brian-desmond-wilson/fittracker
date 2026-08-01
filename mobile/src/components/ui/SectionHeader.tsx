// mobile/src/components/ui/SectionHeader.tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, typography } from "@/src/theme/tokens";

interface SectionHeaderProps {
  title: string;
  action?: { label: string; onPress: () => void };
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
      {action ? (
        <TouchableOpacity onPress={action.onPress} activeOpacity={0.7} accessibilityRole="button">
          <Text style={styles.action}>{action.label}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  left: { flexDirection: "row", alignItems: "center", gap: 8 },
  action: { fontSize: 14, fontWeight: "600", color: colors.brand },
});
