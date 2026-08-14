// The photograph, and the four facts that decide the tap.
//
// The page used to open on a name in a card, with the picture nowhere — which
// made every meal look like every other meal and pushed the numbers you choose
// on into a muted subtitle. Here the photo IS the top of the page, the score
// sits where the shelves already put it, and the name and macros read off a
// scrim rather than out of a box.
//
// The star is the only control up here. Everything else on the hero is a
// statement about the meal; giving state and action the same treatment is what
// makes a card ambiguous to tap.
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Star } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { monogram } from "@/src/lib/vendorMonogram";

interface MealHeroProps {
  name: string;
  score: number;
  faceUrl: string | null;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  /** Calories · protein · fiber · prep. Built by the caller, which knows
   *  whether the numbers came from stock or from the build. */
  macroLine: string;
  /** Vendor and any standing qualifier — "Thistle · complete portion". */
  sourceLine: string | null;
  /** The flip control, in the corner both faces keep it. */
  corner?: React.ReactNode;
}


export function MealHero({
  name, score, faceUrl, isFavorite, onToggleFavorite, macroLine, sourceLine, corner,
}: MealHeroProps) {
  return (
    <View style={s.hero}>
      {faceUrl ? (
        <Image source={{ uri: faceUrl }} style={s.photo} resizeMode="cover" />
      ) : (
        <View style={s.well}>
          <Text style={s.initials}>{monogram(name)}</Text>
        </View>
      )}
      {/* Read off an arbitrary photograph, so the text needs its own ground.
          A ramp rather than a flat panel: a hard edge across a photo reads as
          a bug, and the top of the title needs less cover than its baseline. */}
      <LinearGradient
        colors={[tint(colors.bg, 0), tint(colors.bg, 0.82), tint(colors.bg, 0.96)]}
        locations={[0, 0.62, 1]}
        style={s.scrim}
        pointerEvents="none"
      />

      <View style={s.topRow}>
        <View style={s.scorePill}>
          <Text style={s.scoreText}>{score}</Text>
        </View>
        {corner}
      </View>

      <View style={s.foot}>
        <View style={s.titleRow}>
          <Text style={s.title} numberOfLines={2}>{name}</Text>
          <TouchableOpacity
            onPress={onToggleFavorite}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityState={{ selected: isFavorite }}
            accessibilityLabel={isFavorite ? `Unfavorite ${name}` : `Favorite ${name}`}
          >
            <Star
              size={icons.lg}
              color={isFavorite ? colors.warning : colors.text}
              fill={isFavorite ? colors.warning : "transparent"}
              strokeWidth={icons.strokeWidth}
            />
          </TouchableOpacity>
        </View>
        <Text style={s.macros}>{macroLine}</Text>
        {sourceLine && <Text style={s.source} numberOfLines={1}>{sourceLine}</Text>}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  hero: { height: 232, backgroundColor: colors.surface2, overflow: "hidden" },
  photo: { ...StyleSheet.absoluteFillObject, width: "100%", height: "100%" },
  well: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.imageWell,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { ...typography.titleRoot, fontSize: 44, color: colors.labelInk },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: "62%" },
  topRow: {
    position: "absolute", top: spacing.md, left: spacing.md, right: spacing.md,
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
  },
  scorePill: {
    backgroundColor: tint(colors.bg, 0.85),
    borderWidth: 1,
    borderColor: tint(colors.brand, 0.4),
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 3,
  },
  scoreText: { ...typography.caption, color: colors.brand, fontWeight: "700" },
  foot: {
    position: "absolute", left: spacing.screenGutter, right: spacing.screenGutter,
    bottom: spacing.md, gap: 4,
  },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: spacing.md },
  title: { ...typography.titleRoot, color: colors.text, flexShrink: 1 },
  macros: { ...typography.body, color: colors.text },
  source: { ...typography.caption, color: colors.accents.mealLibrary, fontWeight: "600" },
});
