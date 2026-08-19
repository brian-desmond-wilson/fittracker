// One palette for the balance bar, the calendar dots and the session chips, so
// the page tells a single story rather than three.
import type { MuscleGroup } from "@/src/types/gymSessions";

export const GROUP_COLORS: Record<MuscleGroup, string> = {
  push: "#22C55E",
  pull: "#3B82F6",
  lower: "#A855F7",
  full: "#EC4899",
  // Grey says "the session happened, we can't say what it worked" — which is
  // a different claim from "full body", and must not look like one.
  untagged: "#6B7280",
};

export const SOURCE_LABELS: Record<string, string> = {
  catalog: "From catalog",
  recommended: "Recommended",
  program: "Program",
  unknown: "Logged",
};

export const SOURCE_COLORS: Record<string, { bg: string; fg: string }> = {
  catalog: { bg: "#422006", fg: "#FCD34D" },
  recommended: { bg: "#0C2A4A", fg: "#93C5FD" },
  program: { bg: "#1F2937", fg: "#D1D5DB" },
  unknown: { bg: "#1F2937", fg: "#9CA3AF" },
};
