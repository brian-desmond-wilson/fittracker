// mobile/src/components/track/meals/library/styles.ts
import { StyleSheet } from "react-native";
import { scoreBand, type ScoreBand } from "@/src/lib/mealScore";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import type { BadgeTone } from "@/src/components/ui";

export const lib = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // Used when the bar has no trailing action (the library as a pushed page, in
  // detail or builder): `space-between` with two children would throw the title
  // against the right edge, so the pair sits together after the back chevron.
  headerLeftAligned: { justifyContent: "flex-start", gap: spacing.sm },
  // `flexShrink: 1` so a long meal name ellipsizes instead of pushing the
  // flanking header buttons off the bar — same guard `Screen`'s `barTitle` has.
  headerTitle: { ...typography.titleBar, color: colors.text, flexShrink: 1 },
  sectionHeader: {
    ...typography.section,
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
  },
  emergencyHeader: { color: colors.danger },
  emergencySub: {
    ...typography.caption,
    color: colors.danger,
    paddingHorizontal: spacing.screenGutter,
    paddingBottom: spacing.sm,
  },
  /** Placement for the `Card variant="row"` blocks these screens stack. */
  cardSpacing: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.sm,
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mealName: { ...typography.rowTitle, color: colors.text, flexShrink: 1 },
  // C5. The thumbnail and the name are one unit that shrinks together, so a
  // long meal name truncates instead of pushing the score badge off the row.
  faceRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, flexShrink: 1,
  },
  face: {
    width: 36, height: 36, borderRadius: radii.control,
    backgroundColor: colors.surface2,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  faceImage: { width: "100%", height: "100%" },
  faceMonogram: { ...typography.caption, fontWeight: "700", color: colors.textFaint },
  mutedText: { ...typography.body, color: colors.textMuted },
  smallMuted: { ...typography.caption, color: colors.textFaint },
  bodyText: { ...typography.body, color: colors.text },
  approvedNote: { ...typography.caption, fontWeight: "600", color: colors.success },
  // Availability surfaces (Phase 4 Task 8). Green = in stock, amber = a
  // caveat you can still act on (missing item / expiring soon).
  warnText: { color: colors.warning },
  availableDot: { ...typography.caption, color: colors.success },
  unavailableDot: { ...typography.caption, color: colors.textFaint },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.screenGutter,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
  },
  searchInput: {
    ...typography.body,
    color: colors.text,
    flex: 1,
    paddingVertical: spacing.md,
  },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingTop: spacing.md,
  },
  neverFlag: { ...typography.caption, fontWeight: "700", color: colors.danger },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
  },
  // Active state of a GROUPED, mutually-exclusive selector (category, role,
  // taste override, meal type) — solid brand fill, `onBrand` label (spec §6).
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.body, color: colors.textMuted },
  chipTextActive: { color: colors.onBrand, fontWeight: "600" },
  // Active state of a STANDALONE filter/toggle chip (no shared track) — the
  // calmer tint treatment, per the standing active-chip rule.
  chipFilterActive: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  chipFilterTextActive: { color: colors.brand, fontWeight: "600" },
  input: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: 15,
    marginTop: spacing.sm,
  },
  barTrack: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    flex: 1,
    marginLeft: spacing.sm,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: radii.pill, backgroundColor: colors.brand },
});

// A8. `mid` was amber and `low` was red, so the middle of the range — where
// most of a real library sits — was permanently styled as a problem, and the
// bottom as an emergency. A meal scoring 78 is not a warning; it is a meal.
// Neutral for the middle, amber reserved for genuinely poor fits, and `danger`
// given up entirely: the one thing that IS an alarm, a meal containing a food
// rated "never", already says so in red words of its own.
const TONE_BY_BAND: Record<ScoreBand, BadgeTone> = {
  core: "success",
  mid: "neutral",
  low: "warning",
} as const;

/** Pure band → Badge tone lookup. The band DECISION (spec §6's thresholds) lives
 * in `mealScore.ts` next to the constants, where Jest can reach it — this file
 * imports `react-native` and can never be loaded under the node test scope. */
export function scoreTone(score: number): BadgeTone {
  return TONE_BY_BAND[scoreBand(score)];
}
