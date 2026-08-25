// The headline records, with the rest a tap away.
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/src/lib/colors";
import { formatVolume } from "@/src/lib/gymSessions";
import type { PersonalRecord } from "@/src/types/records";

const SHOWN = 3;

export const recordLabel = (r: PersonalRecord): string =>
  r.kind === "weight"
    ? `${Math.round(r.value)} lbs`
    : r.kind === "e1rm"
      ? `est. 1RM ${Math.round(r.value)} lbs`
      : `${formatVolume(r.value)} lbs in a session`;

export function RecordsSection({
  records, onSeeAll,
}: {
  records: PersonalRecord[];
  onSeeAll: () => void;
}) {
  if (records.length === 0) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>Recent records 🏆</Text>
      {records.slice(0, SHOWN).map((r) => (
        <View key={`${r.exerciseId}-${r.kind}-${r.date}-${r.sessionId}`} style={styles.row}>
          <Text style={styles.name} numberOfLines={1}>{r.exerciseName}</Text>
          <Text style={styles.value}>{recordLabel(r)}</Text>
          <Text style={styles.beat}>beat {Math.round(r.previous)}</Text>
        </View>
      ))}
      {/* records.length is already > 0 here — the early return above guards it. */}
      <TouchableOpacity onPress={onSeeAll} accessibilityRole="button">
        <Text style={styles.link}>See all records ›</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.muted, borderRadius: 12, padding: 12, marginBottom: 12 },
  title: { fontSize: 13, fontWeight: "700", color: colors.foreground, marginBottom: 8 },
  row: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: colors.border },
  name: { fontSize: 13, fontWeight: "600", color: colors.foreground },
  value: { fontSize: 12, color: "#4ADE80", marginTop: 2 },
  beat: { fontSize: 10, color: colors.mutedForeground, marginTop: 1 },
  link: { fontSize: 12, color: colors.primary, fontWeight: "600", marginTop: 10 },
});
