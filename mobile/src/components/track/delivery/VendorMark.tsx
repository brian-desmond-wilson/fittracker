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
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

interface VendorMarkProps {
  /** Used for the fallback monogram, and only for that. */
  name: string;
  logoUrl?: string | null;
  /** Diameter. 34 is the delivery pages' row size; the picker's tiles are 60. */
  size?: number;
}

export function VendorMark({ name, logoUrl, size = 34 }: VendorMarkProps) {
  const [failed, setFailed] = useState(false);
  const showLogo = !!logoUrl && !failed;
  const inset = size - spacing.sm;

  return (
    // White, because vendor logos are drawn for light grounds — the same
    // exception `colors.imageWell` exists for on product photos.
    <View style={[styles.disc, { width: size, height: size }]}>
      {showLogo ? (
        <Image
          source={{ uri: logoUrl as string }}
          style={{ width: inset, height: inset }}
          resizeMode="contain"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text style={[styles.monogram, { fontSize: Math.round(size * 0.41) }]}>
          {monogram(name)}
        </Text>
      )}
    </View>
  );
}

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
