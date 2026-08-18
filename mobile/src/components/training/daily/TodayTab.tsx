import React, { useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRouter } from "expo-router";
import { ChevronDown, ChevronRight, MapPin, Play, Sparkles } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { useDailySession } from "@/src/hooks/useDailySession";
import { estimateSectionMinutes, totalSectionMinutes } from "@/src/lib/dailySectionMinutes";
import { GymSheet } from "./GymSheet";
import { CheckinSheet } from "./CheckinSheet";
import { fetchCapturedWorkout } from "@/src/lib/supabase/capture";
import { formatWorkoutHeadline, formatWorkoutItem } from "@/src/lib/workoutFormat";
import type { SessionSection } from "@/src/types/daily";
import type { CapturedWorkoutEntry } from "@/src/types/capture";

const SECTION_TITLES: Record<SessionSection, string> = {
  warmup: "Warm-up",
  main: "Main work",
  accessory: "Accessories",
  bfr: "BFR finisher",
  cooldown: "Cooldown",
};
const SECTION_ORDER: SessionSection[] = ["warmup", "main", "accessory", "bfr", "cooldown"];

export default function TodayTab() {
  const router = useRouter();
  const [refreshKey, setRefreshKey] = useState(0);
  const [gymSheetVisible, setGymSheetVisible] = useState(false);
  const [checkinVisible, setCheckinVisible] = useState(false);
  const { session, checkin, activeGym, gyms, loading, error, refetch } =
    useDailySession(refreshKey);
  const [refreshing, setRefreshing] = useState(false);
  // Set when today's session is a workout served whole — either one you
  // started from the catalog, or one the composer chose to serve.
  const [served, setServed] = useState<CapturedWorkoutEntry | null>(null);

  const bump = () => setRefreshKey((k) => k + 1);

  const servedId = session?.servedCapturedWorkoutId ?? null;
  useEffect(() => {
    if (!servedId) {
      setServed(null);
      return;
    }
    let alive = true;
    fetchCapturedWorkout(servedId).then((w) => {
      if (alive) setServed(w);
    });
    return () => {
      alive = false;
    };
  }, [servedId]);

  // The estimate stored with the session, or one derived from the items on
  // screen when there is none — a session composed before these existed, or a
  // day the model's timings didn't survive validation.
  const sectionMinutes = useMemo(() => {
    if (!session) return {};
    return Object.keys(session.sectionMinutes).length > 0
      ? session.sectionMinutes
      : estimateSectionMinutes(session.items);
  }, [session]);
  const plannedMinutes = totalSectionMinutes(sectionMinutes);

  const onRefresh = async () => {
    setRefreshing(true);
    bump();
    setTimeout(() => setRefreshing(false), 600);
  };

  const startSession = () => {
    if (!session) return;
    router.push({
      pathname: `/workout/${session.id}`,
      params: {
        mode: "daily",
        ...(session.workoutInstanceId ? { instanceId: session.workoutInstanceId } : {}),
      },
    });
  };

  const gymChip = (
    <TouchableOpacity style={styles.gymChip} onPress={() => setGymSheetVisible(true)} activeOpacity={0.7}>
      <MapPin size={14} color={colors.primary} />
      <Text style={styles.gymChipText}>
        {activeGym ? `at: ${activeGym.name}` : "No gym set — tap to add"}
      </Text>
      <ChevronDown size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh}
            tintColor={colors.primary} colors={[colors.primary]} />
        }
      >
        {gymChip}

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Couldn't build today's session</Text>
            <Text style={styles.emptyText}>{error.message}</Text>
          </View>
        ) : !checkin && !session ? (
          <View style={styles.center}>
            <Sparkles size={32} color={colors.primary} />
            <Text style={styles.emptyTitle}>Check in to build today's session</Text>
            <Text style={styles.emptyText}>
              Ten seconds: soreness, energy, and how long you've got.
            </Text>
            <TouchableOpacity style={styles.button} onPress={() => setCheckinVisible(true)}>
              <Text style={styles.buttonText}>Check in</Text>
            </TouchableOpacity>
          </View>
        ) : !session ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Nothing to work with yet</Text>
            <Text style={styles.emptyText}>
              Capture some exercises in the Exercises tab and pull to refresh.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle}>
                {served
                  ? served.name
                  : session.splitDay === "push"
                    ? "Push day"
                    : session.splitDay === "pull"
                      ? "Pull day"
                      : "Leg day"}
              </Text>
              <View style={styles.badges}>
                {session.rampWeek <= 2 && (
                  <Text style={styles.rampBadge}>Re-entry week {session.rampWeek}</Text>
                )}
                <Text style={styles.sourceBadge}>
                  {session.source === "user_pick"
                    ? "From your catalog"
                    : session.source === "ai"
                      ? "AI composed"
                      : "Rules composed"}
                </Text>
              </View>
              {/* A workout served whole was not composed against your time or
                  soreness, so neither number describes it. */}
              {!served && checkin && (
                <>
                  <TouchableOpacity onPress={() => setCheckinVisible(true)}>
                    <Text style={styles.editCheckin}>
                      Energy {checkin.energy}/10 · {checkin.minutesAvailable} min · edit
                    </Text>
                  </TouchableOpacity>
                  {plannedMinutes > 0 && (
                    <Text style={styles.plannedTotal}>
                      ≈{plannedMinutes} min planned of {checkin.minutesAvailable}
                    </Text>
                  )}
                </>
              )}
              {served && (
                <Text style={styles.editCheckin}>
                  {formatWorkoutHeadline(served.items.length, served.rounds)}
                </Text>
              )}
            </View>

            {served && served.description && (
              <Text style={styles.servedDescription}>{served.description}</Text>
            )}

            {/* One unsectioned list: we did not compose this workout, so
                imposing our warm-up/accessory/cooldown headings on it would
                assert a shape the creator never gave it. */}
            {served
              ? served.items.map((item, i) => {
                  const prescription = formatWorkoutItem(item);
                  return (
                    <TouchableOpacity
                      key={`${item.exerciseId}-${i}`}
                      style={styles.itemCard}
                      activeOpacity={0.7}
                      onPress={() =>
                        router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}. Open the exercise.`}
                    >
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        {prescription !== "" && (
                          <Text style={styles.itemMeta}>{prescription}</Text>
                        )}
                        {item.notes && <Text style={styles.itemReason}>{item.notes}</Text>}
                      </View>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  );
                })
              : SECTION_ORDER.map((section) => {
              const items = session.items.filter((i) => i.section === section);
              if (items.length === 0) return null;
              return (
                <View key={section} style={styles.section}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>{SECTION_TITLES[section]}</Text>
                    {sectionMinutes[section] !== undefined && (
                      <Text style={styles.sectionMinutes}>
                        ~{sectionMinutes[section]} min
                      </Text>
                    )}
                  </View>
                  {items.map((item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.itemCard}
                      activeOpacity={0.7}
                      onPress={() =>
                        router.push(`/(tabs)/training/exercise/${item.exerciseId}` as never)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`${item.name}. Open the exercise.`}
                    >
                      <View style={styles.itemBody}>
                        <Text style={styles.itemName}>{item.name}</Text>
                        <Text style={styles.itemMeta}>
                          {[
                            item.targetSets ? `${item.targetSets} × ${item.targetReps ?? "?"}` : item.targetReps,
                            item.restSeconds ? `rest ${item.restSeconds}s` : null,
                          ].filter(Boolean).join(" · ")}
                        </Text>
                        {item.reason && <Text style={styles.itemReason}>{item.reason}</Text>}
                      </View>
                      <ChevronRight size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  ))}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {session && session.status !== "completed" && (
        <TouchableOpacity style={styles.startButton} onPress={startSession} activeOpacity={0.8}>
          <Play size={18} color="#FFFFFF" />
          <Text style={styles.buttonText}>
            {session.workoutInstanceId ? "Continue session" : "Start session"}
          </Text>
        </TouchableOpacity>
      )}

      <GymSheet visible={gymSheetVisible} gyms={gyms}
        onClose={() => setGymSheetVisible(false)}
        onChanged={() => { setGymSheetVisible(false); bump(); }} />
      <CheckinSheet visible={checkinVisible} existing={checkin}
        onClose={() => setCheckinVisible(false)}
        onSaved={() => { setCheckinVisible(false); bump(); }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 96 },
  gymChip: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 16,
  },
  gymChipText: { fontSize: 13, color: colors.foreground, fontWeight: "600" },
  center: { alignItems: "center", paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: "bold", color: colors.foreground },
  emptyText: { fontSize: 14, color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
  button: {
    backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 12,
    paddingHorizontal: 28, marginTop: 12,
  },
  buttonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  sessionHeader: { marginBottom: 12 },
  sessionTitle: { fontSize: 22, fontWeight: "700", color: colors.foreground },
  badges: { flexDirection: "row", gap: 8, marginTop: 6 },
  rampBadge: {
    fontSize: 11, color: "#F59E0B", borderWidth: 1, borderColor: "#F59E0B",
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden",
  },
  sourceBadge: {
    fontSize: 11, color: colors.mutedForeground, borderWidth: 1,
    borderColor: colors.border, borderRadius: 10, paddingHorizontal: 8,
    paddingVertical: 2, overflow: "hidden",
  },
  editCheckin: { fontSize: 13, color: colors.primary, marginTop: 8 },
  servedDescription: {
    fontSize: 14, color: colors.mutedForeground, lineHeight: 20, marginBottom: 4,
  },
  plannedTotal: { fontSize: 13, color: colors.mutedForeground, marginTop: 4 },
  section: { marginTop: 16 },
  sectionHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12, color: colors.mutedForeground, textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionMinutes: { fontSize: 12, color: colors.mutedForeground, letterSpacing: 0.5 },
  itemCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, padding: 12, marginBottom: 8,
  },
  itemBody: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  itemMeta: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
  itemReason: { fontSize: 12, color: colors.primary, marginTop: 6, fontStyle: "italic" },
  startButton: {
    position: "absolute", left: 16, right: 16, bottom: 16, flexDirection: "row",
    gap: 8, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14,
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
  },
});
