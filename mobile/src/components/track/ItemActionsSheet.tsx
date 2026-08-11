// Themed replacement for the native long-press menu (critique A9): the
// system ActionSheetIOS rendered light-appearance chrome on a dark app and
// couldn't be themed. Same house bottom-sheet mechanics as the loop hub's
// StationDetailSheet; rows are generic {label, icon, destructive, onPress}
// so the sheet stays dumb — the screen owns what an item can do.
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";

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
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.panel, borderTopRightRadius: radii.panel,
    borderWidth: 1, borderBottomWidth: 0, borderColor: colors.border,
    padding: spacing.lg, paddingBottom: spacing.xxl,
    gap: spacing.xs,
  },
  grabber: {
    width: 36, height: 4, borderRadius: radii.pill,
    backgroundColor: colors.surface2, alignSelf: "center",
    marginBottom: spacing.sm,
  },
  title: { color: colors.textMuted, marginBottom: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowLabel: { color: colors.text },
  rowLabelDanger: { color: colors.danger },
});
