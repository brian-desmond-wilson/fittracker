// Which picture stands for which muscle. Pure data so Jest can prove the
// vocabulary is covered; the React Native `require()` side lives in
// components/ui/muscleIconAssets.ts and is keyed by these slugs.
//
// Keys are muscle_regions.name verbatim (the TRAINABLE_MUSCLES vocabulary).
// Values are file stems under assets/muscles/. The pictures are the Flaticon
// "Muscles" pack by cube29 (free licence, credited on the About screen).
// "Full Body" is a pickable tag, not a muscle, and has no picture here on
// purpose — the picker keeps its body figure for that one tile.

export const MUSCLE_ICON_SLUGS = {
  "Chest": "chest",
  "Shoulders": "shoulders",
  "Triceps": "triceps",
  "Upper Back": "upper-back",
  "Lats": "lats",
  "Biceps": "biceps",
  "Forearms / Grip": "forearms-grip",
  "Neck / Traps": "neck-traps",
  "Core": "core",
  "Obliques": "obliques",
  "Lower Back": "lower-back",
  "Quads": "quads",
  "Hamstrings": "hamstrings",
  "Glutes": "glutes",
  "Calves": "calves",
  "Hip Flexors": "hip-flexors",
  "Hip Abductors": "hip-abductors",
  "Hip Adductors": "hip-adductors",
} as const;

export type MuscleIconSlug = (typeof MUSCLE_ICON_SLUGS)[keyof typeof MUSCLE_ICON_SLUGS];

/** Exact lookup on muscle_regions.name; null for anything without a picture. */
export function muscleIconSlug(name: string): MuscleIconSlug | null {
  return Object.prototype.hasOwnProperty.call(MUSCLE_ICON_SLUGS, name)
    ? (MUSCLE_ICON_SLUGS as Record<string, MuscleIconSlug>)[name]
    : null;
}
