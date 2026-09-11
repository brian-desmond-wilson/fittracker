// Spec §4.8 full screen (mock frame 3): "Captured From" with a Posts |
// Creators toggle. Posts is the flat list newest first; Creators is the
// grouped layout (Option A). The tap targets are the strip's: thumbnail →
// the post, workout name → the captured workout, handle → the Exercises tab
// filtered to that creator, and the external-link icon → their profile.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, StatusBar, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { ChevronLeft, ExternalLink } from "lucide-react-native";
import { colors, radii, spacing } from "@/src/theme/tokens";
import { supabase } from "@/src/lib/supabase";
import { fetchExerciseSources } from "@/src/lib/supabase/capture";
import { getLocalDateString } from "@/src/lib/dates";
import { creatorGroups, creatorProfileUrl, postCards } from "@/src/lib/capturedFromModel";
import type { PostCard } from "@/src/lib/capturedFromModel";
import { exerciseFilterParam } from "@/src/lib/exerciseFilterLink";
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import type { CaptureSourceV2 } from "@/src/types/capture";
import { PostThumb } from "./CapturedFromStrip";
import type { CapturedFromTab } from "./CapturedFromStrip";

interface CapturedFromScreenProps {
  exerciseId: string;
  initialTab: CapturedFromTab;
  onClose: () => void;
}

export function CapturedFromScreen({ exerciseId, initialTab, onClose }: CapturedFromScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [today] = useState(() => getLocalDateString());
  const [tab, setTab] = useState<CapturedFromTab>(initialTab);
  const [sources, setSources] = useState<CaptureSourceV2[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const rows = await fetchExerciseSources(exerciseId, user.id);
        if (alive) setSources(rows);
      } catch (e) {
        console.error("CapturedFromScreen load failed:", e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [exerciseId]);

  const cards = useMemo(() => postCards(sources, today), [sources, today]);
  const groups = useMemo(() => creatorGroups(sources, today), [sources, today]);

  const openWorkout = useCallback((id: string) =>
    router.push(`/(tabs)/training/captured-workout/${id}` as never), [router]);
  const openCreator = useCallback((handle: string) =>
    router.navigate({
      pathname: "/(tabs)/training",
      params: { exerciseFilter: exerciseFilterParam({ creators: [handle] }) },
    } as never), [router]);

  const handleLine = (card: { platform: PostCard["platform"]; handle: string; posterHandle: string | null; handleIsPlaceholder?: boolean }) => {
    const profile = card.posterHandle ? creatorProfileUrl(card.platform, card.posterHandle) : null;
    return (
      <View style={styles.handleRow}>
        {card.posterHandle ? (
          <TouchableOpacity onPress={() => openCreator(card.posterHandle!)} accessibilityRole="button"
            accessibilityLabel={`Exercises by ${card.handle}`}>
            <Text style={styles.handle}>{card.handle}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.handle}>{card.handle}</Text>
        )}
        {profile && (
          <TouchableOpacity onPress={() => Linking.openURL(profile)} accessibilityRole="link"
            accessibilityLabel={`Open ${card.handle} on ${card.platform}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <ExternalLink size={13} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const postRow = (card: PostCard, withHandle: boolean) => (
    <View key={card.sourceId} style={styles.postRow}>
      <View style={styles.postThumb}>
        <PostThumb card={card} height={64} />
      </View>
      <View style={styles.postText}>
        {card.workout ? (
          <TouchableOpacity onPress={() => openWorkout(card.workout!.id)} accessibilityRole="button"
            accessibilityLabel={`Open the workout ${card.workoutLabel}`}>
            <Text style={styles.workout} numberOfLines={1}>{card.workoutLabel}</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.demo} numberOfLines={1}>{card.workoutLabel}</Text>
        )}
        <Text style={styles.subline} numberOfLines={1}>{card.subline}</Text>
        {withHandle && (
          <View style={styles.postHandle}>
            <CreatorAvatar handle={card.handle} url={card.avatarUrl} size={18} />
            {handleLine(card)}
          </View>
        )}
      </View>
    </View>
  );

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.back} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Captured From</Text>
        </View>

        <View style={styles.seg} accessibilityRole="tablist">
          {(["posts", "creators"] as CapturedFromTab[]).map((t) => {
            const on = t === tab;
            return (
              <TouchableOpacity key={t} style={[styles.segItem, on && styles.segItemOn]} onPress={() => setTab(t)}
                accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Text style={[styles.segText, on && styles.segTextOn]}>{t === "posts" ? "Posts" : "Creators"}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator size="large" color={colors.brand} /></View>
        ) : (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}>
            {tab === "posts"
              ? cards.map((c) => postRow(c, true))
              : groups.map((g) => (
                  <View key={g.key} style={styles.group}>
                    <View style={styles.groupHeader}>
                      <CreatorAvatar handle={g.handle} url={g.avatarUrl} size={32} />
                      <View style={styles.groupText}>
                        {handleLine(g)}
                        <Text style={styles.subline}>{g.countLabel}</Text>
                      </View>
                    </View>
                    {g.posts.map((c) => postRow(c, false))}
                  </View>
                ))}
            {cards.length === 0 && <Text style={styles.empty}>Nothing captured for this exercise.</Text>}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  back: { minWidth: 40, height: 40, alignItems: "flex-start", justifyContent: "center", paddingHorizontal: spacing.sm },
  title: { fontSize: 22, fontWeight: "700", color: colors.text },
  seg: {
    flexDirection: "row", marginHorizontal: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.surface2, borderRadius: radii.control, padding: 3,
  },
  segItem: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: radii.control - 2 },
  segItemOn: { backgroundColor: colors.brand },
  segText: { fontSize: 13, fontWeight: "600", color: colors.textMuted },
  segTextOn: { color: colors.onBrand },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingHorizontal: spacing.lg },
  postRow: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  postThumb: { width: 64 },
  postText: { flex: 1, justifyContent: "center", gap: 2 },
  workout: { fontSize: 15, fontWeight: "600", color: colors.brand },
  demo: { fontSize: 15, fontWeight: "600", color: colors.text },
  subline: { fontSize: 12, color: colors.textMuted },
  postHandle: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: 2 },
  handleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  handle: { fontSize: 13, fontWeight: "600", color: colors.text },
  group: { marginTop: spacing.lg },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.xs },
  groupText: { flex: 1 },
  empty: { paddingVertical: spacing.xxxl, textAlign: "center", color: colors.textMuted, fontSize: 14 },
});
