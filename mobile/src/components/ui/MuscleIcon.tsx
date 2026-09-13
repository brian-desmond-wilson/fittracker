// One muscle, one picture. Shared by the Muscle Groups picker and the
// captured-exercise card so both read the same. A name with no picture
// renders nothing — a stray region name must never show a broken image.
// Decorative: its name is always printed beside it, so it is hidden from screen readers.
import React from "react";
import { Image } from "react-native";
import { muscleIconSlug } from "@/src/lib/muscleIconCatalog";
import { MUSCLE_ICON_SOURCES } from "./muscleIconAssets";

interface MuscleIconProps {
  /** muscle_regions.name, verbatim. */
  muscle: string;
  size: number;
  /** Secondary muscle on a card: same picture, half opacity. */
  dim?: boolean;
}

export function MuscleIcon({ muscle, size, dim = false }: MuscleIconProps) {
  const slug = muscleIconSlug(muscle);
  if (!slug) return null;
  return (
    <Image
      source={MUSCLE_ICON_SOURCES[slug]}
      style={{ width: size, height: size, opacity: dim ? 0.5 : 1 }}
      resizeMode="contain"
      accessible={false}
    />
  );
}
