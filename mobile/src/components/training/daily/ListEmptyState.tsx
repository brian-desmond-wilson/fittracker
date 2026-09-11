// mobile/src/components/training/daily/ListEmptyState.tsx
// The two empty states a filtered list can land in, shared by the Workouts
// and Exercises tabs so the wording rule and the rescue button cannot drift.
//
//   EmptyLibrary   — nothing captured at all; each tab supplies its own copy.
//   NothingMatches — the library has rows but the filters (and search) hid
//                    them all: name what is on, offer to drop the single most
//                    restrictive axis, then a quiet Clear all (mockup A7).
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors } from "@/src/theme/tokens";

/** "a", "a and b", "a, b and c" — labels verbatim, because a creator handle
 *  or a band like "≤ 15 min" reads wrong in any other case. */
const listed = (items: string[]): string =>
  items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

export function EmptyLibrary({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptyText}>{body}</Text>
    </View>
  );
}

interface NothingMatchesProps {
  /** ["workout", "workouts"] or ["exercise", "exercises"]. */
  noun: [singular: string, plural: string];
  /** The active filter chips, in rail order. Empty when only the search hides the list. */
  chips: { label: string }[];
  /** The header search, raw; trimmed here. */
  search: string;
  /** The one axis whose clearing brings back the most rows, or null when
   *  no single clearing helps. */
  rescue: { label: string; count: number } | null;
  onDropRescue: () => void;
  onClearAll: () => void;
}

export function NothingMatches({ noun, chips, search, rescue, onDropRescue, onClearAll }: NothingMatchesProps) {
  const q = search.trim();
  const filtered = chips.length > 0;
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>Nothing matches</Text>
      <Text style={styles.emptyText}>
        {filtered
          ? `No ${noun[0]} matches all of ${listed([...chips.map((c) => c.label), ...(q ? [`“${q}”`] : [])])}.`
          : "Change the search."}
      </Text>
      {rescue && (
        <TouchableOpacity style={styles.rescue} onPress={onDropRescue} accessibilityRole="button">
          <Text style={styles.rescueText}>
            Drop “{rescue.label}” · {rescue.count} {rescue.count === 1 ? noun[0] : noun[1]}
          </Text>
        </TouchableOpacity>
      )}
      {filtered && (
        <TouchableOpacity style={styles.rescueGhost} onPress={onClearAll} accessibilityRole="button">
          <Text style={styles.rescueGhostText}>Clear all filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.text, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  rescue: {
    marginTop: 16, paddingVertical: 14, paddingHorizontal: 20, borderRadius: 8, alignSelf: "stretch",
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center",
  },
  rescueText: { fontSize: 15, fontWeight: "600", color: colors.onBrand, textAlign: "center" },
  rescueGhost: { marginTop: 4, height: 36, alignItems: "center", justifyContent: "center" },
  rescueGhostText: { fontSize: 14, color: colors.textMuted },
});
