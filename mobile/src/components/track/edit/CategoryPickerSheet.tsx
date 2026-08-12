// Choosing a category without scrolling a twelve-deep accordion.
//
// The picker used to open on Produce, Dairy, Meat, Breads with nothing
// selected in view, so discovering that an item was already Frozen › Breakfast
// Foods meant scrolling and expanding your way down to it. This is a flat,
// searchable list of every choice instead — and every subcategory carries its
// parent, which is the only thing separating "Frozen › Breakfast Foods" from
// the standalone "Breakfast Foods" category with the same name.
import React, { useState } from "react";
import {
  Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity,
  TouchableWithoutFeedback, View,
} from "react-native";
import { Check, Search } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";
import { filterOptions } from "@/src/lib/vocabMatch";
import type { FoodCategory, FoodSubcategory } from "@/src/types/track";

export interface CategoryChoice {
  key: string;
  label: string;
  kind: "category" | "subcategory";
  id: string;
  /** Parent category id — subcategories only. */
  categoryId?: string;
  selected: boolean;
}

interface CategoryPickerSheetProps {
  visible: boolean;
  categories: FoodCategory[];
  subcategories: FoodSubcategory[];
  selectedCategoryIds: string[];
  selectedSubcategoryIds: string[];
  onToggleCategory: (categoryId: string) => void;
  onToggleSubcategory: (subcategoryId: string, categoryId: string) => void;
  onClose: () => void;
}

/**
 * One flat list: each category, then its subcategories directly beneath it,
 * qualified by parent. Nesting is what forced the expand-and-hunt; the
 * hierarchy survives in the label, where search can reach it.
 */
export function buildChoices(
  categories: FoodCategory[],
  subcategories: FoodSubcategory[],
  selectedCategoryIds: string[],
  selectedSubcategoryIds: string[],
): CategoryChoice[] {
  const out: CategoryChoice[] = [];
  for (const cat of categories) {
    out.push({
      key: `c:${cat.id}`,
      label: cat.name,
      kind: "category",
      id: cat.id,
      selected: selectedCategoryIds.includes(cat.id),
    });
    for (const sub of subcategories.filter((s) => s.category_id === cat.id)) {
      out.push({
        key: `s:${sub.id}`,
        label: `${cat.name} › ${sub.name}`,
        kind: "subcategory",
        id: sub.id,
        categoryId: cat.id,
        selected: selectedSubcategoryIds.includes(sub.id),
      });
    }
  }
  return out;
}

export function CategoryPickerSheet({
  visible, categories, subcategories,
  selectedCategoryIds, selectedSubcategoryIds,
  onToggleCategory, onToggleSubcategory, onClose,
}: CategoryPickerSheetProps) {
  const [query, setQuery] = useState("");

  const all = buildChoices(categories, subcategories, selectedCategoryIds, selectedSubcategoryIds);
  // Selected first when not searching, so opening the sheet answers "what is
  // this item currently?" before it asks "what should it be?".
  const ordered = query.trim().length > 0
    ? filterOptions(all, query, (c) => c.label)
    : [...all].sort((a, b) => Number(b.selected) - Number(a.selected));

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
        <View style={styles.scrim} />
      </TouchableWithoutFeedback>
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={[typography.rowTitle, styles.title]}>Categories</Text>

        <View style={styles.searchBar}>
          <Search size={icons.sm} color={colors.textFaint} strokeWidth={icons.strokeWidth} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search categories"
            placeholderTextColor={colors.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
          {ordered.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={styles.row}
              onPress={() =>
                c.kind === "category"
                  ? onToggleCategory(c.id)
                  : onToggleSubcategory(c.id, c.categoryId as string)
              }
              accessibilityRole="checkbox"
              accessibilityState={{ checked: c.selected }}
              accessibilityLabel={c.label}
            >
              <View style={[styles.box, c.selected && styles.boxOn]}>
                {c.selected && (
                  <Check size={icons.sm} color={colors.onBrand} strokeWidth={icons.strokeWidth} />
                )}
              </View>
              <Text
                style={[
                  styles.rowLabel,
                  c.kind === "category" && styles.rowLabelTop,
                  c.selected && styles.rowLabelOn,
                ]}
                numberOfLines={1}
              >
                {c.label}
              </Text>
            </TouchableOpacity>
          ))}
          {ordered.length === 0 && (
            <Text style={styles.empty}>Nothing matches “{query.trim()}”.</Text>
          )}
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
    maxHeight: "82%",
  },
  grabber: {
    width: 36, height: 4, borderRadius: radii.pill,
    backgroundColor: colors.surface2, alignSelf: "center",
  },
  title: { color: colors.text },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1, borderColor: colors.border, borderRadius: radii.control,
    paddingHorizontal: spacing.md,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, paddingVertical: spacing.md },
  list: { flexGrow: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  box: {
    width: 22, height: 22, borderRadius: radii.control / 2,
    borderWidth: 1.5, borderColor: colors.border,
    backgroundColor: colors.surface2,
    alignItems: "center", justifyContent: "center",
  },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowLabel: { ...typography.body, color: colors.textMuted, flex: 1, minWidth: 0 },
  rowLabelTop: { color: colors.text, fontWeight: "600" },
  rowLabelOn: { color: colors.text },
  empty: { ...typography.caption, color: colors.textMuted, paddingVertical: spacing.lg },
});
