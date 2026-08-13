// Logging, with the two things the old form assumed.
//
// It assumed a whole portion and it assumed today. Half a smoothie is a real
// log, and so is yesterday's dinner remembered this morning; without either,
// the only honest route was to log a lie and edit it in the day view. Both
// default to what they used to assume, so the common case is still one tap.
//
// The button says what it will write rather than what it is: "Log 400 cal to
// breakfast" changes as the portion and the slot change, which is the only
// confirmation you get before the row exists.
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { Button } from "@/src/components/ui";
import { MEAL_TYPE_LABELS } from "@/src/types/meal-library";
import type { MealType } from "@/src/types/track";

/** Halves, because that is how a portion is actually divided in the kitchen.
 *  Anything finer is a number you would be guessing at. */
export const PORTIONS = [0.5, 1, 1.5, 2] as const;
export type Portion = (typeof PORTIONS)[number];

const PORTION_LABELS: Record<string, string> = {
  "0.5": "½", "1": "1", "1.5": "1½", "2": "2",
};

const MEAL_TYPES: MealType[] = ["breakfast", "lunch", "dinner", "snack", "dessert"];

/** How far back a log may be dated. A week covers "I forgot to log Sunday";
 *  beyond that you are editing history, which the day view is for. */
export const MAX_BACKDATE_DAYS = 7;

interface MealLogCardProps {
  portion: Portion;
  onPortion: (portion: Portion) => void;
  /** Whole days before today; 0 is today. */
  daysAgo: number;
  onDaysAgo: (daysAgo: number) => void;
  mealType: MealType;
  onMealType: (mealType: MealType) => void;
  calories: number;
  logging: boolean;
  onLog: () => void;
}

/** "Today", "Yesterday", then the weekday — the way you'd say it out loud. */
export function dayLabel(daysAgo: number, today: Date = new Date()): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

export function MealLogCard({
  portion, onPortion, daysAgo, onDaysAgo, mealType, onMealType,
  calories, logging, onLog,
}: MealLogCardProps) {
  return (
    <View style={s.card}>
      <Text style={s.cardTitle}>LOG THIS MEAL</Text>

      <View style={s.line}>
        <View style={s.portions}>
          {PORTIONS.map((p, i) => {
            const on = p === portion;
            return (
              <TouchableOpacity
                key={p}
                style={[s.portion, i > 0 && s.portionDivider, on && s.portionOn]}
                onPress={() => onPortion(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${PORTION_LABELS[String(p)]} portion`}
              >
                <Text style={[s.portionText, on && s.portionTextOn]}>
                  {PORTION_LABELS[String(p)]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={s.day}>
          <TouchableOpacity
            onPress={() => onDaysAgo(Math.min(MAX_BACKDATE_DAYS, daysAgo + 1))}
            disabled={daysAgo >= MAX_BACKDATE_DAYS}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="A day earlier"
          >
            <ChevronLeft
              size={icons.sm}
              color={daysAgo >= MAX_BACKDATE_DAYS ? colors.textFaint : colors.textMuted}
              strokeWidth={icons.strokeWidth}
            />
          </TouchableOpacity>
          <Text style={s.dayText}>{dayLabel(daysAgo)}</Text>
          {/* Nothing forward of today: you cannot have eaten it yet. */}
          <TouchableOpacity
            onPress={() => onDaysAgo(Math.max(0, daysAgo - 1))}
            disabled={daysAgo === 0}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="A day later"
          >
            <ChevronRight
              size={icons.sm}
              color={daysAgo === 0 ? colors.textFaint : colors.textMuted}
              strokeWidth={icons.strokeWidth}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.scroller}
        contentContainerStyle={s.slots}
      >
        {MEAL_TYPES.map((t) => {
          const on = t === mealType;
          return (
            <TouchableOpacity
              key={t}
              style={[s.slot, on && s.slotOn]}
              onPress={() => onMealType(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Log as ${MEAL_TYPE_LABELS[t]}`}
            >
              <Text style={[s.slotText, on && s.slotTextOn]}>{MEAL_TYPE_LABELS[t]}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <Button
        label={`Log ${calories} cal to ${MEAL_TYPE_LABELS[mealType].toLowerCase()}`}
        onPress={onLog}
        loading={logging}
        disabled={logging}
        fluid
      />
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.row,
    padding: spacing.md,
    gap: spacing.md,
  },
  cardTitle: { ...typography.caption, color: colors.textMuted, fontWeight: "700" },
  line: { flexDirection: "row", alignItems: "center", gap: spacing.md },

  portions: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.control,
    overflow: "hidden",
  },
  portion: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  portionDivider: { borderLeftWidth: 1, borderLeftColor: colors.border },
  portionOn: { backgroundColor: tint(colors.brand) },
  portionText: { ...typography.body, color: colors.textMuted },
  portionTextOn: { color: colors.brand, fontWeight: "700" },

  day: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginLeft: "auto" },
  dayText: { ...typography.body, color: colors.textMuted, minWidth: 78, textAlign: "center" },

  scroller: { flexGrow: 0 },
  slots: { flexDirection: "row", gap: spacing.sm, paddingRight: spacing.md },
  slot: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  slotOn: { backgroundColor: tint(colors.brand), borderColor: colors.brand },
  slotText: { ...typography.body, color: colors.textMuted },
  slotTextOn: { color: colors.brand, fontWeight: "600" },
});
