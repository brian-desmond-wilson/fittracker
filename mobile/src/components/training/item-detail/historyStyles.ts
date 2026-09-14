// mobile/src/components/training/item-detail/historyStyles.ts
// The frame both "Your history" blocks draw — the exercise page's and the
// workout page's — so the two can never drift: section, header + segmented
// toggle, card, stat trio, caption, session rows, and the See-all link.
// What is specific to one block (bars, direction, PR badge, skill footer)
// stays in that block.
import { StyleSheet } from "react-native";
import { colors, radii, spacing, typography } from "@/src/theme/tokens";

export const historyStyles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: radii.control, padding: 2 },
  segItem: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.onBrand },
  card: { backgroundColor: colors.surface, borderRadius: radii.row, borderWidth: 1, borderColor: colors.border, padding: spacing.lg },
  stats: { flexDirection: "row", gap: spacing.md, marginBottom: spacing.lg },
  stat: { flex: 1 },
  statLabel: { ...typography.caption, textTransform: "uppercase", letterSpacing: 0.5, fontSize: 11, marginBottom: 2 },
  statValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  captionRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.sm },
  caption: { ...typography.caption },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: spacing.sm },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  rowDate: { fontSize: 14, fontWeight: "600", color: colors.text },
  rowName: { flex: 1, fontSize: 14, color: colors.textMuted },
  rowSet: { fontSize: 14, fontWeight: "600", color: colors.text },
  link: { fontSize: 14, fontWeight: "600", color: colors.brand },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 2, paddingTop: spacing.md, alignSelf: "flex-start" },
});
