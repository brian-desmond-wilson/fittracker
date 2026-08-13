// A meal's whole record in one row — the All / Archive posture.
//
// Rows exist because the catalog's questions are mostly informational: can I
// make this, what would it cost me this week, what's missing, when did I last
// eat it, where did it come from. A grid tile can hold a picture and a name;
// only a row holds the answers.
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Star } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Badge, Card } from "@/src/components/ui";
import { substitutionLine, type MealCard } from "@/src/lib/mealLibraryView";

interface MealLibraryRowProps {
  card: MealCard;
  onPress: (card: MealCard) => void;
  onToggleFavorite: (card: MealCard) => void;
  onLog: (card: MealCard) => void;
  onAddMissing: (card: MealCard) => void;
  /** Meal currently being written, so its control can show it. */
  busyMealId: string | null;
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

/** "31× · last Tue" — absent until it has actually been eaten, because "0× ·
 *  never" is noise on a meal you just built. */
export function historyLine(timesLogged: number, lastLoggedDate: string | null, today: Date): string | null {
  if (timesLogged === 0 || !lastLoggedDate) return null;
  const [y, m, d] = lastLoggedDate.split("-").map((n) => parseInt(n, 10));
  const last = new Date(y, (m ?? 1) - 1, d ?? 1);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((start.getTime() - last.getTime()) / 86_400_000);
  const when =
    days <= 0 ? "today"
    : days === 1 ? "yesterday"
    : days < 7 ? last.toLocaleDateString(undefined, { weekday: "long" })
    : last.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${timesLogged}× · last ${when}`;
}

function MealLibraryRowInner({
  card,
  onPress,
  onToggleFavorite,
  onLog,
  onAddMissing,
  busyMealId,
}: MealLibraryRowProps) {
  const { meal, nutrition, source } = card;
  const unavailable = card.availability === "unavailable";
  const busy = busyMealId === meal.id;
  const subs = substitutionLine(nutrition);
  const history = historyLine(card.timesLogged, card.lastLoggedDate, new Date());

  return (
    <Card variant="row" style={s.card} onPress={() => onPress(card)}>
      <View style={s.line}>
        <View style={[s.well, unavailable && s.dim]}>
          {card.faceUrl ? (
            <Image source={{ uri: card.faceUrl }} style={s.wellImage} resizeMode="cover" />
          ) : (
            <Text style={s.initials}>{initials(meal.name)}</Text>
          )}
        </View>

        <View style={s.body}>
          <Text style={[s.name, unavailable && s.dimText]} numberOfLines={2}>
            {meal.name}
          </Text>
          {source.name && <Text style={s.source} numberOfLines={1}>{source.name}</Text>}
          <Text style={s.meta} numberOfLines={2}>
            {nutrition.totals.calories} cal · {Math.round(nutrition.totals.protein)}g P
            {" · "}{Math.round(nutrition.totals.fiber_g)}g fiber
            {card.prepMinutes > 0 ? ` · ${card.prepMinutes} min` : ""}
          </Text>
          {history && <Text style={s.history}>{history}</Text>}
        </View>

        <View style={s.end}>
          <View style={s.endTop}>
            <TouchableOpacity
              onPress={() => onToggleFavorite(card)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityState={{ selected: card.isFavorite }}
              accessibilityLabel={card.isFavorite ? `Unfavorite ${meal.name}` : `Favorite ${meal.name}`}
            >
              <Star
                size={icons.md}
                color={card.isFavorite ? colors.warning : colors.textFaint}
                fill={card.isFavorite ? colors.warning : "transparent"}
                strokeWidth={icons.strokeWidth}
              />
            </TouchableOpacity>
            <Badge tone={card.score >= 85 ? "success" : card.score >= 70 ? "warning" : "neutral"} label={`${card.score}`} />
          </View>
          {card.availability === "not_tracked" ? (
            <Badge tone="neutral" label="Eaten out" />
          ) : unavailable ? null : (
            <TouchableOpacity
              onPress={() => onLog(card)}
              disabled={busy}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={`Log ${meal.name}`}
            >
              <Text style={s.log}>{busy ? "…" : "Log"}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* At most one note per row, in order of what would change your mind:
          a gap you could close, then food about to go, then this week's
          swap. Stacking all three turns a card into a paragraph. */}
      {card.missing.length > 0 ? (
        <TouchableOpacity
          onPress={() => onAddMissing(card)}
          disabled={busy}
          style={s.noteRow}
          accessibilityRole="button"
          accessibilityLabel={`Add ${card.missing.join(", ")} to your shopping list`}
        >
          <Text style={s.warnNote}>
            Missing: {card.missing.join(", ")} — <Text style={s.underline}>add to shopping list</Text>
          </Text>
        </TouchableOpacity>
      ) : card.unlinked.length > 0 ? (
        <Text style={s.faintNote}>
          Can&apos;t check {card.unlinked.join(", ")} — not linked to anything in your inventory
        </Text>
      ) : card.rescueDaysLeft !== null && card.rescueDaysLeft <= 3 ? (
        <Text style={s.warnNote}>
          uses food expiring {card.rescueDaysLeft === 0 ? "today" : `in ${card.rescueDaysLeft}d`}
        </Text>
      ) : subs ? (
        <Text style={s.subNote}>{subs}</Text>
      ) : null}
    </Card>
  );
}

/** Memoised: the library re-renders on every filter keystroke, and these rows
 *  carry an image each. Every prop above is stable per meal except the busy
 *  id, which changes at most twice per log. */
export const MealLibraryRow = React.memo(MealLibraryRowInner);

const s = StyleSheet.create({
  card: { marginBottom: spacing.md },
  line: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  well: {
    width: 80,
    height: 80,
    borderRadius: radii.row,
    backgroundColor: colors.imageWell,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  wellImage: { width: "100%", height: "100%" },
  initials: { ...typography.titleBar, color: colors.labelInk },
  dim: { opacity: 0.55 },
  dimText: { color: colors.textMuted },

  body: { flex: 1, minWidth: 0 },
  name: { ...typography.rowTitle, color: colors.text },
  source: { ...typography.caption, color: colors.accents.meals, fontWeight: "600", marginTop: 1 },
  meta: { ...typography.caption, marginTop: 3 },
  history: { ...typography.caption, color: colors.textFaint, marginTop: 3 },

  end: { alignItems: "flex-end", gap: spacing.sm },
  endTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  log: { ...typography.buttonSm, color: colors.brand },

  noteRow: { marginTop: spacing.sm },
  warnNote: { ...typography.caption, color: colors.warning, fontWeight: "600" },
  underline: { textDecorationLine: "underline" },
  faintNote: { ...typography.caption, color: colors.textFaint, marginTop: spacing.sm },
  subNote: { ...typography.caption, color: colors.macros.under, marginTop: spacing.sm },
});
