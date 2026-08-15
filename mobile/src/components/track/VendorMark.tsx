// The vendor's own mark, wherever a vendor is named.
//
// You recognise a shop by its logo before you have finished reading the word,
// which is why the vendor picker on the delivery form leads with one. The
// pages that report deliveries were showing the monogram instead — the
// picker's FALLBACK — so choosing Thistle looked nothing like the box Thistle
// then sent.
//
// The monogram stays as exactly that: a fallback, not an initial state. These
// URLs are favicons served off the vendor's own domain, so any of them can 404
// or time out long after it first worked, and a blank white disc says nothing
// at all — hence the `onError` swap rather than trusting the URL's presence.
import React, { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { monogram } from "@/src/lib/vendorMonogram";
import { colors, radii, typography } from "@/src/theme/tokens";

interface VendorMarkProps {
  /** Used for the fallback monogram, and only for that. */
  name: string;
  logoUrl?: string | null;
  /** Diameter. 34 is the delivery pages' row size; the picker's tiles are 60. */
  size?: number;
  /**
   * Border colour for the disc — the picker's selection ring. A ring rather
   * than a fill, because a filled disc would hide the logo that identifies it.
   *
   * Pass `"transparent"` when unselected rather than omitting the prop: React
   * Native counts a border inside the width, so a ring that appears and
   * disappears would resize the logo under it.
   */
  ring?: string;
  /**
   * Overrides the size the letter would take from the disc. The picker sets a
   * smaller one than its 60pt disc implies — inherited from when those tiles
   * were text chips, and left alone here so folding the two marks together did
   * not quietly restyle two forms.
   */
  monogramSize?: number;
}

export function VendorMark({
  name, logoUrl, size = 34, ring, monogramSize,
}: VendorMarkProps) {
  const [failed, setFailed] = useState(false);
  const showLogo = !!logoUrl && !failed;
  // Proportional, so one disc size does not need its own inset constant. Three
  // quarters leaves the logo room to breathe inside the circle without the
  // squarer marks touching its edge.
  const inset = Math.round(size * LOGO_RATIO);

  return (
    // White, because vendor logos are drawn for light grounds — the same
    // exception `colors.imageWell` exists for on product photos.
    <View
      style={[
        styles.disc,
        { width: size, height: size },
        ring !== undefined && { borderWidth: 2, borderColor: ring },
      ]}
    >
      {showLogo ? (
        <Image
          source={{ uri: logoUrl as string }}
          style={{ width: inset, height: inset }}
          resizeMode="contain"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={[styles.monogram, { fontSize: monogramSize ?? Math.round(size * 0.41) }]}
        >
          {monogram(name)}
        </Text>
      )}
    </View>
  );
}

const LOGO_RATIO = 0.75;

const styles = StyleSheet.create({
  disc: {
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.imageWell,
    overflow: "hidden",
  },
  monogram: { ...typography.rowTitle, color: colors.textFaint },
});
