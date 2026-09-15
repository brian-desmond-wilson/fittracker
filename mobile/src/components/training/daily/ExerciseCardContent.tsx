// The visual body of a captured-exercise card, split out so more than one
// caller can wear the exact same look. Purely presentational: it renders the
// thumbnail, badge, body rows and an optional right slot from props, and knows
// nothing about swiping, deletion, or how the facts were derived.
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image } from "react-native";
import { Hash, Weight, Timer, Target } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { colors, spacing, radii, tint } from "@/src/theme/tokens";
import { EquipmentGlyph } from "@/src/components/ui/EquipmentGlyph";
import { MuscleIcon } from "@/src/components/ui/MuscleIcon";
import { SkillPill } from "@/src/components/ui/SkillPill";
import type { CatalogCardFacts } from "@/src/lib/catalogCardFacts";

const THUMB = 96;
const PRIMARY_ICON = 36;
const SECONDARY_ICON = 26;
// Past two, extra secondary icons stop informing and start crowding; the names line still lists them all.
const MAX_SECONDARY_ICONS = 2;

/** One glyph per scoring type; anything unfamiliar gets a target. */
const SCORE_ICON: Record<string, LucideIcon> = { Reps: Hash, Load: Weight, Time: Timer };
// Own keys only: a scoring type named like an Object.prototype member must not
// come back as a function and get rendered.
const scoreIcon = (name: string): LucideIcon =>
  Object.prototype.hasOwnProperty.call(SCORE_ICON, name) ? SCORE_ICON[name] : Target;

interface ExerciseCardContentProps {
  name: string;
  imageUrl: string | null;
  facts: CatalogCardFacts;
  /** Optional extra line under the score row (Today session use). */
  prescription?: string | null;
  /** Optional right slot (chevron or drag handle); defaults to nothing. */
  right?: React.ReactNode;
  onPress?: () => void;
  /** Hold-to-reorder for the Today session's draggable list. */
  onLongPress?: () => void;
  accessibilityLabel?: string;
}

export function ExerciseCardContent({
  name,
  imageUrl,
  facts,
  prescription,
  right,
  onPress,
  onLongPress,
  accessibilityLabel,
}: ExerciseCardContentProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={onLongPress ? 200 : undefined}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {/* The exercise's own picture, never the post it came from — that
          belongs to the workout card. No picture yet: the primary-muscle
          silhouette stands in so the slot reads as intentional. The rank
          badge sits in the picture's bottom-right corner, off the title row. */}
      <View style={styles.thumbWrap}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, styles.thumbEmpty]}>
            {facts.primaryMuscle && <MuscleIcon muscle={facts.primaryMuscle} size={52} dim />}
          </View>
        )}
        {facts.badge && (
          <View style={[styles.badgeOverlay, facts.badge.kind === "core" ? styles.badgeOverlayCore : styles.badgeOverlayTier]}>
            <Text style={[styles.badgeText, facts.badge.kind === "core" ? styles.badgeTextCore : styles.badgeTextTier]}>
              {facts.badge.label}
            </Text>
          </View>
        )}
      </View>
      <View style={styles.body}>
        {/* Row 1: name. One line — shrinks to a floor rather than wrapping. */}
        <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>
          {name}
        </Text>

        {/* Row 2: skill on the left, equipment badges to its right. Their
            own row so equipment never wraps under the skill label. */}
        {(facts.skillLevel || facts.equipment.length > 0) && (
          <View style={styles.rail}>
            {facts.skillLevel && <SkillPill level={facts.skillLevel} showLabel />}
            {facts.equipment.length > 0 && (
              <View style={styles.equipment}>
                {facts.equipment.map((e) => (
                  <View key={e} style={styles.equipBadge}>
                    <EquipmentGlyph name={e} size={16} color={colors.brand} />
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Row 3: muscles — primary large, up to two dimmed secondaries, all named. */}
        {facts.primaryMuscle && (
          <View style={styles.muscles}>
            <MuscleIcon muscle={facts.primaryMuscle} size={PRIMARY_ICON} />
            {facts.secondaryMuscles.slice(0, MAX_SECONDARY_ICONS).map((m) => (
              <MuscleIcon key={m} muscle={m} size={SECONDARY_ICON} dim />
            ))}
            <View style={styles.muscleNames}>
              <Text style={styles.musclePrimary} numberOfLines={1}>{facts.primaryMuscle}</Text>
              {facts.secondaryMuscles.length > 0 && (
                <Text style={styles.muscleSecondary} numberOfLines={1}>
                  {facts.secondaryMuscles.join(", ")}
                </Text>
              )}
            </View>
          </View>
        )}

        {/* Row 3: how it's scored. The creator stays off the card by design —
            attribution lives on the exercise page. */}
        {facts.scoringTypes.length > 0 && (
          <View style={styles.footer}>
            {facts.scoringTypes.map((s) => {
              const Icon = scoreIcon(s);
              return (
                <View key={s} style={styles.score}>
                  <Icon size={13} color={colors.textMuted} strokeWidth={1.8} />
                  <Text style={styles.scoreText}>{s}</Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Optional prescription — the Today session's set/rep call, on its own
            line under the score chips. */}
        {prescription ? <Text style={styles.prescription}>{prescription}</Text> : null}
      </View>

      {right != null && <View style={styles.chevron}>{right}</View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // No padding on the card: the thumbnail sits flush to the left/top/bottom
  // edges and the card's own rounded corners (overflow: hidden) clip it — the
  // same full-bleed treatment as the curated Exercises/Movements cards.
  card: {
    flexDirection: "row", alignItems: "stretch",
    backgroundColor: colors.surface2,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border,
    overflow: "hidden",
  },
  // Fixed width, stretched to the card's full height; the card clip supplies
  // the rounded left corners, and it anchors the absolute badge overlay.
  thumbWrap: { width: THUMB, alignSelf: "stretch" },
  // flex-fill (not height:"100%") so the image takes the card's resolved height
  // instead of falling back to its huge intrinsic size.
  thumb: { width: "100%", flex: 1 },
  // No photo yet: the primary-muscle silhouette stands in, centered and dimmed.
  thumbEmpty: { backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  // The text side carries the padding the card no longer has.
  body: { flex: 1, minWidth: 0, gap: spacing.sm, padding: spacing.md },
  name: { fontSize: 16, fontWeight: "700", color: colors.text, letterSpacing: -0.2 },
  // Rank badge over the picture: a dark scrim chip so the coloured text reads
  // on any photo, tucked into the bottom-right corner.
  badgeOverlay: {
    position: "absolute", bottom: spacing.sm, right: spacing.sm,
    borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1,
    backgroundColor: tint(colors.bg, 0.82),
  },
  badgeOverlayTier: { borderColor: colors.tier },
  badgeOverlayCore: { borderColor: colors.brand },
  badgeText: { fontSize: 10.5, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  badgeTextTier: { color: colors.tier },
  badgeTextCore: { color: colors.brand },
  rail: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  // Shrinkable so a long gear list wraps onto a second line instead of being clipped.
  equipment: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0, flexWrap: "wrap" },
  // Each glyph sits in its own rounded-square badge, styled like a selected
  // equipment tile on the Filters page: brand icon + border on a brand tint.
  equipBadge: {
    width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center",
    backgroundColor: tint(colors.brand), borderWidth: 1, borderColor: colors.brand,
  },
  muscles: { flexDirection: "row", alignItems: "center", gap: 6, flexShrink: 1, minWidth: 0 },
  muscleNames: { flexShrink: 1, minWidth: 0 },
  musclePrimary: { fontSize: 11.5, fontWeight: "600", color: colors.text, lineHeight: 14 },
  muscleSecondary: { fontSize: 11.5, color: colors.textMuted, lineHeight: 14 },
  footer: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  score: {
    flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: radii.pill,
    backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
  },
  scoreText: { fontSize: 11.5, color: colors.textMuted },
  prescription: { fontSize: 12, color: colors.textMuted },
  chevron: { justifyContent: "center", paddingRight: spacing.md },
});
