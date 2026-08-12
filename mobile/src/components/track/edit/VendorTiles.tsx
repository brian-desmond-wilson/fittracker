// Pick a shop by its logo.
//
// The vendors were a wrapping wall of text chips, which is both slow to read
// and what produced the mid-word breaks this replaces. A row of circular marks
// is how every share sheet and payment picker does it, and for good reason:
// you recognise Costco's logo before you finish reading the word.
//
// Horizontal scroll rather than wrap, so adding a sixth vendor lengthens the
// row instead of reflowing the form.
import React, { useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ban } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import type { NutritionVendor } from "@/src/types/nutrition-preferences";
import { monogram } from "@/src/lib/vendorMonogram";

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
  // A logo that 404s or times out must not leave a blank disc — fall back to
  // the monogram, which is what a vendor with no logo gets anyway.
  const [failed, setFailed] = useState(false);
  const showLogo = !!logoUrl && !failed;

  return (
    <TouchableOpacity
      style={styles.tile}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={inactive ? `${label} (inactive)` : label}
    >
      <View style={[styles.disc, selected && styles.discSelected]}>
        {showLogo ? (
          <Image
            source={{ uri: logoUrl as string }}
            style={styles.logo}
            resizeMode="contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <Text style={styles.monogram}>{monogram(label)}</Text>
        )}
      </View>
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
          <View style={[styles.disc, styles.discNone, selectedId === null && styles.discSelected]}>
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
  disc: {
    width: TILE, height: TILE, borderRadius: radii.pill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.imageWell,  // logos are drawn for light grounds
    borderWidth: 2, borderColor: "transparent",
    overflow: "hidden",
  },
  discNone: { backgroundColor: colors.surface2 },
  // The ring, not a fill: a filled disc would hide the logo that identifies it.
  discSelected: { borderColor: colors.brand },
  logo: { width: TILE - spacing.lg, height: TILE - spacing.lg },
  monogram: { ...typography.rowTitle, color: colors.textFaint },
  label: { ...typography.caption, color: colors.textMuted, textAlign: "center" },
  labelSelected: { color: colors.brand, fontWeight: "600" },
});
