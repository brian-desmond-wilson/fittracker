import React, { useCallback, useState } from "react";
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Linking, Image,
  ActivityIndicator, StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useFocusEffect, router } from "expo-router";
import { ChevronLeft, ExternalLink } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { fetchCapturedWorkout } from "@/src/lib/supabase/capture";
import { formatWorkoutHeadline, formatWorkoutItem } from "@/src/lib/workoutFormat";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

export function CapturedWorkoutScreen() {
  // A pushed screen carries an id, not the row — it loads its own copy, so a
  // stale list can't put stale numbers on screen.
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [workout, setWorkout] = useState<CapturedWorkoutEntry | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!id) return;
      fetchCapturedWorkout(id).then((w) => {
        if (!alive) return;
        setWorkout(w);
        setLoading(false);
      });
      return () => {
        alive = false;
      };
    }, [id]),
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => router.back()} style={styles.backButton} activeOpacity={0.7}>
        <ChevronLeft size={24} color={colors.foreground} />
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {header}
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        </View>
      </>
    );
  }

  if (!workout) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, { paddingTop: insets.top }]}>
          {header}
          <View style={styles.center}>
            <Text style={styles.missing}>That workout is no longer in your catalog.</Text>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.title}>{workout.name}</Text>
          <Text style={styles.headline}>
            {formatWorkoutHeadline(workout.items.length, workout.rounds)}
          </Text>

          {workout.source?.thumbnailUrl && (
            <Image source={{ uri: workout.source.thumbnailUrl }} style={styles.hero} />
          )}

          {workout.items.map((item, i) => {
            const prescription = formatWorkoutItem(item);
            return (
              <View key={`${item.exerciseId}-${i}`} style={styles.row}>
                <Text style={styles.index}>{i + 1}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.movement}>{item.name}</Text>
                  {/* Silence beats invention: when the creator prescribed
                      nothing, the movement stands on its own. */}
                  {prescription !== "" && (
                    <Text style={styles.prescription}>{prescription}</Text>
                  )}
                  {item.notes && <Text style={styles.notes}>{item.notes}</Text>}
                </View>
              </View>
            );
          })}

          {workout.rounds && (
            <Text style={styles.repeat}>
              Repeat the whole list {workout.rounds} times.
            </Text>
          )}

          {workout.rawProtocol && (
            <>
              <Text style={styles.sectionLabel}>As the creator wrote it</Text>
              <Text style={styles.protocol}>{workout.rawProtocol}</Text>
            </>
          )}

          {workout.source && (
            <TouchableOpacity
              style={styles.sourceRow}
              onPress={() => Linking.openURL(workout.source!.sourceUrl)}
              activeOpacity={0.7}
            >
              <ExternalLink size={15} color={colors.primary} />
              <Text style={styles.sourceText}>
                {workout.source.posterHandle ?? workout.source.platform}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: 8, paddingVertical: 8 },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  missing: { fontSize: 15, color: colors.mutedForeground, textAlign: "center" },
  scroll: { paddingHorizontal: 20, paddingBottom: 40 },
  title: { fontSize: 24, fontWeight: "700", color: colors.foreground },
  headline: { fontSize: 14, color: colors.primary, marginTop: 4, marginBottom: 16 },
  hero: { width: "100%", height: 180, borderRadius: 12, marginBottom: 16 },
  row: { flexDirection: "row", gap: 12, paddingVertical: 10 },
  index: {
    fontSize: 13, fontWeight: "700", color: colors.mutedForeground,
    width: 20, paddingTop: 2,
  },
  rowBody: { flex: 1 },
  movement: { fontSize: 16, fontWeight: "600", color: colors.foreground },
  prescription: { fontSize: 14, color: colors.mutedForeground, marginTop: 2 },
  notes: { fontSize: 13, color: colors.mutedForeground, marginTop: 4, fontStyle: "italic" },
  repeat: {
    fontSize: 14, color: colors.foreground, marginTop: 12, marginBottom: 4,
    fontWeight: "600",
  },
  sectionLabel: {
    fontSize: 12, color: colors.mutedForeground, marginTop: 20, marginBottom: 6,
    textTransform: "uppercase",
  },
  protocol: {
    fontSize: 13, color: colors.mutedForeground, lineHeight: 19,
    backgroundColor: colors.input, borderRadius: 8, padding: 12,
  },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 24 },
  sourceText: { fontSize: 14, color: colors.primary },
});
