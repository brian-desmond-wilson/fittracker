// slug → bundled PNG. Keyed by MuscleIconSlug so a slug added to the
// catalogue without a picture here is a compile error, not a blank tile.
// Files are 512×512 — crisp at the 56pt picker tile and 36pt card icon at 3×.
import type { ImageSourcePropType } from "react-native";
import type { MuscleIconSlug } from "@/src/lib/muscleIconCatalog";

export const MUSCLE_ICON_SOURCES: Record<MuscleIconSlug, ImageSourcePropType> = {
  "chest": require("@/assets/muscles/chest.png"),
  "shoulders": require("@/assets/muscles/shoulders.png"),
  "triceps": require("@/assets/muscles/triceps.png"),
  "upper-back": require("@/assets/muscles/upper-back.png"),
  "lats": require("@/assets/muscles/lats.png"),
  "biceps": require("@/assets/muscles/biceps.png"),
  "forearms-grip": require("@/assets/muscles/forearms-grip.png"),
  "neck-traps": require("@/assets/muscles/neck-traps.png"),
  "core": require("@/assets/muscles/core.png"),
  "obliques": require("@/assets/muscles/obliques.png"),
  "lower-back": require("@/assets/muscles/lower-back.png"),
  "quads": require("@/assets/muscles/quads.png"),
  "hamstrings": require("@/assets/muscles/hamstrings.png"),
  "glutes": require("@/assets/muscles/glutes.png"),
  "calves": require("@/assets/muscles/calves.png"),
  "hip-flexors": require("@/assets/muscles/hip-flexors.png"),
  "hip-abductors": require("@/assets/muscles/hip-abductors.png"),
  "hip-adductors": require("@/assets/muscles/hip-adductors.png"),
};
