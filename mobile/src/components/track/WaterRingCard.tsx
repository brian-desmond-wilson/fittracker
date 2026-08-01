import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Pencil } from "lucide-react-native";
import { colors, icons, spacing, typography } from "@/src/theme/tokens";
import { Button, Card } from "@/src/components/ui";
import { WaterProgressRing } from "./WaterProgressRing";
import { PaceState } from "@/src/lib/waterStats";
import {
  WaterUnit,
  formatGoal,
  formatAmount,
} from "@/src/lib/waterUnits";

interface WaterRingCardProps {
  currentOz: number;
  effectiveGoalOz: number;
  displayUnit: WaterUnit;
  pace: PaceState | null;
  bonusActive: boolean;
  workoutBonusOz: number;
  isViewingToday: boolean;
  selectedDateLabel: string;
  onGoToToday: () => void;
  onOpenGoalEditor: () => void;
}

function PaceLine({ pace, unit }: { pace: PaceState; unit: WaterUnit }) {
  switch (pace.status) {
    case "before_window":
    case "after_window":
      return null;
    case "goal_hit":
      return <Text style={[paceStyles.text, paceStyles.good]}>Goal hit! ✓</Text>;
    case "on_pace":
      return (
        <Text style={[paceStyles.text, paceStyles.neutral]}>
          On pace · keep it up
        </Text>
      );
    case "ahead":
      return (
        <Text style={[paceStyles.text, paceStyles.good]}>
          {formatAmount(pace.ozAhead ?? 0, unit)} ahead of pace
        </Text>
      );
    case "behind":
      return (
        <Text style={[paceStyles.text, paceStyles.behind]}>
          {formatAmount(pace.ozBehind ?? 0, unit)} behind · Drink{" "}
          {formatAmount(pace.catchUpOz ?? 0, unit)} by {pace.catchUpTimeLabel}
        </Text>
      );
  }
}

export function WaterRingCard({
  currentOz,
  effectiveGoalOz,
  displayUnit,
  pace,
  bonusActive,
  workoutBonusOz,
  isViewingToday,
  selectedDateLabel,
  onGoToToday,
  onOpenGoalEditor,
}: WaterRingCardProps) {
  return (
    <Card variant="panel" style={styles.ringCard}>
      <WaterProgressRing
        current={currentOz}
        goal={effectiveGoalOz}
        unit={displayUnit}
      />
      {pace && <PaceLine pace={pace} unit={displayUnit} />}
      <View style={styles.loggingToRow}>
        <Text style={styles.loggingToText}>
          Logging to: <Text style={styles.loggingToValue}>{selectedDateLabel}</Text>
        </Text>
        {!isViewingToday && (
          <Button variant="ghost" size="sm" label="Today" onPress={onGoToToday} />
        )}
      </View>
      <TouchableOpacity
        onPress={onOpenGoalEditor}
        style={styles.goalRow}
        activeOpacity={0.7}
      >
        <Text style={styles.goalText}>
          Goal: {formatGoal(effectiveGoalOz, displayUnit)}
          {bonusActive && (
            <Text style={styles.goalBonusText}>
              {" "}
              · +{formatAmount(workoutBonusOz, displayUnit)} workout
            </Text>
          )}
        </Text>
        <Pencil size={icons.sm} color={colors.textMuted} />
      </TouchableOpacity>
    </Card>
  );
}

const styles = StyleSheet.create({
  // Placement the `Card` primitive cannot express; the panel recipe owns
  // surface, radius, padding and border.
  ringCard: {
    marginHorizontal: spacing.screenGutter,
    marginBottom: spacing.lg,
    alignItems: "center",
  },
  loggingToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  loggingToText: {
    ...typography.body,
    color: colors.textMuted,
  },
  loggingToValue: {
    color: colors.text,
    fontWeight: "600",
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  goalText: {
    ...typography.body,
    color: colors.textMuted,
  },
  goalBonusText: {
    color: colors.success,
    fontWeight: "600",
  },
});

// Pace is status TEXT, not a control — the same three-way split
// `WaterIntakeHomeCard` already ships on Home.
const paceStyles = StyleSheet.create({
  text: {
    ...typography.body,
    marginTop: spacing.md,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
  },
  neutral: {
    color: colors.accents.water,
    fontWeight: "600",
  },
  good: {
    color: colors.success,
    fontWeight: "600",
  },
  behind: {
    color: colors.warning,
    fontWeight: "600",
  },
});
