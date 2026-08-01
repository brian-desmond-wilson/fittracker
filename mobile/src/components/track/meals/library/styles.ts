// mobile/src/components/track/meals/library/styles.ts
import { StyleSheet } from "react-native";
import { scoreBand, type ScoreBand } from "@/src/lib/mealScore";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";
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
  headerTitle: { ...typography.titleBar, color: colors.text },
  /** Inline text-glyph controls (the builder's − / ＋ steppers). */
  glyphAction: { ...typography.button, color: colors.brand },
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
  mutedText: { ...typography.body, color: colors.textMuted },
  smallMuted: { ...typography.caption, color: colors.textFaint },
  bodyText: { ...typography.body, color: colors.text },
  approvedNote: { ...typography.caption, fontWeight: "600", color: colors.success },
  // Availability surfaces (Phase 4 Task 8). Green = in stock, amber = a
  // caveat you can still act on (missing item / expiring soon).
  warnText: { color: colors.warning },
  availableDot: { ...typography.caption, color: colors.success },
  unavailableDot: { ...typography.caption, color: colors.textFaint },
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
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { ...typography.body, color: colors.textMuted },
  chipTextActive: { color: colors.onBrand, fontWeight: "600" },
  destructiveText: { ...typography.button, color: colors.danger },
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
    borderRadius: 3,
    backgroundColor: colors.border,
    flex: 1,
    marginLeft: spacing.sm,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.brand },
});

const TONE_BY_BAND: Record<ScoreBand, BadgeTone> = {
  core: "success",
  mid: "warning",
  low: "danger",
} as const;

/** Pure band → Badge tone lookup. The band DECISION (spec §6's thresholds) lives
 * in `mealScore.ts` next to the constants, where Jest can reach it — this file
 * imports `react-native` and can never be loaded under the node test scope. */
export function scoreTone(score: number): BadgeTone {
  return TONE_BY_BAND[scoreBand(score)];
}
