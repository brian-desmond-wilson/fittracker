// Tomorrow's plan, shown tonight. Read-only on purpose: the preview is for
// going to bed knowing the plan; adjustments happen in the morning through
// the normal check-in. Spec: 2026-08-24-rest-day-design.md.
import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Moon } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { blockDayShape } from "@/src/lib/dailyBlockCompose";
import type { StoredSession } from "@/src/types/daily";

export function TomorrowPreview({ session }: { session: StoredSession }) {
  const mainBlock = session.blocks.find((b) => b.block === "main") ?? null;
  const shape = blockDayShape(session.blocks);
  const title = mainBlock
    ? mainBlock.name
    : shape === "recovery" ? "Recovery day" : "Support work";
  return (
    <View style={styles.card} accessibilityLabel={`Tomorrow's preview: ${title}`}>
      <View style={styles.tagRow}>
        <Moon size={13} color={colors.brand} />
        <Text style={styles.tag}>Tomorrow · preview</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {session.dayReason && <Text style={styles.reason}>{session.dayReason}</Text>}
      {session.blocks.filter((b) => !b.dismissed).map((b) => (
        <View key={b.id} style={styles.blockRow}>
          <Text style={styles.blockName} numberOfLines={1}>{b.name}</Text>
          <Text style={styles.blockMinutes}>~{b.minutes} min</Text>
        </View>
      ))}
      <Text style={styles.caption}>
        Built from your usual settings — a quick morning check-in confirms or rebuilds it.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderWidth: 1,
    borderColor: tint(colors.brand, 0.35), borderRadius: radii.panel,
    padding: spacing.lg, marginTop: spacing.xl, gap: 6,
  },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tag: {
    fontSize: 11, color: colors.brand, textTransform: "uppercase",
    letterSpacing: 1, fontWeight: "700",
  },
  title: { fontSize: 19, fontWeight: "800", color: colors.text },
  reason: { fontSize: 13, color: colors.brand, fontStyle: "italic", lineHeight: 19 },
  blockRow: {
    flexDirection: "row", justifyContent: "space-between", gap: 10,
    paddingVertical: 4,
  },
  blockName: { fontSize: 14, color: colors.text, flex: 1 },
  blockMinutes: { fontSize: 13, color: colors.textMuted },
  caption: { fontSize: 11.5, color: colors.textFaint, marginTop: 6 },
});
