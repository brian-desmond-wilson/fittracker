// Subcategory filtering moved out of a third horizontal lane and into a sheet.
// The pills strip cost a permanent row of vertical space and still clipped its
// own options off the right edge — you could not see what you were choosing
// from. A sheet gives every subcategory a full-width row, its item count, and
// room to grow, at the cost of one tap on a control used far less often than
// the segment chips beside it.
//
// Toggles apply live to the grid behind the sheet; there is no Apply button,
// so "Done" is only a dismissal.
import React from "react";
import {
  Modal, ScrollView, StyleSheet, Text, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from "react-native";
import { Check } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";
import type { FoodSubcategory } from "@/src/types/track";

interface SubcategoryFilterSheetProps {
  visible: boolean;
  /** Subcategories of the currently selected category. */
  subcategories: FoodSubcategory[];
  selectedSubcategoryIds: string[];
  /** subcategoryId -> how many items in this category carry it. */
  countsBySubcategoryId?: Map<string, number>;
  onToggle: (subcategoryId: string) => void;
  onClearAll: () => void;
  onClose: () => void;
}

export function SubcategoryFilterSheet({
  visible,
  subcategories,
  selectedSubcategoryIds,
  countsBySubcategoryId,
  onToggle,
  onClearAll,
  onClose,
}: SubcategoryFilterSheetProps) {
  const selectedCount = selectedSubcategoryIds.length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Text style={[typography.rowTitle, styles.title]}>Filter</Text>
          {selectedCount > 0 && (
            <TouchableOpacity
              onPress={onClearAll}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
            >
              <Text style={styles.clear}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.list}>
          {subcategories.map((sub) => {
            const on = selectedSubcategoryIds.includes(sub.id);
            const count = countsBySubcategoryId?.get(sub.id);
            return (
              <TouchableOpacity
                key={sub.id}
                style={styles.row}
                onPress={() => onToggle(sub.id)}
                activeOpacity={0.7}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={
                  count === undefined ? sub.name : `${sub.name}, ${count} items`
                }
              >
                <View style={[styles.checkbox, on && styles.checkboxOn]}>
                  {on && <Check size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />}
                </View>
                <Text style={[typography.body, styles.rowLabel]} numberOfLines={1}>
                  {sub.name}
                </Text>
                {count !== undefined && <Text style={typography.caption}>{count}</Text>}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Button label="Done" onPress={onClose} fluid />
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
    gap: spacing.md,
    maxHeight: "80%",
  },
  grabber: {
    width: 36, height: 4, borderRadius: radii.pill,
    backgroundColor: colors.surface2, alignSelf: "center",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  title: { color: colors.text },
  clear: { ...typography.buttonSm, color: colors.brand },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  checkbox: {
    width: 22, height: 22, borderRadius: radii.control / 2,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center", justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowLabel: { flex: 1, minWidth: 0, color: colors.text },
});
