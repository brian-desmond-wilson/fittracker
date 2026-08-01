// mobile/src/components/ui/EmptyState.tsx
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon: Icon, title, body, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      {Icon ? <Icon size={40} color={colors.textFaint} strokeWidth={1.5} /> : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? <Button label={action.label} onPress={action.onPress} size="sm" /> : null}
    </View>
  );
}

/** The one loading treatment: brand spinner + muted caption. */
export function LoadingState({ label = "Loading..." }: { label?: string }) {
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size="large" color={colors.brand} />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1, alignItems: "center", justifyContent: "center",
    gap: spacing.md, padding: spacing.xxxl, backgroundColor: colors.bg,
  },
  title: { ...typography.rowTitle, color: colors.text, textAlign: "center" },
  body: { ...typography.body, color: colors.textMuted, textAlign: "center" },
});
