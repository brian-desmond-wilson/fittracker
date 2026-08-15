// Pick a shop by its logo.
//
// The vendors were a wrapping wall of text chips, which is both slow to read
// and what produced the mid-word breaks this replaces. A row of circular marks
// is how every share sheet and payment picker does it, and for good reason:
// you recognise Costco's logo before you finish reading the word.
//
// Horizontal scroll rather than wrap, so adding a sixth vendor lengthens the
// row instead of reflowing the form.
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ban } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { VendorMark } from "@/src/components/track/VendorMark";

interface VendorTilesProps {
  vendors: NutritionVendor[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** "No preference" is right on the item form, where a vendor is a
   *  preference. It is wrong on the delivery form, where somebody
   *  demonstrably delivered the box. */
  allowNone?: boolean;
}

const TILE = 60;

function VendorTile({
  label, selected, onPress, logoUrl, inactive,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  logoUrl?: string | null;
  inactive?: boolean;
}) {
  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={inactive ? `${label} (inactive)` : label}
    >
      {/* The disc, its logo and the monogram it falls back to all live in
          `VendorMark` — the same mark the Deliveries page draws, so a vendor
          picked here looks like the box it later sends. This tile owns only
          what is picker-specific: the ring and the label beneath. */}
      <VendorMark
        name={label}
        logoUrl={logoUrl}
        size={TILE}
        ring={selected ? colors.brand : "transparent"}
        monogramSize={typography.rowTitle.fontSize}
      />
      <Text
        style={[styles.label, selected && styles.labelSelected]}
        numberOfLines={2}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function VendorTiles({
  vendors, selectedId, onSelect, allowNone = true,
}: VendorTilesProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // The form's scroller would otherwise swallow the first tap while this
      // row settles, the same reason the parent sets it.
      keyboardShouldPersistTaps="handled"
    >
      {/* "Nowhere in particular" leads, the way a share sheet leads with Copy
          link: it is the choice you make most and the one that means "skip
          this". Neutral disc, so it never competes with a real mark. */}
      {allowNone && (
        <TouchableOpacity
          style={styles.tile}
          onPress={() => onSelect(null)}
          accessibilityRole="button"
          accessibilityState={{ selected: selectedId === null }}
          accessibilityLabel="No preferred vendor"
        >
          {/* Not a `VendorMark`: there is no vendor here, and no logo or letter
              to fall back to. A neutral disc, so it never competes with a real
              mark — hence its own geometry rather than the shared one. */}
          <View style={[styles.noneDisc, selectedId === null && styles.noneDiscSelected]}>
            <Ban size={icons.md} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
          </View>
          <Text
            style={[styles.label, selectedId === null && styles.labelSelected]}
            numberOfLines={2}
          >
            No preference
          </Text>
        </TouchableOpacity>
      )}

      {vendors.map((v) => (
        <VendorTile
          key={v.id}
          label={v.name}
          logoUrl={v.logo_url}
          inactive={!v.is_active}
          selected={v.id === selectedId}
          onPress={() => onSelect(v.id)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.lg, paddingVertical: spacing.sm, paddingRight: spacing.lg },
  tile: { width: 76, alignItems: "center", gap: spacing.sm },
  noneDisc: {
    width: TILE, height: TILE, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.surface2,
    // Transparent rather than absent, so selecting it does not resize the disc.
    borderWidth: 2, borderColor: "transparent",
  },
  noneDiscSelected: { borderColor: colors.brand },
  label: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  labelSelected: { color: colors.brand, fontWeight: "600" },
});
