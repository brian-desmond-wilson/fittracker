// mobile/src/components/training/workout-detail/WorkoutHero.tsx
// The top of the workout page (spec 2026-09-13 §4.2): the post's thumbnail,
// the format badge top-left, a play glyph, and the title + creator byline
// over a gradient at the bottom. The whole hero opens the post; the byline
// inside it opens the creator's profile. No thumbnail: a flat surface with
// the same text in the same places, and no tap.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Play, ExternalLink } from "lucide-react-native";
import { colors, spacing, tint } from "@/src/theme/tokens";
import { CreatorAvatar } from "@/src/components/ui/CreatorAvatar";
import type { CapturePlatform } from "@/src/types/capture";

const HERO_HEIGHT = 230;

const PLATFORM_NAME: Record<CapturePlatform, string | null> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  other: null,
};

interface WorkoutHeroProps {
  name: string;
  thumbnailUrl: string | null;
  /** From formatBanner(); null hides the badge. */
  badge: string | null;
  platform: CapturePlatform | null;
  handle: string | null;
  avatarUrl: string | null;
  avatarFetchedAt: string | null;
  /** Null when there is no post to open (no thumbnail, or no source). */
  onOpenPost: (() => void) | null;
  /** Null hides the byline's link affordance; the byline still shows the handle. */
  onOpenProfile: (() => void) | null;
}

export function WorkoutHero({
  name, thumbnailUrl, badge, platform, handle, avatarUrl, avatarFetchedAt, onOpenPost, onOpenProfile,
}: WorkoutHeroProps) {
  const platformName = platform ? PLATFORM_NAME[platform] : null;

  const byline = handle ? (
    <TouchableOpacity
      style={styles.byline}
      onPress={onOpenProfile ?? undefined}
      disabled={!onOpenProfile}
      activeOpacity={0.7}
      accessibilityRole={onOpenProfile ? "link" : "text"}
      accessibilityLabel={onOpenProfile ? `Open ${handle} on ${platformName ?? "their platform"}` : handle}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
    >
      <CreatorAvatar handle={handle} url={avatarUrl} fetchedAt={avatarFetchedAt} size={24} />
      <Text style={styles.handle} numberOfLines={1}>{handle.startsWith("@") ? handle : `@${handle}`}</Text>
      {platformName && <Text style={styles.platform}>· {platformName}</Text>}
      {onOpenProfile && <ExternalLink size={12} color={colors.textMuted} />}
    </TouchableOpacity>
  ) : null;

  const text = (
    <View style={styles.overlay}>
      {/* Two lines: a long title ellipsises rather than climbing over the play glyph. */}
      <Text style={[styles.title, !thumbnailUrl && styles.titleFlat]} numberOfLines={2}>{name}</Text>
      {byline}
    </View>
  );

  if (!thumbnailUrl) {
    return (
      <View style={[styles.hero, styles.flat]}>
        {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
        {text}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.hero}
      onPress={onOpenPost ?? undefined}
      disabled={!onOpenPost}
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel="Open the original post"
    >
      <Image source={{ uri: thumbnailUrl }} style={styles.image} resizeMode="cover" />
      <LinearGradient
        colors={[tint(colors.shadow, 0.25), tint(colors.shadow, 0), colors.bg]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      {badge && <View style={styles.badge}><Text style={styles.badgeText}>{badge}</Text></View>}
      {onOpenPost && (
        <View style={styles.play} pointerEvents="none">
          <Play size={20} color={colors.bg} fill={colors.bg} />
        </View>
      )}
      {text}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  hero: { position: "relative", width: "100%", height: HERO_HEIGHT, backgroundColor: colors.surface, overflow: "hidden" },
  flat: { borderBottomWidth: 1, borderBottomColor: colors.border },
  image: { position: "absolute", top: 0, left: 0, width: "100%", height: HERO_HEIGHT },
  badge: {
    position: "absolute", top: spacing.md, left: spacing.md,
    backgroundColor: colors.brand, borderRadius: 6, paddingHorizontal: 9, paddingVertical: 5,
  },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 1, color: colors.bg },
  play: {
    position: "absolute", left: "50%", top: "42%", marginLeft: -22, marginTop: -22,
    width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.text, 0.85),
  },
  overlay: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.md },
  title: {
    fontSize: 24, fontWeight: "800", lineHeight: 28, color: colors.text,
    textShadowColor: tint(colors.shadow, 0.75), textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4,
  },
  titleFlat: { textShadowColor: "transparent" },
  byline: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm, alignSelf: "flex-start" },
  handle: { fontSize: 13, fontWeight: "600", color: colors.brand, flexShrink: 1 },
  platform: { fontSize: 11, color: colors.textMuted },
});
