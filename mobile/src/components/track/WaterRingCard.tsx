import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Pencil } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
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
    <View style={styles.ringCard}>
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
          <TouchableOpacity onPress={onGoToToday} activeOpacity={0.7}>
            <Text style={styles.todayLink}>Today</Text>
          </TouchableOpacity>
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
        <Pencil size={14} color={colors.mutedForeground} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  ringCard: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 20,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    alignItems: "center",
  },
  loggingToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },
  loggingToText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  loggingToValue: {
    color: colors.foreground,
    fontWeight: "600",
  },
  todayLink: {
    fontSize: 14,
    color: "#3B82F6",
    fontWeight: "600",
  },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
  },
  goalText: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  goalBonusText: {
    color: "#22C55E",
    fontWeight: "600",
  },
});

const paceStyles = StyleSheet.create({
  text: {
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
    paddingHorizontal: 8,
  },
  neutral: {
    color: "#3B82F6",
    fontWeight: "600",
  },
  good: {
    color: "#22C55E",
    fontWeight: "600",
  },
  behind: {
    color: "#F59E0B",
    fontWeight: "600",
  },
});
