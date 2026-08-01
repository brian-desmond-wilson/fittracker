import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Droplet } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
import { Card } from "@/src/components/ui";
import { colors, icons, radii, spacing, tint, typography } from "@/src/theme/tokens";
import { computePace, PaceState } from "@/src/lib/waterStats";
import {
  WaterUnit,
  formatVolume,
  formatGoal,
  formatAmount,
} from "@/src/lib/waterUnits";

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Settings {
  goalOz: number;
  windowStart: string;
  windowEnd: string;
  bonusOz: number;
  displayUnit: WaterUnit;
  waterOnly: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  goalOz: 64,
  windowStart: "08:00",
  windowEnd: "23:00",
  bonusOz: 0,
  displayUnit: "oz",
  waterOnly: false,
};

interface WaterIntakeHomeCardProps {
  refreshKey?: number;
}

export function WaterIntakeHomeCard({ refreshKey }: WaterIntakeHomeCardProps) {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [todayOz, setTodayOz] = useState(0);
  const [hasWorkoutToday, setHasWorkoutToday] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const today = getLocalDate();

      const [profileRes, logsRes, workoutRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "target_water_oz, water_window_start, water_window_end, water_workout_bonus_oz, water_display_unit, water_only_counts"
          )
          .eq("id", user.id)
          .single(),
        supabase
          .from("water_logs")
          .select("amount_oz, beverage_type")
          .eq("user_id", user.id)
          .eq("date", today),
        supabase
          .from("workout_instances")
          .select("id")
          .eq("user_id", user.id)
          .eq("scheduled_date", today)
          .in("status", ["in_progress", "completed"])
          .limit(1),
      ]);

      const p = profileRes.data;
      const next: Settings = {
        goalOz: p?.target_water_oz ?? DEFAULT_SETTINGS.goalOz,
        windowStart: (p?.water_window_start || DEFAULT_SETTINGS.windowStart).slice(0, 5),
        windowEnd: (p?.water_window_end || DEFAULT_SETTINGS.windowEnd).slice(0, 5),
        bonusOz: p?.water_workout_bonus_oz ?? 0,
        displayUnit: p?.water_display_unit === "L" ? "L" : "oz",
        waterOnly: !!p?.water_only_counts,
      };
      setSettings(next);

      const total = (logsRes.data ?? []).reduce((sum, l) => {
        if (next.waterOnly && l.beverage_type !== "water") return sum;
        return sum + Number(l.amount_oz);
      }, 0);
      setTodayOz(total);

      setHasWorkoutToday((workoutRes.data ?? []).length > 0);
    } catch (error) {
      console.error("WaterIntakeHomeCard load failed:", error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load, refreshKey])
  );

  const effectiveGoal =
    settings.goalOz + (hasWorkoutToday ? settings.bonusOz : 0);

  const pace: PaceState = computePace({
    currentOz: todayOz,
    goalOz: effectiveGoal,
    windowStart: settings.windowStart,
    windowEnd: settings.windowEnd,
  });

  const ratio = effectiveGoal > 0 ? Math.min(todayOz / effectiveGoal, 1) : 0;
  const isHit = todayOz >= effectiveGoal && effectiveGoal > 0;

  const statusInfo = ((): { text: string; color: string } | null => {
    switch (pace.status) {
      case "goal_hit":
        return { text: "goal hit ✓", color: colors.success };
      case "on_pace":
        return { text: "on pace", color: colors.accents.water };
      case "ahead":
        return {
          text: `${formatAmount(pace.ozAhead ?? 0, settings.displayUnit)} ahead`,
          color: colors.success,
        };
      case "behind":
        return {
          text: `${formatAmount(pace.ozBehind ?? 0, settings.displayUnit)} behind`,
          color: colors.warning,
        };
      case "before_window":
      case "after_window":
      default:
        return null;
    }
  })();

  return (
    <Card
      variant="panel"
      style={styles.cardSizing}
      onPress={() => router.push("/(tabs)/track/water")}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Water Intake</Text>
        <View style={[styles.iconContainer, isHit && styles.iconContainerHit]}>
          <Droplet
            size={icons.md}
            color={isHit ? colors.success : colors.accents.water}
            strokeWidth={icons.strokeWidth}
          />
        </View>
      </View>
      <Text style={[styles.cardValue, isHit && styles.cardValueHit]}>
        {formatVolume(todayOz, settings.displayUnit)}
      </Text>
      <Text style={styles.cardSubtext} numberOfLines={1}>
        of {formatGoal(effectiveGoal, settings.displayUnit)}
        {statusInfo && (
          <>
            {" · "}
            <Text style={{ color: statusInfo.color, fontWeight: "600" }}>
              {statusInfo.text}
            </Text>
          </>
        )}
      </Text>
      <View style={styles.progressTrack}>
        <View
          style={[
            styles.progressFill,
            { width: `${ratio * 100}%` },
            isHit && styles.progressFillHit,
          ]}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  // `Card variant="panel"` owns surface/radius/padding/border; the half-width
  // grid sizing the old bespoke `card` style also carried lives here.
  cardSizing: {
    width: "47%",
    minWidth: 160,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.lg,
  },
  cardTitle: {
    ...typography.body,
    color: colors.textMuted,
    flex: 1,
  },
  iconContainer: {
    backgroundColor: tint(colors.accents.water),
    borderRadius: radii.control,
    padding: spacing.sm,
  },
  iconContainerHit: {
    backgroundColor: tint(colors.success),
  },
  // 22 is between `titleRoot` (28) and `rowTitle` (16) with no token in
  // between; kept, since shrinking the card's headline number to 16 or growing
  // it to 28 in a half-width tile is a layout change, not a restyle. `"bold"`
  // is spec-banned outside `titleRoot`, so the weight converges to "700".
  cardValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  cardValueHit: {
    color: colors.success,
  },
  cardSubtext: {
    ...typography.caption,
    marginBottom: spacing.md,
  },
  progressTrack: {
    height: 4,
    backgroundColor: colors.textFaint,
    borderRadius: radii.pill,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.accents.water,
    borderRadius: radii.pill,
  },
  progressFillHit: {
    backgroundColor: colors.success,
  },
});
