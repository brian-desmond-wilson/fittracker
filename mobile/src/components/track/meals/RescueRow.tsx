// "Use these before they turn" (E3).
//
// The recommender already breaks ties with an expiring ingredient, so a rescue
// surfaced only when a meal was going to be suggested anyway — the loop's
// central promise was left to coincidence. This asks from the other end:
// start from the food about to spoil, and name the meals that use the most of
// it.
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, spacing, typography } from "@/src/theme/tokens";
import { Badge, Card } from "@/src/components/ui";
import type { RescueSuggestion } from "@/src/lib/rescuePlan";

interface RescueRowProps {
  suggestions: RescueSuggestion[];
  onMealPress: (mealId: string) => void;
}

export function RescueRow({ suggestions, onMealPress }: RescueRowProps) {
  if (suggestions.length === 0) return null;
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Use these before they turn</Text>
      {suggestions.map((s) => (
        <Card
          key={s.mealId}
          variant="row"
          style={styles.chip}
          onPress={() => onMealPress(s.mealId)}
        >
          <View style={styles.head}>
            <Text style={styles.name} numberOfLines={1}>{s.name}</Text>
            {/* Amber only when it cannot be made: the rescue itself is an
                opportunity, not a warning, and colouring every row amber
                would make the section read as a problem list. */}
            <Badge
              label={
                s.soonestDaysLeft === 0
                  ? "today"
                  : `${s.soonestDaysLeft}d`
              }
              tone={s.assemblable ? "success" : "warning"}
            />
          </View>
          {/* A prepared meal IS its own ingredient, so "Uses Citrus Vanilla
              Cream Muesli" under a meal of that name is a tautology. Name only
              the rescues that are not the meal itself; when none remain, the
              badge has already said everything ("1d"). */}
          {(() => {
            const others = s.rescues.filter(
              (r) => r.toLowerCase() !== s.name.toLowerCase(),
            );
            const short = s.assemblable ? "" : "you're short something";
            const uses = others.length > 0 ? `Uses ${others.join(", ")}` : "";
            const line = [uses, short].filter(Boolean).join(" — ");
            if (!line) return null;
            return (
              <Text style={styles.rescues} numberOfLines={2}>{line}</Text>
            );
          })()}
        </Card>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: spacing.sm, marginBottom: spacing.xs },
  label: { ...typography.section, marginBottom: spacing.sm },
  chip: { marginBottom: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  name: { ...typography.buttonSm, color: colors.text, flexShrink: 1 },
  rescues: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
});
