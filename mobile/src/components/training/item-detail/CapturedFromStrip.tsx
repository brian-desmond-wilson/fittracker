// Spec §4.8 on the page (Option B): "Captured From" with the tappable
// "N posts · M creators" counts, then a horizontal strip of post cards —
// thumbnail with the avatar badged bottom-left, handle, workout name in
// green (or "Exercise demo"), capture date. The strip fades at the right
// edge to say there is more.
import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ExternalLink } from "lucide-react-native";
import { colors, radii, spacing, tint } from "@/src/theme/tokens";
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import { creatorProfileUrl, postCards, sourceCounts } from "@/src/lib/capturedFromModel";
import { openExternalUrl } from "@/src/lib/openUrl";
import type { PostCard } from "@/src/lib/capturedFromModel";
import type { CaptureSourceV2 } from "@/src/types/capture";

export type CapturedFromTab = "posts" | "creators";

interface CapturedFromStripProps {
  sources: CaptureSourceV2[];
  today: string;
  onOpenCounts: (tab: CapturedFromTab) => void;
  onOpenWorkout: (workoutId: string) => void;
  /** The raw handle; the page turns it into an Exercises-tab filter (§4.4). */
  onOpenCreator: (handle: string) => void;
}

const CARD_WIDTH = 150;
const THUMB_HEIGHT = 110;

/** One post card. Shared with the full screen's rows via PostThumb. */
export function PostThumb({ card, height }: { card: PostCard; height: number }) {
  return (
    <TouchableOpacity style={[styles.thumbWrap, { height }]} onPress={() => openExternalUrl(card.sourceUrl)}
      activeOpacity={0.8} accessibilityRole="link" accessibilityLabel={`Open the ${card.platform} post by ${card.handle}`}>
      {card.thumbnailUrl ? (
        <Image source={{ uri: card.thumbnailUrl }} style={styles.thumb} resizeMode="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbEmpty]} />
      )}
      <View style={styles.avatarBadge}>
        <CreatorAvatar handle={card.handle} url={card.avatarUrl} size={24} />
      </View>
    </TouchableOpacity>
  );
}

export function CapturedFromStrip({
  sources, today, onOpenCounts, onOpenWorkout, onOpenCreator,
}: CapturedFromStripProps) {
  const cards = useMemo(() => postCards(sources, today), [sources, today]);
  const counts = useMemo(() => sourceCounts(sources), [sources]);
  if (cards.length === 0) return null;

  return (
    <View style={styles.section}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Captured From</Text>
        <View style={styles.counts}>
          <TouchableOpacity onPress={() => onOpenCounts("posts")} accessibilityRole="button"
            accessibilityLabel={`See all ${counts.posts} posts`} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.countText}>{counts.posts} {counts.posts === 1 ? "post" : "posts"}</Text>
          </TouchableOpacity>
          <Text style={styles.countDot}> · </Text>
          <TouchableOpacity onPress={() => onOpenCounts("creators")} accessibilityRole="button"
            accessibilityLabel={`See all ${counts.creators} creators`} hitSlop={{ top: 8, bottom: 8 }}>
            <Text style={styles.countText}>{counts.creators} {counts.creators === 1 ? "creator" : "creators"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {cards.map((card) => (
            <View key={card.sourceId} style={styles.card}>
              <PostThumb card={card} height={THUMB_HEIGHT} />
              {card.handleIsPlaceholder ? (
                <Text style={styles.handle} numberOfLines={1}>{card.handle}</Text>
              ) : (
                <View style={styles.handleRow}>
                  <TouchableOpacity style={styles.handleTap} onPress={() => onOpenCreator(card.posterHandle!)}
                    accessibilityRole="button" accessibilityLabel={`Exercises by ${card.handle}`}>
                    <Text style={styles.handle} numberOfLines={1}>{card.handle}</Text>
                  </TouchableOpacity>
                  {/* Decision 6: the profile lives behind a small icon, the handle behind the filter. */}
                  {creatorProfileUrl(card.platform, card.posterHandle!) && (
                    <TouchableOpacity onPress={() => openExternalUrl(creatorProfileUrl(card.platform, card.posterHandle!)!)}
                      accessibilityRole="link" accessibilityLabel={`Open ${card.handle} on ${card.platform}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <ExternalLink size={12} color={colors.textMuted} />
                    </TouchableOpacity>
                  )}
                </View>
              )}
              {card.workout ? (
                <TouchableOpacity onPress={() => onOpenWorkout(card.workout!.id)} accessibilityRole="button"
                  accessibilityLabel={`Open the workout ${card.workoutLabel}`}>
                  <Text style={styles.workout} numberOfLines={1}>{card.workoutLabel}</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.demo} numberOfLines={1}>{card.workoutLabel}</Text>
              )}
              <Text style={styles.date} numberOfLines={1}>{card.dateLabel}</Text>
            </View>
          ))}
        </ScrollView>
        {/* The fade is decoration over the strip's right edge; it must not eat taps. */}
        <LinearGradient pointerEvents="none" colors={[tint(colors.bg, 0), colors.bg]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fade} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, marginBottom: spacing.md,
  },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: colors.text },
  counts: { flexDirection: "row", alignItems: "center" },
  countText: { fontSize: 13, fontWeight: "600", color: colors.brand },
  countDot: { fontSize: 13, color: colors.textFaint },
  strip: { paddingHorizontal: spacing.lg, gap: spacing.md, paddingRight: spacing.xxxl },
  card: { width: CARD_WIDTH, gap: 3 },
  thumbWrap: { width: "100%", borderRadius: radii.row, overflow: "hidden", marginBottom: spacing.xs },
  thumb: { width: "100%", height: "100%" },
  thumbEmpty: { backgroundColor: colors.surface2 },
  avatarBadge: { position: "absolute", left: spacing.sm, bottom: spacing.sm, borderRadius: 14, borderWidth: 2, borderColor: colors.bg },
  handleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  handleTap: { flexShrink: 1 },
  handle: { fontSize: 13, fontWeight: "600", color: colors.text },
  workout: { fontSize: 13, fontWeight: "600", color: colors.brand },
  demo: { fontSize: 13, color: colors.textMuted },
  date: { fontSize: 12, color: colors.textFaint },
  fade: { position: "absolute", right: 0, top: 0, bottom: 0, width: 40 },
});
