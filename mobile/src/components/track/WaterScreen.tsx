import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  Modal,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Droplets,
  Trash2,
  Pencil,
  Calendar as CalendarIcon,
  Sliders,
  Share2,
  Undo2,
} from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "@/src/lib/colors";
import { WaterLog, WaterBeverageType } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { WaterProgressRing } from "./WaterProgressRing";
import { WaterBarChart } from "./WaterBarChart";
import {
  computeCurrentStreak,
  computeBestStreak,
  computeRollingStats,
  buildDailySeries,
  computePace,
  PaceState,
} from "@/src/lib/waterStats";
import {
  WaterUnit,
  OZ_PER_LITER,
  formatVolume,
  formatGoal,
  formatAmount,
  ozToLiters,
  BEVERAGE_TYPES,
  BeverageType,
  beverageLabel,
  beverageColor,
} from "@/src/lib/waterUnits";

const DEFAULT_QUICK_ADD: number[] = [8, 12, 16, 20];
const DEFAULT_QUICK_ADD_NAMES: string[] = ["", "", "", ""];
const DEFAULT_QUICK_ADD_TYPES: BeverageType[] = ["water", "water", "water", "water"];

function getLocalDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeek(d: Date): Date {
  const result = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  result.setDate(result.getDate() - result.getDay()); // Sunday = 0
  return result;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

const DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

interface WaterScreenProps {
  onClose: () => void;
}

function PaceLine({ pace, unit }: { pace: PaceState; unit: WaterUnit }) {
  switch (pace.status) {
    case "before_window":
      return null;
    case "after_window":
      return null;
    case "goal_hit":
      return (
        <Text style={[paceStyles.text, paceStyles.good]}>Goal hit! ✓</Text>
      );
    case "on_pace":
      return (
        <Text style={[paceStyles.text, paceStyles.neutral]}>On pace · keep it up</Text>
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

export function WaterScreen({ onClose }: WaterScreenProps) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [addAmount, setAddAmount] = useState("");

  // Goal
  const [goalOz, setGoalOz] = useState(64);
  const [goalModalVisible, setGoalModalVisible] = useState(false);
  const [goalDraft, setGoalDraft] = useState("");
  const [goalUnit, setGoalUnit] = useState<WaterUnit>("oz");
  const [savingGoal, setSavingGoal] = useState(false);

  // Pace + bonus
  const [windowStart, setWindowStart] = useState("08:00");
  const [windowEnd, setWindowEnd] = useState("23:00");
  const [workoutBonusOz, setWorkoutBonusOz] = useState(0);
  const [hasWorkoutToday, setHasWorkoutToday] = useState(false);

  // Quick-add config
  const [quickAddAmounts, setQuickAddAmounts] = useState<number[]>(DEFAULT_QUICK_ADD);
  const [quickAddNames, setQuickAddNames] = useState<string[]>(DEFAULT_QUICK_ADD_NAMES);
  const [quickAddTypes, setQuickAddTypes] = useState<BeverageType[]>(DEFAULT_QUICK_ADD_TYPES);
  const [quickAddEditVisible, setQuickAddEditVisible] = useState(false);
  const [quickAddDrafts, setQuickAddDrafts] = useState<string[]>([]);
  const [quickAddNameDrafts, setQuickAddNameDrafts] = useState<string[]>([]);
  const [quickAddTypeDrafts, setQuickAddTypeDrafts] = useState<BeverageType[]>([]);
  const [savingQuickAdd, setSavingQuickAdd] = useState(false);

  // Display + filtering
  const [displayUnit, setDisplayUnit] = useState<WaterUnit>("oz");
  const [waterOnlyCounts, setWaterOnlyCounts] = useState(false);

  // Add-flow beverage type
  const [addType, setAddType] = useState<BeverageType>("water");

  // Undo last log
  const [lastLogId, setLastLogId] = useState<string | null>(null);
  const [lastLogLabel, setLastLogLabel] = useState<string>("");
  const undoTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // CSV export
  const [exporting, setExporting] = useState(false);

  // Date navigation
  const todayString = getLocalDate();
  const [selectedDate, setSelectedDate] = useState<string>(todayString);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  useEffect(() => {
    fetchWaterLogs();
    fetchSettings();
    fetchTodayWorkoutFlag();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select(
          "target_water_oz, quick_add_oz, quick_add_names, quick_add_types, water_window_start, water_window_end, water_workout_bonus_oz, water_display_unit, water_only_counts"
        )
        .eq("id", user.id)
        .single();
      if (data?.target_water_oz) setGoalOz(data.target_water_oz);
      const oz = Array.isArray(data?.quick_add_oz) && data.quick_add_oz.length > 0
        ? data.quick_add_oz
        : DEFAULT_QUICK_ADD;
      setQuickAddAmounts(oz);
      const names = Array.isArray(data?.quick_add_names) ? data.quick_add_names : [];
      const types = Array.isArray(data?.quick_add_types) ? data.quick_add_types : [];
      // Normalize parallel arrays to match oz length
      setQuickAddNames(oz.map((_: number, i: number) => names[i] ?? ""));
      setQuickAddTypes(
        oz.map((_: number, i: number) =>
          BEVERAGE_TYPES.includes(types[i] as BeverageType)
            ? (types[i] as BeverageType)
            : "water"
        )
      );
      if (data?.water_window_start) setWindowStart(data.water_window_start);
      if (data?.water_window_end) setWindowEnd(data.water_window_end);
      if (typeof data?.water_workout_bonus_oz === "number") {
        setWorkoutBonusOz(data.water_workout_bonus_oz);
      }
      if (data?.water_display_unit === "L" || data?.water_display_unit === "oz") {
        setDisplayUnit(data.water_display_unit);
      }
      if (typeof data?.water_only_counts === "boolean") {
        setWaterOnlyCounts(data.water_only_counts);
      }
    } catch (error) {
      console.error("Error fetching water settings:", error);
    }
  };

  const fetchTodayWorkoutFlag = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data, error } = await supabase
        .from("workout_instances")
        .select("id")
        .eq("user_id", user.id)
        .eq("scheduled_date", todayString)
        .in("status", ["in_progress", "completed"])
        .limit(1);
      if (error) throw error;
      setHasWorkoutToday(!!data && data.length > 0);
    } catch (error) {
      console.error("Error fetching today's workout flag:", error);
    }
  };

  const fetchWaterLogs = async ({ silent = false }: { silent?: boolean } = {}) => {
    try {
      if (!silent) setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in to track water");
        return;
      }

      // Fetch logs from the last 365 days so historical week navigation works
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 365);
      const startDate = getLocalDate(cutoff);

      const { data, error } = await supabase
        .from("water_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (error: any) {
      console.error("Error fetching water logs:", error);
      Alert.alert("Error", "Failed to load water logs");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Derived: per-date totals (used for ring + day strip color).
  // Respects waterOnlyCounts: when on, non-water logs don't count.
  const totalsByDate = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const log of logs) {
      if (waterOnlyCounts && log.beverage_type !== "water") continue;
      totals[log.date] = (totals[log.date] || 0) + parseFloat(log.amount_oz.toString());
    }
    return totals;
  }, [logs, waterOnlyCounts]);

  const selectedDateLogs = useMemo(
    () => logs.filter((l) => l.date === selectedDate),
    [logs, selectedDate]
  );
  const selectedDateTotal = totalsByDate[selectedDate] || 0;

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, key: getLocalDate(d) };
    });
  }, [weekStart]);

  const isViewingToday = selectedDate === todayString;

  // Effective goal includes workout bonus on today only when there's a workout
  const effectiveGoalOz =
    isViewingToday && hasWorkoutToday ? goalOz + workoutBonusOz : goalOz;
  const bonusActive = isViewingToday && hasWorkoutToday && workoutBonusOz > 0;

  // Pace (today's view only, against effective goal)
  const pace: PaceState | null = useMemo(() => {
    if (!isViewingToday) return null;
    return computePace({
      currentOz: selectedDateTotal,
      goalOz: effectiveGoalOz,
      windowStart,
      windowEnd,
    });
  }, [isViewingToday, selectedDateTotal, effectiveGoalOz, windowStart, windowEnd]);

  // Insights (always relative to today, independent of selectedDate)
  const currentStreak = useMemo(
    () => computeCurrentStreak(totalsByDate, goalOz),
    [totalsByDate, goalOz]
  );
  const bestStreak = useMemo(
    () => computeBestStreak(totalsByDate, goalOz),
    [totalsByDate, goalOz]
  );
  const rolling = useMemo(
    () => computeRollingStats(totalsByDate, goalOz),
    [totalsByDate, goalOz]
  );
  const chartSeries = useMemo(
    () => buildDailySeries(totalsByDate, 14),
    [totalsByDate]
  );

  // Handlers
  const showUndoFor = (id: string, label: string) => {
    setLastLogId(id);
    setLastLogLabel(label);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => {
      setLastLogId(null);
    }, 5000);
  };

  const dismissUndo = () => {
    setLastLogId(null);
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  };

  const handleUndo = async () => {
    if (!lastLogId) return;
    const id = lastLogId;
    dismissUndo();
    try {
      const { error } = await supabase.from("water_logs").delete().eq("id", id);
      if (error) throw error;
      await fetchWaterLogs({ silent: true });
    } catch (error: any) {
      console.error("Undo failed:", error);
      Alert.alert("Error", "Failed to undo");
    }
  };

  const logWater = async (
    amount: number,
    type: BeverageType = "water"
  ): Promise<boolean> => {
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount");
      return false;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in to log water");
        return false;
      }
      const { data: inserted, error } = await supabase
        .from("water_logs")
        .insert([
          {
            user_id: user.id,
            date: selectedDate,
            amount_oz: amount,
            logged_at: new Date().toISOString(),
            beverage_type: type,
          },
        ])
        .select()
        .single();
      if (error) throw error;
      await fetchWaterLogs({ silent: true });
      if (inserted?.id) {
        const label = `Added ${formatAmount(amount, displayUnit)}${type !== "water" ? ` · ${beverageLabel(type)}` : ""}`;
        showUndoFor(inserted.id, label);
      }
      return true;
    } catch (error: any) {
      console.error("Error adding water log:", error);
      Alert.alert("Error", "Failed to add water log");
      return false;
    }
  };

  const handleAddFromInput = async () => {
    let amountOz: number;
    if (displayUnit === "L") {
      const parsed = parseFloat(addAmount);
      amountOz = isNaN(parsed) ? NaN : parsed * OZ_PER_LITER;
    } else {
      amountOz = parseFloat(addAmount);
    }
    const ok = await logWater(amountOz, addType);
    if (ok) {
      setAddAmount("");
      setAddType("water");
    }
  };

  const handleDeleteLog = async (logId: string) => {
    Alert.alert("Delete Log", "Are you sure you want to delete this water log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("water_logs").delete().eq("id", logId);
            if (error) throw error;
            await fetchWaterLogs({ silent: true });
          } catch (error: any) {
            console.error("Error deleting water log:", error);
            Alert.alert("Error", "Failed to delete water log");
          }
        },
      },
    ]);
  };

  // Date navigation
  const goToToday = () => {
    setSelectedDate(todayString);
    setWeekStart(startOfWeek(new Date()));
  };

  const navigateWeek = (delta: number) => {
    const newStart = addDays(weekStart, delta * 7);
    setWeekStart(newStart);
  };

  const handleSelectDate = (dateKey: string) => {
    setSelectedDate(dateKey);
  };

  const handleDatePickerChange = (event: any, picked?: Date) => {
    if (event.type === "dismissed" || !picked) {
      setDatePickerVisible(false);
      return;
    }
    const dateKey = getLocalDate(picked);
    setSelectedDate(dateKey);
    setWeekStart(startOfWeek(picked));
    if (Platform.OS !== "ios") setDatePickerVisible(false);
  };

  // Goal modal
  const openGoalEditor = () => {
    setGoalDraft(goalOz.toString());
    setGoalUnit("oz");
    setGoalModalVisible(true);
  };

  const handleGoalUnitChange = (next: WaterUnit) => {
    if (next === goalUnit) return;
    const parsed = parseFloat(goalDraft);
    if (!isNaN(parsed)) {
      if (next === "L") {
        setGoalDraft((parsed / OZ_PER_LITER).toFixed(2));
      } else {
        setGoalDraft(Math.round(parsed * OZ_PER_LITER).toString());
      }
    }
    setGoalUnit(next);
  };

  const handleSaveGoal = async () => {
    const parsed = parseFloat(goalDraft);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid Goal", "Please enter a positive number");
      return;
    }
    const newGoalOz = goalUnit === "oz" ? Math.round(parsed) : Math.round(parsed * OZ_PER_LITER);
    try {
      setSavingGoal(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({ target_water_oz: newGoalOz })
        .eq("id", user.id);
      if (error) throw error;
      setGoalOz(newGoalOz);
      setGoalModalVisible(false);
    } catch (error) {
      console.error("Error saving water goal:", error);
      Alert.alert("Error", "Failed to save goal");
    } finally {
      setSavingGoal(false);
    }
  };

  // Quick-add edit modal
  const openQuickAddEditor = () => {
    setQuickAddDrafts(quickAddAmounts.map((n) => n.toString()));
    setQuickAddNameDrafts([...quickAddNames]);
    setQuickAddTypeDrafts([...quickAddTypes]);
    setQuickAddEditVisible(true);
  };

  const updateQuickAddDraft = (i: number, value: string) => {
    setQuickAddDrafts((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  };

  const updateQuickAddNameDraft = (i: number, value: string) => {
    setQuickAddNameDrafts((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  };

  const updateQuickAddTypeDraft = (i: number, value: BeverageType) => {
    setQuickAddTypeDrafts((prev) => prev.map((v, idx) => (idx === i ? value : v)));
  };

  const handleSaveQuickAdd = async () => {
    const parsed = quickAddDrafts.map((d) => parseFloat(d));
    if (parsed.some((n) => isNaN(n) || n <= 0)) {
      Alert.alert("Invalid Amounts", "Each quick-add must be a positive number");
      return;
    }
    const rounded = parsed.map((n) => Math.round(n));
    const names = quickAddNameDrafts.map((n) => n.trim());
    const types = quickAddTypeDrafts.map((t) =>
      BEVERAGE_TYPES.includes(t) ? t : "water"
    );
    try {
      setSavingQuickAdd(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        Alert.alert("Error", "You must be logged in");
        return;
      }
      const { error } = await supabase
        .from("profiles")
        .update({
          quick_add_oz: rounded,
          quick_add_names: names,
          quick_add_types: types,
        })
        .eq("id", user.id);
      if (error) throw error;
      setQuickAddAmounts(rounded);
      setQuickAddNames(names);
      setQuickAddTypes(types);
      setQuickAddEditVisible(false);
    } catch (error) {
      console.error("Error saving quick-add amounts:", error);
      Alert.alert("Error", "Failed to save quick-add amounts");
    } finally {
      setSavingQuickAdd(false);
    }
  };

  // CSV export
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      if (logs.length === 0) {
        Alert.alert("No data", "Log some water before exporting.");
        return;
      }
      const header = "date,time,amount_oz,beverage_type\n";
      const rows = [...logs]
        .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
        .map((l) => {
          const dt = new Date(l.logged_at);
          const time = `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
          return `${l.date},${time},${l.amount_oz},${l.beverage_type}`;
        })
        .join("\n");
      const csv = header + rows + "\n";
      const filename = `water-logs-${getLocalDate()}.csv`;
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert("Sharing unavailable", `File saved at ${uri}`);
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "text/csv",
        dialogTitle: "Export Water Logs",
        UTI: "public.comma-separated-values-text",
      });
    } catch (error) {
      console.error("CSV export failed:", error);
      Alert.alert("Error", "Failed to export CSV");
    } finally {
      setExporting(false);
    }
  };

  // Display
  const formatSelectedDateLabel = (): string => {
    if (isViewingToday) return "Today";
    const d = parseLocalDate(selectedDate);
    const yesterday = addDays(new Date(), -1);
    if (selectedDate === getLocalDate(yesterday)) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  const formatWeekRangeLabel = (): string => {
    const end = addDays(weekStart, 6);
    const startStr = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return `${startStr} – ${endStr}`;
  };

  const dotColorFor = (dateKey: string): string => {
    const total = totalsByDate[dateKey] || 0;
    if (total === 0) return "transparent";
    if (total >= goalOz) return "#22C55E";
    if (total >= goalOz * 0.5) return "#3B82F6";
    return "rgba(59, 130, 246, 0.4)";
  };

  // History: group selectedDate logs (only this date's history shows up top, history below is unchanged)
  const groupedLogs: Record<string, WaterLog[]> = {};
  logs.forEach((log) => {
    if (!groupedLogs[log.date]) groupedLogs[log.date] = [];
    groupedLogs[log.date].push(log);
  });
  const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

  const formatHistoryDate = (dateStr: string) => {
    const date = parseLocalDate(dateStr);
    const yesterday = addDays(new Date(), -1);
    if (dateStr === todayString) return "Today";
    if (dateStr === getLocalDate(yesterday)) return "Yesterday";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Track</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleExportCsv}
            disabled={exporting}
            style={styles.headerActionButton}
            activeOpacity={0.7}
          >
            <Share2 size={20} color={exporting ? colors.mutedForeground : colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleContainer}>
            <Droplets size={32} color="#3B82F6" strokeWidth={2} />
            <Text style={styles.pageTitle}>Water Intake</Text>
          </View>

          {/* Ring card */}
          <View style={styles.ringCard}>
            <WaterProgressRing
              current={selectedDateTotal}
              goal={effectiveGoalOz}
              unit={displayUnit}
            />
            {pace && <PaceLine pace={pace} unit={displayUnit} />}
            <View style={styles.loggingToRow}>
              <Text style={styles.loggingToText}>
                Logging to: <Text style={styles.loggingToValue}>{formatSelectedDateLabel()}</Text>
              </Text>
              {!isViewingToday && (
                <TouchableOpacity onPress={goToToday} activeOpacity={0.7}>
                  <Text style={styles.todayLink}>Today</Text>
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              onPress={openGoalEditor}
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

          {/* Day strip */}
          <View style={styles.stripCard}>
            <View style={styles.stripHeader}>
              <TouchableOpacity
                onPress={() => navigateWeek(-1)}
                style={styles.stripNavButton}
                activeOpacity={0.7}
              >
                <ChevronLeft size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={styles.stripHeaderText}>{formatWeekRangeLabel()}</Text>
              <TouchableOpacity
                onPress={() => navigateWeek(1)}
                style={styles.stripNavButton}
                activeOpacity={0.7}
              >
                <ChevronRight size={20} color={colors.foreground} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDatePickerVisible(true)}
                style={styles.stripNavButton}
                activeOpacity={0.7}
              >
                <CalendarIcon size={18} color={colors.foreground} />
              </TouchableOpacity>
            </View>
            <View style={styles.stripRow}>
              {weekDates.map(({ date, key }, i) => {
                const isSelected = key === selectedDate;
                const isToday = key === todayString;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => handleSelectDate(key)}
                    style={[
                      styles.dayCell,
                      isSelected && styles.dayCellSelected,
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dayInitial}>{DAY_INITIALS[i]}</Text>
                    <Text
                      style={[
                        styles.dayNumber,
                        isToday && styles.dayNumberToday,
                        isSelected && styles.dayNumberSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    <View
                      style={[styles.dayDot, { backgroundColor: dotColorFor(key) }]}
                    />
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Insights */}
          <View style={styles.insightsCard}>
            <Text style={styles.insightsTitle}>Insights · Last 7 days</Text>
            <View style={styles.statsRow}>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{currentStreak}</Text>
                <Text style={styles.statLabel}>Streak</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>{bestStreak}</Text>
                <Text style={styles.statLabel}>Best</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>
                  {displayUnit === "oz"
                    ? Math.round(rolling.avgOzPerDay)
                    : ozToLiters(rolling.avgOzPerDay).toFixed(2)}
                </Text>
                <Text style={styles.statLabel}>Avg {displayUnit}/day</Text>
              </View>
              <View style={styles.statCell}>
                <Text style={styles.statValue}>
                  {rolling.daysHit}
                  <Text style={styles.statValueSub}>/{rolling.daysInWindow}</Text>
                </Text>
                <Text style={styles.statLabel}>Goal hit</Text>
              </View>
            </View>
            <Text style={styles.chartLabel}>Last 14 days</Text>
            <WaterBarChart series={chartSeries} goalOz={goalOz} />
          </View>

          {/* Add Water Section */}
          <View style={styles.addSection}>
            <Text style={styles.sectionTitle}>Log Drink</Text>
            <View style={styles.beverageChipsRow}>
              {BEVERAGE_TYPES.map((t) => {
                const active = addType === t;
                return (
                  <TouchableOpacity
                    key={t}
                    onPress={() => setAddType(t)}
                    style={[
                      styles.beverageChip,
                      active && {
                        backgroundColor: beverageColor(t),
                        borderColor: beverageColor(t),
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.beverageChipText,
                        active && styles.beverageChipTextActive,
                      ]}
                    >
                      {beverageLabel(t)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.addForm}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder={`Amount (${displayUnit})`}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={addAmount}
                  onChangeText={setAddAmount}
                />
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddFromInput}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Add Buttons */}
            <View style={styles.quickAddContainer}>
              <View style={styles.quickAddHeader}>
                <Text style={styles.quickAddLabel}>Quick Add:</Text>
                <TouchableOpacity
                  onPress={openQuickAddEditor}
                  style={styles.quickAddGear}
                  activeOpacity={0.7}
                >
                  <Sliders size={16} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
              <View style={styles.quickAddButtons}>
                {quickAddAmounts.map((amount, i) => {
                  const name = quickAddNames[i];
                  const type = quickAddTypes[i] || "water";
                  const primaryText = name ? name : formatAmount(amount, displayUnit);
                  const subText = name ? formatAmount(amount, displayUnit) : null;
                  return (
                    <TouchableOpacity
                      key={`${amount}-${i}`}
                      style={[
                        styles.quickAddButton,
                        type !== "water" && {
                          borderColor: beverageColor(type),
                          borderLeftWidth: 3,
                        },
                      ]}
                      onPress={() => logWater(amount, type)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={styles.quickAddButtonText}
                        numberOfLines={1}
                      >
                        {primaryText}
                      </Text>
                      {subText && (
                        <Text style={styles.quickAddButtonSubText} numberOfLines={1}>
                          {subText}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>

          {/* History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>History</Text>
            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : sortedDates.length === 0 ? (
              <Text style={styles.emptyText}>No water logs yet. Start tracking today!</Text>
            ) : (
              sortedDates.map((date) => {
                const dayLogs = groupedLogs[date];
                const dayTotal = dayLogs.reduce(
                  (sum, log) => sum + parseFloat(log.amount_oz.toString()),
                  0
                );
                const dayTotalDisplay = formatVolume(dayTotal, displayUnit);
                return (
                  <View key={date} style={styles.dayGroup}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayDate}>{formatHistoryDate(date)}</Text>
                      <Text style={styles.dayTotal}>{dayTotalDisplay}</Text>
                    </View>
                    {dayLogs.map((log) => {
                      const type = (log.beverage_type || "water") as BeverageType;
                      return (
                        <View key={log.id} style={styles.logCard}>
                          <View style={styles.logInfo}>
                            <Droplets size={16} color={beverageColor(type)} />
                            <Text style={styles.logAmount}>
                              {formatAmount(Number(log.amount_oz), displayUnit)}
                            </Text>
                            {type !== "water" && (
                              <View
                                style={[
                                  styles.beverageBadge,
                                  { backgroundColor: beverageColor(type) },
                                ]}
                              >
                                <Text style={styles.beverageBadgeText}>
                                  {beverageLabel(type)}
                                </Text>
                              </View>
                            )}
                            <Text style={styles.logTime}>{formatTime(log.logged_at)}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleDeleteLog(log.id)}
                            style={styles.deleteButton}
                            activeOpacity={0.7}
                          >
                            <Trash2 size={18} color={colors.mutedForeground} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Undo snackbar */}
        {lastLogId !== null && (
          <View style={styles.snackbar}>
            <Text style={styles.snackbarText} numberOfLines={1}>
              {lastLogLabel}
            </Text>
            <TouchableOpacity
              onPress={handleUndo}
              style={styles.snackbarUndoButton}
              activeOpacity={0.7}
            >
              <Undo2 size={16} color="#FFFFFF" />
              <Text style={styles.snackbarUndoText}>Undo</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Goal Editor Modal */}
        <Modal
          visible={goalModalVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setGoalModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Daily Water Goal</Text>
              <View style={styles.modalUnitToggle}>
                {(["oz", "L"] as WaterUnit[]).map((unit) => (
                  <TouchableOpacity
                    key={unit}
                    style={[
                      styles.modalUnitButton,
                      goalUnit === unit && styles.modalUnitButtonActive,
                    ]}
                    onPress={() => handleGoalUnitChange(unit)}
                    disabled={savingGoal}
                  >
                    <Text
                      style={[
                        styles.modalUnitButtonText,
                        goalUnit === unit && styles.modalUnitButtonTextActive,
                      ]}
                    >
                      {unit}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.modalInput}
                value={goalDraft}
                onChangeText={setGoalDraft}
                keyboardType="decimal-pad"
                placeholder={goalUnit === "oz" ? "64" : "2"}
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                editable={!savingGoal}
              />
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setGoalModalVisible(false)}
                  disabled={savingGoal}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleSaveGoal}
                  disabled={savingGoal}
                >
                  <Text style={styles.modalButtonPrimaryText}>
                    {savingGoal ? "Saving…" : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Quick-add Edit Modal */}
        <Modal
          visible={quickAddEditVisible}
          animationType="fade"
          transparent
          onRequestClose={() => setQuickAddEditVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Customize Quick-Add</Text>
              <Text style={styles.modalSubtitle}>
                Optional name, amount in ounces, and beverage type per button.
              </Text>
              <ScrollView style={{ maxHeight: 420 }}>
                {quickAddDrafts.map((draft, i) => (
                  <View key={i} style={styles.quickAddEditBlock}>
                    <Text style={styles.quickAddDraftLabel}>Button {i + 1}</Text>
                    <TextInput
                      style={styles.quickAddDraftInput}
                      value={quickAddNameDrafts[i] ?? ""}
                      onChangeText={(t) => updateQuickAddNameDraft(i, t)}
                      placeholder="Name (optional)"
                      placeholderTextColor={colors.mutedForeground}
                      editable={!savingQuickAdd}
                    />
                    <TextInput
                      style={styles.quickAddDraftInput}
                      value={draft}
                      onChangeText={(t) => updateQuickAddDraft(i, t)}
                      placeholder="Amount (oz)"
                      keyboardType="decimal-pad"
                      placeholderTextColor={colors.mutedForeground}
                      editable={!savingQuickAdd}
                    />
                    <View style={styles.beverageChipsRowSmall}>
                      {BEVERAGE_TYPES.map((t) => {
                        const active = quickAddTypeDrafts[i] === t;
                        return (
                          <TouchableOpacity
                            key={t}
                            onPress={() => updateQuickAddTypeDraft(i, t)}
                            disabled={savingQuickAdd}
                            style={[
                              styles.beverageChipSmall,
                              active && {
                                backgroundColor: beverageColor(t),
                                borderColor: beverageColor(t),
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.beverageChipTextSmall,
                                active && styles.beverageChipTextActive,
                              ]}
                            >
                              {beverageLabel(t)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </ScrollView>
              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonSecondary]}
                  onPress={() => setQuickAddEditVisible(false)}
                  disabled={savingQuickAdd}
                >
                  <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonPrimary]}
                  onPress={handleSaveQuickAdd}
                  disabled={savingQuickAdd}
                >
                  <Text style={styles.modalButtonPrimaryText}>
                    {savingQuickAdd ? "Saving…" : "Save"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Calendar date picker */}
        {Platform.OS === "ios" ? (
          <Modal
            visible={datePickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setDatePickerVisible(false)}
          >
            <View style={styles.modalBackdrop}>
              <View style={styles.datePickerCard}>
                <DateTimePicker
                  value={parseLocalDate(selectedDate)}
                  mode="date"
                  display="spinner"
                  maximumDate={new Date()}
                  onChange={handleDatePickerChange}
                  textColor="#FFFFFF"
                />
                <TouchableOpacity
                  style={styles.datePickerDoneButton}
                  onPress={() => setDatePickerVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.datePickerDoneButtonText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        ) : (
          datePickerVisible && (
            <DateTimePicker
              value={parseLocalDate(selectedDate)}
              mode="date"
              display="default"
              maximumDate={new Date()}
              onChange={handleDatePickerChange}
            />
          )
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerActionButton: {
    padding: 6,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: colors.foreground,
  },
  content: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },

  // Ring card
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

  // Day strip
  stripCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stripHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 10,
  },
  stripHeaderText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
  },
  stripNavButton: {
    padding: 6,
  },
  stripRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  dayCell: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 1,
  },
  dayCellSelected: {
    backgroundColor: "rgba(59, 130, 246, 0.18)",
  },
  dayInitial: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  dayNumber: {
    fontSize: 15,
    color: colors.foreground,
    fontWeight: "500",
  },
  dayNumberToday: {
    color: "#3B82F6",
    fontWeight: "700",
  },
  dayNumberSelected: {
    fontWeight: "700",
  },
  dayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },

  // Insights card
  insightsCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightsTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.mutedForeground,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  statCell: {
    flex: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
  },
  statValueSub: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.mutedForeground,
  },
  statLabel: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
    textAlign: "center",
  },
  chartLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 6,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: -8,
    marginBottom: 12,
  },
  modalUnitToggle: {
    flexDirection: "row",
    backgroundColor: "#1F2937",
    borderRadius: 8,
    padding: 3,
    gap: 3,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  modalUnitButton: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
  },
  modalUnitButtonActive: {
    backgroundColor: "#3B82F6",
  },
  modalUnitButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  modalUnitButtonTextActive: {
    color: "#FFFFFF",
  },
  modalInput: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    color: "#FFFFFF",
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonPrimary: {
    backgroundColor: "#3B82F6",
  },
  modalButtonSecondary: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalButtonPrimaryText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  modalButtonSecondaryText: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: "600",
  },

  // Date picker
  datePickerCard: {
    width: "100%",
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  datePickerDoneButton: {
    backgroundColor: "#3B82F6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  datePickerDoneButtonText: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "700",
  },

  // Quick-add edit modal
  quickAddDraftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 10,
  },
  quickAddDraftLabel: {
    width: 80,
    fontSize: 14,
    color: colors.mutedForeground,
  },
  quickAddDraftInput: {
    flex: 1,
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#FFFFFF",
  },

  // Add section
  addSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
  },
  addForm: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  inputContainer: {
    flex: 1,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  addButton: {
    backgroundColor: "#3B82F6",
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    justifyContent: "center",
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  quickAddContainer: {
    marginTop: 8,
  },
  quickAddHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  quickAddLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  quickAddGear: {
    padding: 4,
  },
  quickAddButtons: {
    flexDirection: "row",
    gap: 8,
  },
  quickAddButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  quickAddButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  quickAddButtonSubText: {
    fontSize: 11,
    color: colors.mutedForeground,
    marginTop: 2,
  },
  beverageChipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 12,
  },
  beverageChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  beverageChipText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.foreground,
  },
  beverageChipTextActive: {
    color: "#FFFFFF",
  },
  beverageChipsRowSmall: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 4,
  },
  beverageChipSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#374151",
    backgroundColor: "#1F2937",
  },
  beverageChipTextSmall: {
    fontSize: 11,
    fontWeight: "600",
    color: "#D1D5DB",
  },
  beverageBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 4,
  },
  beverageBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  quickAddEditBlock: {
    marginBottom: 16,
    gap: 6,
  },
  snackbar: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: "#1F2937",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "#374151",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  snackbarText: {
    color: "#FFFFFF",
    fontSize: 14,
    flex: 1,
  },
  snackbarUndoButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  snackbarUndoText: {
    color: "#3B82F6",
    fontSize: 14,
    fontWeight: "700",
  },

  // History
  historySection: {
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  dayGroup: {
    marginBottom: 20,
  },
  dayHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  dayTotal: {
    fontSize: 16,
    fontWeight: "600",
    color: "#3B82F6",
  },
  logCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  logAmount: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  logTime: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginLeft: "auto",
  },
  deleteButton: {
    padding: 4,
  },
});
