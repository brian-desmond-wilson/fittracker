// mobile/src/components/training/daily/CreatorPicker.tsx
// Mockup A5: handles by workout count, a find field, multi-select.
import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Search } from "lucide-react-native";
import { colors, spacing, radii } from "@/src/theme/tokens";

interface CreatorPickerProps {
  creators: { handle: string; count: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
  onBack: () => void;
}

export function CreatorPicker({ creators, selected, onChange, onBack }: CreatorPickerProps) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? creators.filter((c) => c.handle.toLowerCase().includes(q)) : creators;
  }, [creators, query]);
  const toggle = (h: string) =>
    onChange(selected.includes(h) ? selected.filter((x) => x !== h) : [...selected, h]);

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button" accessibilityLabel="Back to filters">
          <ChevronLeft size={24} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={styles.title}>Creator</Text>
        <TouchableOpacity onPress={onBack} accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.find}>
        <Search size={14} color={colors.textFaint} />
        <TextInput style={styles.findInput} value={query} onChangeText={setQuery}
          placeholder="Find a creator" placeholderTextColor={colors.textFaint}
          autoCapitalize="none" autoCorrect={false} />
      </View>
      {/* The keyboard inset keeps the last rows reachable while the find
          field has focus; the bottom inset keeps them off the home indicator. */}
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.xxl }}>
        {shown.map((c) => {
          const on = selected.includes(c.handle);
          return (
            <TouchableOpacity key={c.handle} style={styles.row} onPress={() => toggle(c.handle)}
              accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{c.handle.replace(/^@/, "").charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.handle}>{c.handle}</Text>
              <Text style={styles.count}>{c.count} {c.count === 1 ? "workout" : "workouts"}</Text>
              <View style={[styles.box, on && styles.boxOn]} />
            </TouchableOpacity>
          );
        })}
        {shown.length === 0 && <Text style={styles.none}>No creator matches.</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.screenGutter, paddingTop: spacing.lg, paddingBottom: spacing.sm,
  },
  title: { fontSize: 17, fontWeight: "600", color: colors.text },
  done: { fontSize: 15, fontWeight: "600", color: colors.brand },
  find: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 36,
    marginHorizontal: spacing.screenGutter, marginBottom: spacing.sm, paddingHorizontal: spacing.sm,
    backgroundColor: colors.surface2, borderRadius: radii.control,
  },
  findInput: { flex: 1, fontSize: 13, color: colors.text, padding: 0 },
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.screenGutter, paddingVertical: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  avatar: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center",
  },
  avatarText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  handle: { flex: 1, fontSize: 15, color: colors.text },
  count: { fontSize: 12, color: colors.textFaint },
  box: { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: colors.textFaint },
  boxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  none: { padding: spacing.xxl, textAlign: "center", color: colors.textMuted, fontSize: 13 },
});
