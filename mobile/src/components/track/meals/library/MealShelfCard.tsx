// A cover on a shelf — the Available posture.
//
// Deliberately thin where the row is thick: this view answers "what can I eat
// right now", and everything on screen has already passed that test, so the
// card carries identity (picture, name, source), the two numbers you choose
// on, and a way to act. What's missing, what got substituted and when you last
// ate it are questions for All mode, where there is room to answer them.
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { colors, radii, spacing, tint, typography } from "@/src/theme/tokens";
import type { MealCard } from "@/src/lib/mealLibraryView";

interface MealShelfCardProps {
  card: MealCard;
  onPress: (card: MealCard) => void;
  onLog: (card: MealCard) => void;
  busyMealId: string | null;
}

const CARD_WIDTH = 150;

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function MealShelfCardInner({ card, onPress, onLog, busyMealId }: MealShelfCardProps) {
  const busy = busyMealId === card.meal.id;
  const expiring = card.rescueDaysLeft !== null && card.rescueDaysLeft <= 3;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={() => onPress(card)}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${card.meal.name}, ${card.nutrition.totals.calories} calories, score ${card.score}`}
    >
      <View style={s.cover}>
        {card.faceUrl ? (
          <Image source={{ uri: card.faceUrl }} style={s.coverImage} resizeMode="cover" />
        ) : (
          <Text style={s.initials}>{initials(card.meal.name)}</Text>
        )}
        {/* Over the picture rather than beside it — the cover is the biggest
            thing on this card and giving state its own row would shrink it. */}
        <View style={s.scorePill}>
          <Text style={s.scoreText}>{card.score}</Text>
        </View>
        {expiring && (
          <View style={s.expiryPill}>
            <Text style={s.expiryText}>
              {card.rescueDaysLeft === 0 ? "today" : `${card.rescueDaysLeft}d`}
            </Text>
          </View>
        )}
      </View>

      <View style={s.body}>
        <Text style={s.name} numberOfLines={2}>{card.meal.name}</Text>
        {card.source.name ? (
          <Text style={s.source} numberOfLines={1}>{card.source.name}</Text>
        ) : (
          <Text style={s.meta} numberOfLines={1}>
            {card.nutrition.totals.calories} cal · {Math.round(card.nutrition.totals.protein)}g P
          </Text>
        )}
        <TouchableOpacity
          onPress={() => onLog(card)}
          disabled={busy}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.logWrap}
          accessibilityRole="button"
          accessibilityLabel={`Log ${card.meal.name}`}
        >
          <Text style={s.log}>{busy ? "…" : "Log"}</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export const MealShelfCard = React.memo(MealShelfCardInner);

const s = StyleSheet.create({
  card: {
    width: CARD_WIDTH,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.row,
    overflow: "hidden",
  },
  cover: {
    height: 100,
    backgroundColor: colors.imageWell,
    alignItems: "center",
    justifyContent: "center",
  },
  coverImage: { width: "100%", height: "100%" },
  initials: { ...typography.titleRoot, color: colors.labelInk },
  scorePill: {
    position: "absolute",
    top: spacing.sm,
    left: spacing.sm,
    backgroundColor: tint(colors.bg, 0.85), // over an arbitrary photo, so opaque enough to read
    borderWidth: 1,
    borderColor: tint(colors.brand, 0.4),
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  scoreText: { ...typography.caption, color: colors.brand, fontWeight: "700" },
  expiryPill: {
    position: "absolute",
    bottom: spacing.sm,
    left: spacing.sm,
    backgroundColor: tint(colors.bg, 0.85),
    borderWidth: 1,
    borderColor: tint(colors.warning, 0.4),
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  expiryText: { ...typography.caption, color: colors.warning, fontWeight: "700" },

  body: { padding: spacing.sm, gap: 2 },
  name: { ...typography.body, color: colors.text, fontWeight: "600" },
  source: { ...typography.caption, color: colors.accents.meals, fontWeight: "600" },
  meta: { ...typography.caption },
  logWrap: { alignSelf: "flex-end", marginTop: 2 },
  log: { ...typography.buttonSm, color: colors.brand },
});
