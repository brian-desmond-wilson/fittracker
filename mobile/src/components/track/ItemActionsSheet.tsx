// Themed replacement for the native long-press menu (critique A9): the
// system ActionSheetIOS rendered light-appearance chrome on a dark app and
// couldn't be themed. Rows are generic {label, icon, destructive, onPress}
// so the sheet stays dumb — the screen owns what an item can do.
import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, spacing, typography } from "@/src/theme/tokens";
import { BottomSheet } from "@/src/components/ui";

export interface ItemAction {
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
}

interface ItemActionsSheetProps {
  visible: boolean;
  title: string | null;
  actions: ItemAction[];
  onClose: () => void;
}

export function ItemActionsSheet({ visible, title, actions, onClose }: ItemActionsSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} closeLabel="Close item actions" style={styles.sheet} padded={false}>
      {title ? <Text style={[typography.rowTitle, styles.title]} numberOfLines={1}>{title}</Text> : null}
      {actions.map((a) => (
        <TouchableOpacity
          key={a.label}
          style={styles.row}
          onPress={() => { onClose(); a.onPress(); }}
          accessibilityRole="button"
          accessibilityLabel={a.label}
          activeOpacity={0.7}
        >
          <a.icon
            size={icons.md}
            color={a.destructive ? colors.danger : colors.text}
            strokeWidth={icons.strokeWidth}
          />
          <Text style={[typography.body, styles.rowLabel, a.destructive && styles.rowLabelDanger]}>
            {a.label}
          </Text>
        </TouchableOpacity>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { padding: spacing.lg, gap: spacing.xs },
  title: { color: colors.textMuted, marginBottom: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowLabel: { color: colors.text },
  rowLabelDanger: { color: colors.danger },
});
