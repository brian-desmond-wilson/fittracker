import React, { useCallback, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  RefreshControl, Image,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchCapturedWorkouts } from "@/src/lib/supabase/capture";
import { filterWorkouts } from "@/src/lib/workoutFilter";
import { formatWorkoutHeadline } from "@/src/lib/workoutFormat";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

interface WorkoutsTabProps {
  searchQuery: string;
  onCountUpdate: (count: number) => void;
}

export default function WorkoutsTab({ searchQuery, onCountUpdate }: WorkoutsTabProps) {
  const [workouts, setWorkouts] = useState<CapturedWorkoutEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const list = await fetchCapturedWorkouts(user.id);
    setWorkouts(list);
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

  const filtered = useMemo(
    () => filterWorkouts(workouts, searchQuery),
    [workouts, searchQuery],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={filtered}
        keyExtractor={(w) => w.workoutId}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() =>
              router.push(`/(tabs)/training/captured-workout/${item.workoutId}`)
            }
            activeOpacity={0.7}
          >
            {item.source?.thumbnailUrl && (
              <Image source={{ uri: item.source.thumbnailUrl }} style={styles.thumb} />
            )}
            <View style={styles.cardBody}>
              <Text style={styles.cardName}>{item.name}</Text>
              <Text style={styles.cardMeta}>
                {formatWorkoutHeadline(item.items.length, item.rounds)}
              </Text>
              {item.source?.posterHandle && (
                <Text style={styles.handle}>{item.source.posterHandle}</Text>
              )}
            </View>
            <ChevronRight size={18} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {workouts.length === 0 ? "No workouts captured yet" : "No matches"}
            </Text>
            <Text style={styles.emptyText}>
              {workouts.length === 0
                ? "When a post lays out a full session — movements with reps and rounds — it lands here, kept the way the creator wrote it."
                : "Change the search."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1, backgroundColor: colors.background,
    justifyContent: "center", alignItems: "center",
  },
  listContent: { padding: 16 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.muted, borderRadius: 12,
    borderWidth: 1, borderColor: colors.border,
    overflow: "hidden", marginBottom: 12, paddingRight: 12,
  },
  thumb: { width: 72, height: 72 },
  cardBody: { flex: 1, padding: 12 },
  cardName: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  cardMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  handle: { fontSize: 13, color: colors.primary, marginTop: 4 },
  empty: { padding: 40, alignItems: "center" },
  emptyTitle: { fontSize: 18, fontWeight: "bold", color: colors.foreground, marginBottom: 8 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
});
