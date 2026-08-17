import React, { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ChevronRight, Flame } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import { getLocalDateString } from "@/src/components/workout-session/helpers";
import { fetchTodaySession } from "@/src/lib/supabase/daily";
import type { StoredSession } from "@/src/types/daily";

/** Compact Home surface for the generated daily session. Read-only: it shows
 *  what exists and routes to the Today tab; composition happens there. */
export function DailySessionHomeCard() {
  const router = useRouter();
  const [session, setSession] = useState<StoredSession | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoaded(true); return; }
      fetchTodaySession(user.id, getLocalDateString())
        .then(setSession)
        .finally(() => setLoaded(true));
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  // The session changes off-screen: starting it flips the row to `accepted`
  // and finishing it to `completed`, both from the logging screen. Without
  // re-reading on focus the card still says "ready" for a workout already
  // done, until something else happens to refresh Home.
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!loaded) return null;

  const title = !session
    ? "Check in to build today's session"
    : session.status === "completed"
      ? "Today's session — done 💪"
      : session.splitDay === "push" ? "Push day is ready"
      : session.splitDay === "pull" ? "Pull day is ready"
      : "Leg day is ready";

  const subtitle = session
    ? `${session.items.length} movements · ${session.source === "ai" ? "AI composed" : "rules composed"}`
    : "Soreness, energy, time — ten seconds";

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => router.push("/(tabs)/training")}
    >
      <View style={styles.iconWrap}><Flame size={20} color={colors.primary} /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12,
    backgroundColor: colors.muted, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, padding: 14,
  },
  iconWrap: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.primary}20`,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 15, fontWeight: "600", color: colors.foreground },
  subtitle: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
});
