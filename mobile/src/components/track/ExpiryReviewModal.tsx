// The review surface behind the Inventory screen's attention banner
// (critique A2): a bottom sheet listing every item the shared expiry policy
// says needs attention, each row carrying its verbs — use it, toss it, or
// put a replacement on the shopping list — so the alert is no longer an
// alert without an action. Sheet mechanics mirror the Loop Hub's
// StationDetailSheet (sibling scrim + intrinsic-height sheet inside RN's
// flex-column Modal container).
import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, View } from "react-native";
import { Minus, ShoppingCart, Trash2 } from "lucide-react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
import { Badge, IconButton } from "@/src/components/ui";
import type { InventoryItemWithState } from "@/src/lib/supabase/inventory";

interface ExpiryReviewModalProps {
  visible: boolean;
  items: InventoryItemWithState[];
  onClose: () => void;
  onConsume: (item: InventoryItemWithState) => void;
  onToss: (item: InventoryItemWithState) => void;
  onShop: (item: InventoryItemWithState) => void;
  /** B5: row body opens the item's detail screen (closes the sheet first). */
  onOpenItem: (item: InventoryItemWithState) => void;
  /** E6: itemId -> names of meals that consume it (via concept links).
   *  Empty/absent renders nothing — no meals is not an error. */
  mealsByItemId?: Map<string, string[]>;
}

const badgeFor = (it: InventoryItemWithState): { label: string; tone: "danger" | "warning" } => {
  const { expiration, daysLeft } = it.state;
  if (expiration === "expired") return { label: "Expired", tone: "danger" };
  if (expiration === "today") return { label: "Today", tone: "warning" };
  return { label: `${daysLeft}d left`, tone: "warning" };
};

export function ExpiryReviewModal({
  visible, items, onClose, onConsume, onToss, onShop, onOpenItem, mealsByItemId,
}: ExpiryReviewModalProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={[typography.rowTitle, styles.title]}>Needs attention</Text>
        <Text style={typography.caption}>
          Use it, toss it, or put a replacement on the list.
        </Text>
        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {items.map((it) => {
            const b = badgeFor(it);
            return (
              <View key={it.id} style={styles.row}>
                <TouchableOpacity
                  style={styles.rowText}
                  onPress={() => { onClose(); onOpenItem(it); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${it.name}`}
                >
                  <View style={styles.rowNameBlock}>
                    <View style={styles.rowNameLine}>
                      <Text style={[typography.body, styles.rowName]} numberOfLines={1}>{it.name}</Text>
                      <Badge label={b.label} tone={b.tone} />
                    </View>
                    {/* E6: the obvious next move — cook the thing that uses it. */}
                    {(mealsByItemId?.get(it.id)?.length ?? 0) > 0 && (
                      <Text style={typography.caption} numberOfLines={1}>
                        Use it in: {mealsByItemId!.get(it.id)!.join(", ")}
                      </Text>
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.rowActions}>
                  <IconButton
                    icon={Minus} variant="circle"
                    onPress={() => onConsume(it)}
                    accessibilityLabel={`Use one ${it.name}`}
                    disabled={it.state.totalQuantity === 0}
                  />
                  <IconButton
                    icon={Trash2} variant="circle" tone="danger"
                    onPress={() => onToss(it)}
                    accessibilityLabel={`Toss ${it.name}`}
                    disabled={it.state.totalQuantity === 0}
                  />
                  <IconButton
                    icon={ShoppingCart} variant="circle"
                    onPress={() => onShop(it)}
                    accessibilityLabel={`Add ${it.name} to shopping list`}
                  />
                </View>
              </View>
            );
          })}
          {items.length === 0 ? (
            <Text style={[typography.caption, styles.empty]}>
              Nothing needs attention. The loop is clean.
            </Text>
          ) : null}
        </ScrollView>
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
    gap: spacing.sm,
    maxHeight: "70%",
  },
  grabber: {
    width: 36, height: 4, borderRadius: radii.pill,
    backgroundColor: colors.surface2, alignSelf: "center",
  },
  title: { color: colors.text },
  list: { marginTop: spacing.sm },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowNameBlock: { gap: 2 },
  rowNameLine: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  rowName: { color: colors.text, flexShrink: 1 },
  rowActions: { flexDirection: "row", gap: spacing.sm },
  empty: { paddingVertical: spacing.lg, textAlign: "center" },
});
