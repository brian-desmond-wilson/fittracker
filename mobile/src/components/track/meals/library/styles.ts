// mobile/src/components/track/meals/library/styles.ts
import { StyleSheet } from "react-native";
import { scoreBand } from "@/src/lib/mealScore";

export const lib = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0A0F1E" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  headerTitle: { fontSize: 20, fontWeight: "700", color: "#FFFFFF" },
  headerAction: { fontSize: 17, color: "#3B82F6" },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    color: "#9CA3AF",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  emergencyHeader: { color: "#F87171" },
  emergencySub: {
    fontSize: 13,
    color: "#FCA5A5",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1F2937",
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
  },
  row: { flexDirection: "row", alignItems: "center" },
  rowBetween: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  mealName: { fontSize: 16, fontWeight: "600", color: "#FFFFFF", flexShrink: 1 },
  mutedText: { fontSize: 13, color: "#9CA3AF" },
  smallMuted: { fontSize: 12, color: "#6B7280" },
  scoreChip: {
    minWidth: 40,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignItems: "center",
  },
  scoreChipCore: { backgroundColor: "rgba(34,197,94,0.18)" },
  scoreChipMid: { backgroundColor: "#1F2937" },
  scoreChipLow: { backgroundColor: "rgba(107,114,128,0.25)" },
  scoreChipText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: "rgba(59,130,246,0.15)",
  },
  badgeText: { fontSize: 11, fontWeight: "600", color: "#60A5FA" },
  neverFlag: { fontSize: 11, fontWeight: "700", color: "#F87171" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#374151",
    marginRight: 8,
    marginBottom: 8,
  },
  chipActive: { backgroundColor: "#2563EB", borderColor: "#2563EB" },
  chipText: { fontSize: 13, color: "#D1D5DB" },
  chipTextActive: { color: "#FFFFFF", fontWeight: "600" },
  primaryButton: {
    backgroundColor: "#2563EB",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryButtonText: { fontSize: 16, fontWeight: "600", color: "#FFFFFF" },
  destructiveText: { fontSize: 15, color: "#F87171", fontWeight: "600" },
  input: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#FFFFFF",
    fontSize: 15,
    marginTop: 8,
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: "#1F2937",
    flex: 1,
    marginLeft: 8,
    overflow: "hidden",
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: "#3B82F6" },
});

const CHIP_BY_BAND = {
  core: lib.scoreChipCore,
  mid: lib.scoreChipMid,
  low: lib.scoreChipLow,
} as const;

/** Pure band → style lookup. The band DECISION (spec §6's thresholds) lives in
 * `mealScore.ts` next to the constants, where Jest can reach it — this file
 * imports `react-native` and can never be loaded under the node test scope. */
export function scoreChipStyle(score: number) {
  return CHIP_BY_BAND[scoreBand(score)];
}
