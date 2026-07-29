import React from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import type { CalorieRampLevel } from "@/src/types/nutrition-preferences";
import type { RampAssessment } from "@/src/lib/rampProgress";
import { nutritionStyles as s } from "./styles";

interface RampCardProps {
  levels: CalorieRampLevel[];
  assessment: RampAssessment | null;
  // Container (Task 11) adapts this to the changeRampLevel RPC call
  // (targetLevelId, todayLocalDate) — this component stays unaware of
  // persistence.
  onChangeLevel: (target: CalorieRampLevel) => void;
}

export function RampCard({ levels, assessment, onChangeLevel }: RampCardProps) {
  const active = levels.find((l) => l.is_active) ?? null;
  const next = active
    ? levels.find((l) => l.level === active.level + 1) ?? null
    : levels[0] ?? null;

  const confirmChange = (target: CalorieRampLevel) => {
    Alert.alert(
      "Change ramp level",
      `Set Level ${target.level} · ${target.name}?\nThis updates your daily targets to ${target.target_calories} cal / ${target.target_protein_g} g protein.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", onPress: () => onChangeLevel(target) },
      ]
    );
  };

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Lean Bulk Ramp</Text>
      {active ? (
        <View style={s.row}>
          <Text style={s.rowLabel}>
            Level {active.level} · {active.name}
          </Text>
          <Text style={s.rowValue}>
            {active.target_calories} cal / {active.target_protein_g} g
          </Text>
        </View>
      ) : (
        <Text style={s.mutedText}>No active level.</Text>
      )}
      {assessment && (
        <Text style={s.mutedText}>
          {assessment.weeklyGainLbs !== null
            ? `Trend: ${assessment.weeklyGainLbs >= 0 ? "+" : ""}${assessment.weeklyGainLbs.toFixed(2)} lb/wk. `
            : ""}
          {assessment.reason}
        </Text>
      )}
      {assessment?.recommendation === "advance" && next && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            Time to advance to Level {next.level} · {next.name} (
            {next.target_calories} cal)?
          </Text>
          <TouchableOpacity
            style={s.primaryButton}
            onPress={() => confirmChange(next)}
          >
            <Text style={s.primaryButtonText}>Advance to {next.name}</Text>
          </TouchableOpacity>
        </View>
      )}
      {assessment?.recommendation === "advance" && !next && active && (
        <View style={s.banner}>
          <Text style={s.bannerText}>
            You&apos;re at the top ramp level. If you&apos;re still
            plateaued, reassess your targets manually.
          </Text>
        </View>
      )}
      <Text style={[s.mutedText, s.mutedTextSpaced]}>Change level manually:</Text>
      <View style={s.chipRow}>
        {levels.map((l) => {
          const isActive = l.id === active?.id;
          return (
            <TouchableOpacity
              key={l.id}
              style={[s.chip, isActive && s.chipActive]}
              disabled={isActive}
              onPress={() => confirmChange(l)}
            >
              <Text style={[s.chipText, isActive && s.chipTextActive]}>
                L{l.level} {l.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
