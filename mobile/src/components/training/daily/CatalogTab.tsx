import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Linking, Image,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, ExternalLink } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchCatalog } from "@/src/lib/supabase/capture";
import { filterCatalog, catalogHandles } from "@/src/lib/catalogFilter";
import { CaptureFab } from "./CaptureFab";
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
    muscle: null, equipment: null, category: null, handle: null,
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
    <View style={styles.container}>
      <View style={styles.railBlock}>
        {rail("Muscle", "muscle", axes.muscles)}
        {rail("Equipment", "equipment", axes.equipment)}
        {rail("Type", "category", axes.categories)}
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
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.7}
              onPress={() =>
                router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
              }
              accessibilityRole="button"
              accessibilityLabel={`${item.name}. Open the exercise.`}
            >
              {item.sources[0]?.thumbnailUrl && (
                <Image source={{ uri: item.sources[0].thumbnailUrl }} style={styles.thumb} />
              )}
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{item.name}</Text>
                <Text style={styles.cardMeta}>
                  {[
                    item.skillLevel,
                    item.muscles.filter((m) => m.isPrimary).map((m) => m.name).join(", ") || null,
                    item.equipmentTypes.join(", ") || "no equipment",
                  ].filter(Boolean).join(" · ")}
                </Text>
                {item.sources[0] && (
                  <TouchableOpacity
                    style={styles.sourceRow}
                    onPress={() => Linking.openURL(item.sources[0].sourceUrl)}
                    activeOpacity={0.7}
                  >
                    <ExternalLink size={13} color={colors.primary} />
                    <Text style={styles.sourceText}>
                      {item.sources[0].posterHandle ?? item.sources[0].platform}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* The card opens the exercise; the source link inside it still
                  wins its own taps and goes out to the post. */}
              <View style={styles.chevron}>
                <ChevronRight size={18} color={colors.mutedForeground} />
              </View>
            </TouchableOpacity>
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
    </View>
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
  listContent: { padding: 16, gap: 12 },
  card: {
    flexDirection: "row", backgroundColor: colors.muted, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: 12,
  },
  thumb: { width: 72, height: 72 },
  cardBody: { flex: 1, padding: 12 },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  cardMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  chevron: { alignSelf: "center", paddingRight: 12 },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  sourceText: { fontSize: 13, color: colors.primary },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
