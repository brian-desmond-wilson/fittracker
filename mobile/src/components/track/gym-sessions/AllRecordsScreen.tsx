// Every personal record, grouped by exercise. Self-sufficient: this screen
// fetches its own set history rather than depending on the caller's state.
import React, { useCallback, useState } from "react";
import {
  ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { fetchSetFacts } from "@/src/lib/supabase/gymSessions";
import { computeRecords, currentRecords } from "@/src/lib/personalRecords";
import { recordLabel } from "./RecordsSection";
import type { PersonalRecord } from "@/src/types/records";

export function AllRecordsScreen({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [records, setRecords] = useState<PersonalRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (alive) setLoading(false);
          return;
        }
        const facts = await fetchSetFacts(user.id);
        if (!alive) return;
        setRecords(currentRecords(computeRecords(facts)));
        setLoading(false);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={onClose} style={styles.back} activeOpacity={0.7}>
        <ChevronLeft size={24} color={colors.foreground} />
        <Text style={styles.backText}>Gym Sessions</Text>
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

  const byExercise = new Map<string, PersonalRecord[]>();
  for (const r of records) {
    byExercise.set(r.exerciseName, [...(byExercise.get(r.exerciseName) ?? []), r]);
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {header}
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.title}>Records</Text>
          {byExercise.size === 0 ? (
            <Text style={styles.emptyText}>No records yet — beat a prior mark to set one.</Text>
          ) : (
            [...byExercise.entries()].map(([name, exerciseRecords]) => (
              <View key={name} style={styles.exercise}>
                <Text style={styles.exerciseName}>{name}</Text>
                {exerciseRecords.map((r) => (
                  <View key={r.kind} style={styles.recordRow}>
                    <Text style={styles.recordValue}>{recordLabel(r)}</Text>
                    <Text style={styles.recordDate}>
                      {new Date(`${r.date}T00:00:00`).toLocaleDateString([], {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingVertical: 8 },
  back: { flexDirection: "row", alignItems: "center", height: 40, paddingHorizontal: 8 },
  backText: { fontSize: 16, color: colors.foreground },
  content: { paddingHorizontal: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  title: { fontSize: 22, fontWeight: "700", color: colors.foreground, marginBottom: 16 },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", marginTop: 40 },
  exercise: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
  exerciseName: { fontSize: 14, fontWeight: "600", color: colors.foreground, marginBottom: 6 },
  recordRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 3,
  },
  recordValue: { fontSize: 13, color: "#4ADE80" },
  recordDate: { fontSize: 11, color: colors.mutedForeground },
});
