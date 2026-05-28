import React, { useCallback, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Droplet } from "lucide-react-native";
import { supabase } from "@/src/lib/supabase";
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
        return { text: "goal hit ✓", color: "#22C55E" };
      case "on_pace":
        return { text: "on pace", color: "#3B82F6" };
      case "ahead":
        return {
          text: `${formatAmount(pace.ozAhead ?? 0, settings.displayUnit)} ahead`,
          color: "#22C55E",
        };
      case "behind":
        return {
          text: `${formatAmount(pace.ozBehind ?? 0, settings.displayUnit)} behind`,
          color: "#F59E0B",
        };
      case "before_window":
      case "after_window":
      default:
        return null;
    }
  })();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push("/(tabs)/track/water")}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>Water Intake</Text>
        <View style={[styles.iconContainer, isHit && styles.iconContainerHit]}>
          <Droplet
            size={20}
            color={isHit ? "#22C55E" : "#3B82F6"}
            strokeWidth={2}
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
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: "#1F2937",
    width: "47%",
    minWidth: 160,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 14,
    color: "#9CA3AF",
    fontWeight: "500",
    flex: 1,
  },
  iconContainer: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
    borderRadius: 8,
    padding: 6,
  },
  iconContainerHit: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  cardValue: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  cardValueHit: {
    color: "#22C55E",
  },
  cardSubtext: {
    fontSize: 11,
    color: "#9CA3AF",
    marginBottom: 10,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    backgroundColor: "#3B82F6",
    borderRadius: 2,
  },
  progressFillHit: {
    backgroundColor: "#22C55E",
  },
});
