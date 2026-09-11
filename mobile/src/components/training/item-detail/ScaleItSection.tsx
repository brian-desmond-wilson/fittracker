// mobile/src/components/training/item-detail/ScaleItSection.tsx
// Spec §4.6: Easier (regressions) and Harder (progressions) columns from
// movement_scaling_links, in display order. A single empty column is
// hidden and the other fills the width; both empty renders nothing.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";

export interface ScaleLink {
  id: string;
  name: string;
}

interface ScaleItSectionProps {
  easier: ScaleLink[];
  harder: ScaleLink[];
  onOpen: (exerciseId: string) => void;
}

function Column({ title, links, onOpen }: { title: string; links: ScaleLink[]; onOpen: (id: string) => void }) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnTitle}>{title}</Text>
      {links.map((l) => (
        <TouchableOpacity key={l.id} style={styles.row} onPress={() => onOpen(l.id)} accessibilityRole="button"
          accessibilityLabel={`${title}: ${l.name}`}>
          <Text style={styles.rowText} numberOfLines={2}>{l.name}</Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function ScaleItSection({ easier, harder, onOpen }: ScaleItSectionProps) {
  if (easier.length === 0 && harder.length === 0) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Scale It</Text>
      <View style={styles.columns}>
        {easier.length > 0 && <Column title="Easier" links={easier} onOpen={onOpen} />}
        {harder.length > 0 && <Column title="Harder" links={harder} onOpen={onOpen} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text, marginBottom: spacing.md },
  columns: { flexDirection: "row", gap: spacing.md },
  column: { flex: 1, gap: spacing.sm },
  columnTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: colors.textMuted },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radii.control, borderWidth: 1, borderColor: colors.border,
  },
  rowText: { flex: 1, fontSize: 14, fontWeight: "500", color: colors.text },
});
