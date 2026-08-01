import React from "react";
import { StyleSheet, Text } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { AccentKey, colors, icons, spacing, typography } from "@/src/theme/tokens";
import { Card } from "@/src/components/ui";

interface TrackingCardProps {
  title: string;
  icon: LucideIcon;
  accent: AccentKey;
  onPress: () => void;
}

export function TrackingCard({ title, icon: Icon, accent, onPress }: TrackingCardProps) {
  return (
    <Card variant="tile" accent={accent} onPress={onPress} style={styles.grow}>
      <Icon size={32} color={colors.accents[accent]} strokeWidth={icons.strokeWidth} />
      <Text style={styles.title}>{title}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  title: { ...typography.rowTitle, color: colors.text, marginTop: spacing.sm },
});
