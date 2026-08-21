import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { useFocusEffect, useRouter } from "expo-router";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchCatalog } from "@/src/lib/supabase/capture";
import { filterCatalog, catalogHandles } from "@/src/lib/catalogFilter";
import { CaptureFab } from "./CaptureFab";
import { SwipeableCatalogCard } from "./SwipeableCatalogCard";
import type { CatalogEntry, CatalogFilters } from "@/src/types/capture";

// One pill rail per filter axis. Muscles/equipment/categories are derived
// from the loaded catalog so the rails only offer values that select something.
const axisValues = (entries: CatalogEntry[]) => ({
  muscles: [...new Set(entries.flatMap((e) => e.muscles.map((m) => m.name)))].sort(),
  equipment: [...new Set(entries.flatMap((e) => e.equipmentTypes))].sort(),
  categories: [...new Set(entries.flatMap((e) => e.goalTypes))].sort(),
  handles: catalogHandles(entries),
});

interface CatalogTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
}

export default function CatalogTab({ searchQuery, onCountUpdate }: CatalogTabProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<Omit<CatalogFilters, "search">>({
    muscle: null, equipment: null, category: null, handle: null, skill: null,
  });
  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const list = await fetchCatalog(user.id);
    setEntries(list);
    onCountUpdate(list.length);
    setLoading(false);
  }, [onCountUpdate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const axes = useMemo(() => axisValues(entries), [entries]);
  const filtered = useMemo(
    () => filterCatalog(entries, { ...filters, search: searchQuery }),
    [entries, filters, searchQuery],
  );

  const toggle = (axis: keyof typeof filters, value: string) =>
    setFilters((f) => ({ ...f, [axis]: f[axis] === value ? null : value }));

  const rail = (label: string, axis: keyof typeof filters, values: string[]) =>
    values.length > 0 && (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
        <Text style={styles.railLabel}>{label}</Text>
        {values.map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.pill, filters[axis] === v && styles.pillActive]}
            onPress={() => toggle(axis, v)}
          >
            <Text style={[styles.pillText, filters[axis] === v && styles.pillTextActive]}>{v}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );

  return (
    <GestureHandlerRootView style={styles.container}>
      <View style={styles.railBlock}>
        {rail("Muscle", "muscle", axes.muscles)}
        {rail("Equipment", "equipment", axes.equipment)}
        {rail("Type", "category", axes.categories)}
        {rail("Skill", "skill", ["Beginner", "Intermediate", "Advanced"])}
        {rail("From", "handle", axes.handles)}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.exerciseId}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
              tintColor={colors.primary} colors={[colors.primary]} />
          }
          renderItem={({ item }) => (
            <SwipeableCatalogCard
              entry={item}
              onPress={() =>
                router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
              }
              onDeleted={load}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>
                {entries.length === 0 ? "Nothing captured yet" : "No matches"}
              </Text>
              <Text style={styles.emptyText}>
                {entries.length === 0
                  ? "See an exercise on Instagram or TikTok? Paste its link here with the + button."
                  : "Clear a filter or change the search."}
              </Text>
            </View>
          }
        />
      )}

      <CaptureFab onSaved={load} />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  railBlock: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 6 },
  rail: { paddingHorizontal: 16, gap: 6, alignItems: "center", paddingVertical: 4 },
  railLabel: { fontSize: 11, color: colors.mutedForeground, marginRight: 4, textTransform: "uppercase" },
  pill: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
  },
  pillActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pillText: { fontSize: 13, color: colors.mutedForeground },
  pillTextActive: { color: "#FFFFFF", fontWeight: "600" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  // The card's own gap lives on its swipe container, so `gap` here would
  // double it.
  listContent: { padding: 16 },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
