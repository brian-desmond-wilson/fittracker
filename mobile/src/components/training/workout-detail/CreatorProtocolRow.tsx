// mobile/src/components/training/workout-detail/CreatorProtocolRow.tsx
// "As the creator wrote it", collapsed (spec 2026-09-13 §4.9): kept for
// trust — seeing the verbatim lines is how you tell a bad parse from a bad
// post — and out of the way by default. Component state only; a reopened
// page starts closed.
import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { ChevronRight, ChevronDown } from "lucide-react-native";
import { colors, spacing, radii } from "@/src/theme/tokens";

interface CreatorProtocolRowProps {
  text: string;
}

export function CreatorProtocolRow({ text }: CreatorProtocolRowProps) {
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <View>
      <TouchableOpacity
        style={styles.row}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel="As the creator wrote it"
      >
        <Text style={styles.label}>As the creator wrote it</Text>
        <Chevron size={18} color={colors.textMuted} />
      </TouchableOpacity>
      {open && <Text style={styles.protocol}>{text}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  label: { fontSize: 14, fontWeight: "600", color: colors.text },
  protocol: {
    fontSize: 13, color: colors.textMuted, lineHeight: 19, marginTop: spacing.md,
    backgroundColor: colors.surface2, borderRadius: radii.control, padding: spacing.md,
  },
});
