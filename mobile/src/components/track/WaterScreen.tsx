import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Droplets, Share2 } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WaterLog } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
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
  BEVERAGE_TYPES,
  BeverageType,
  formatAmount,
  beverageLabel,
} from "@/src/lib/waterUnits";
import { WaterRingCard } from "./WaterRingCard";
import { WaterQuickAddCard } from "./WaterQuickAddCard";
import { WaterDayStrip } from "./WaterDayStrip";
import { WaterInsightsCard } from "./WaterInsightsCard";
import { WaterCustomLogForm } from "./WaterCustomLogForm";
import { WaterHistoryList } from "./WaterHistoryList";
import { WaterUndoSnackbar } from "./WaterUndoSnackbar";
import { WaterGoalEditorModal } from "./WaterGoalEditorModal";
import { WaterQuickAddEditorModal } from "./WaterQuickAddEditorModal";
import { WaterCalendarModal } from "./WaterCalendarModal";
import { WaterLogEditorModal } from "./WaterLogEditorModal";

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
  result.setDate(result.getDate() - result.getDay());
  return result;
}

function addDays(d: Date, days: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + days);
  return result;
}

interface WaterScreenProps {
  onClose: () => void;
}

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
  const [workoutDates, setWorkoutDates] = useState<Set<string>>(new Set());

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

  // Edit-log modal
  const [editingLog, setEditingLog] = useState<WaterLog | null>(null);
  const [editAmountDraft, setEditAmountDraft] = useState("");
  const [editTypeDraft, setEditTypeDraft] = useState<BeverageType>("water");
  const [savingEdit, setSavingEdit] = useState(false);

  // Date navigation
  const todayString = getLocalDate();
  const [selectedDate, setSelectedDate] = useState<string>(todayString);
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [datePickerVisible, setDatePickerVisible] = useState(false);

  useEffect(() => {
    fetchWaterLogs();
    fetchSettings();
    fetchWorkoutDates();
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

  const fetchWorkoutDates = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 365);
      const cutoffStr = getLocalDate(cutoff);
      const { data, error } = await supabase
        .from("workout_instances")
        .select("scheduled_date")
        .eq("user_id", user.id)
        .gte("scheduled_date", cutoffStr)
        .in("status", ["in_progress", "completed"]);
      if (error) throw error;
      const dates = new Set<string>(
        (data ?? []).map((r: { scheduled_date: string }) => r.scheduled_date)
      );
      setWorkoutDates(dates);
      setHasWorkoutToday(dates.has(todayString));
    } catch (error) {
      console.error("Error fetching workout dates:", error);
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

  // Derived: per-date totals (respects water_only_counts).
  const totalsByDate = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const log of logs) {
      if (waterOnlyCounts && log.beverage_type !== "water") continue;
      totals[log.date] = (totals[log.date] || 0) + parseFloat(log.amount_oz.toString());
    }
    return totals;
  }, [logs, waterOnlyCounts]);

  const selectedDateTotal = totalsByDate[selectedDate] || 0;

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = addDays(weekStart, i);
      return { date: d, key: getLocalDate(d) };
    });
  }, [weekStart]);

  const isViewingToday = selectedDate === todayString;

  const effectiveGoalOz =
    isViewingToday && hasWorkoutToday ? goalOz + workoutBonusOz : goalOz;
  const bonusActive = isViewingToday && hasWorkoutToday && workoutBonusOz > 0;

  const pace: PaceState | null = useMemo(() => {
    if (!isViewingToday) return null;
    return computePace({
      currentOz: selectedDateTotal,
      goalOz: effectiveGoalOz,
      windowStart,
      windowEnd,
    });
  }, [isViewingToday, selectedDateTotal, effectiveGoalOz, windowStart, windowEnd]);

  // Per-day effective goal lookup used by insights/streak/chart.
  const goalForDate = useMemo(
    () => (dateKey: string) =>
      goalOz + (workoutDates.has(dateKey) ? workoutBonusOz : 0),
    [goalOz, workoutBonusOz, workoutDates]
  );

  const currentStreak = useMemo(
    () => computeCurrentStreak(totalsByDate, goalForDate),
    [totalsByDate, goalForDate]
  );
  const bestStreak = useMemo(
    () => computeBestStreak(totalsByDate, goalForDate),
    [totalsByDate, goalForDate]
  );
  const rolling = useMemo(
    () => computeRollingStats(totalsByDate, goalForDate),
    [totalsByDate, goalForDate]
  );
  const chartSeries = useMemo(
    () => buildDailySeries(totalsByDate, 14, goalForDate),
    [totalsByDate, goalForDate]
  );

  // Undo
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
      setLogs((prev) => prev.filter((l) => l.id !== id));
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
        .insert([{
          user_id: user.id,
          date: selectedDate,
          amount_oz: amount,
          logged_at: new Date().toISOString(),
          beverage_type: type,
        }])
        .select()
        .single();
      if (error) throw error;
      // Insert locally and keep the (date desc, logged_at desc) order instead
      // of re-downloading a year of rows on every logged drink.
      if (inserted) {
        setLogs((prev) =>
          [inserted as WaterLog, ...prev].sort((a, b) =>
            a.date !== b.date
              ? a.date < b.date ? 1 : -1
              : a.logged_at < b.logged_at ? 1 : -1
          )
        );
      }
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

  // Edit a log
  const openLogEditor = (log: WaterLog) => {
    // Display amount in the user's preferred unit; convert back to oz on save.
    const ozValue = Number(log.amount_oz);
    if (displayUnit === "L") {
      setEditAmountDraft((ozValue / OZ_PER_LITER).toFixed(2));
    } else {
      setEditAmountDraft(ozValue.toString());
    }
    setEditTypeDraft((log.beverage_type || "water") as BeverageType);
    setEditingLog(log);
  };

  const handleSaveEdit = async () => {
    if (!editingLog) return;
    const parsed = parseFloat(editAmountDraft);
    if (isNaN(parsed) || parsed <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid positive amount");
      return;
    }
    const newOz =
      displayUnit === "L" ? parsed * OZ_PER_LITER : parsed;
    try {
      setSavingEdit(true);
      const { error } = await supabase
        .from("water_logs")
        .update({
          amount_oz: newOz,
          beverage_type: editTypeDraft,
        })
        .eq("id", editingLog.id);
      if (error) throw error;
      setLogs((prev) =>
        prev.map((l) =>
          l.id === editingLog.id
            ? { ...l, amount_oz: newOz, beverage_type: editTypeDraft }
            : l
        )
      );
      setEditingLog(null);
    } catch (error) {
      console.error("Error editing log:", error);
      Alert.alert("Error", "Failed to save changes");
    } finally {
      setSavingEdit(false);
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
            setLogs((prev) => prev.filter((l) => l.id !== logId));
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
    setWeekStart(addDays(weekStart, delta * 7));
  };
  const handleSelectDate = (dateKey: string) => setSelectedDate(dateKey);

  const handleDatePickerChange = (event: any, picked?: Date) => {
    if (event.type === "dismissed" || !picked) {
      setDatePickerVisible(false);
      return;
    }
    const dateKey = getLocalDate(picked);
    setSelectedDate(dateKey);
    setWeekStart(startOfWeek(picked));
  };

  // Goal modal
  const openGoalEditor = () => {
    setGoalDraft(goalOz.toString());
    setGoalUnit("oz");
    setGoalModalVisible(true);
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

  // CSV export — uses React Native's built-in Share so it works in the
  // existing dev client. Recipient apps receive the CSV as text (paste
  // into Files / Mail / Notes / etc).
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
      await Share.share({
        message: csv,
        title: `Water Logs ${getLocalDate()}`,
      });
    } catch (error) {
      console.error("CSV export failed:", error);
      Alert.alert("Error", "Failed to export CSV");
    } finally {
      setExporting(false);
    }
  };

  // Display helpers
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

  // History
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
          <View style={styles.titleContainer}>
            <Droplets size={32} color="#3B82F6" strokeWidth={2} />
            <Text style={styles.pageTitle}>Water Intake</Text>
          </View>

          <WaterRingCard
            currentOz={selectedDateTotal}
            effectiveGoalOz={effectiveGoalOz}
            displayUnit={displayUnit}
            pace={pace}
            bonusActive={bonusActive}
            workoutBonusOz={workoutBonusOz}
            isViewingToday={isViewingToday}
            selectedDateLabel={formatSelectedDateLabel()}
            onGoToToday={goToToday}
            onOpenGoalEditor={openGoalEditor}
          />

          <WaterQuickAddCard
            amounts={quickAddAmounts}
            names={quickAddNames}
            types={quickAddTypes}
            displayUnit={displayUnit}
            onLog={logWater}
            onOpenEditor={openQuickAddEditor}
          />

          <WaterDayStrip
            weekDates={weekDates}
            weekRangeLabel={formatWeekRangeLabel()}
            selectedDate={selectedDate}
            todayString={todayString}
            onNavigateWeek={navigateWeek}
            onSelectDate={handleSelectDate}
            onOpenDatePicker={() => setDatePickerVisible(true)}
            dotColorFor={dotColorFor}
          />

          <WaterInsightsCard
            currentStreak={currentStreak}
            bestStreak={bestStreak}
            avgOzPerDay={rolling.avgOzPerDay}
            daysHit={rolling.daysHit}
            daysInWindow={rolling.daysInWindow}
            chartSeries={chartSeries}
            referenceGoalOz={goalOz}
            displayUnit={displayUnit}
          />

          <WaterCustomLogForm
            addType={addType}
            addAmount={addAmount}
            displayUnit={displayUnit}
            onChangeType={setAddType}
            onChangeAmount={setAddAmount}
            onSubmit={handleAddFromInput}
          />

          <WaterHistoryList
            loading={loading}
            sortedDates={sortedDates}
            groupedLogs={groupedLogs}
            displayUnit={displayUnit}
            formatHistoryDate={formatHistoryDate}
            formatTime={formatTime}
            onDelete={handleDeleteLog}
            onEdit={openLogEditor}
          />

          <View style={{ height: 40 }} />
        </ScrollView>

        <WaterUndoSnackbar
          visible={lastLogId !== null}
          label={lastLogLabel}
          onUndo={handleUndo}
        />

        <WaterGoalEditorModal
          visible={goalModalVisible}
          draft={goalDraft}
          unit={goalUnit}
          saving={savingGoal}
          onChangeDraft={setGoalDraft}
          onChangeUnit={setGoalUnit}
          onClose={() => setGoalModalVisible(false)}
          onSave={handleSaveGoal}
        />

        <WaterQuickAddEditorModal
          visible={quickAddEditVisible}
          amountDrafts={quickAddDrafts}
          nameDrafts={quickAddNameDrafts}
          typeDrafts={quickAddTypeDrafts}
          saving={savingQuickAdd}
          onChangeAmount={(i, v) =>
            setQuickAddDrafts((prev) => prev.map((d, idx) => (idx === i ? v : d)))
          }
          onChangeName={(i, v) =>
            setQuickAddNameDrafts((prev) => prev.map((d, idx) => (idx === i ? v : d)))
          }
          onChangeType={(i, t) =>
            setQuickAddTypeDrafts((prev) => prev.map((d, idx) => (idx === i ? t : d)))
          }
          onClose={() => setQuickAddEditVisible(false)}
          onSave={handleSaveQuickAdd}
        />

        <WaterCalendarModal
          visible={datePickerVisible}
          initialDate={parseLocalDate(selectedDate)}
          onChange={handleDatePickerChange}
          onClose={() => setDatePickerVisible(false)}
        />

        <WaterLogEditorModal
          visible={editingLog !== null}
          draftAmount={editAmountDraft}
          draftType={editTypeDraft}
          displayUnit={displayUnit}
          saving={savingEdit}
          onChangeAmount={setEditAmountDraft}
          onChangeType={setEditTypeDraft}
          onClose={() => setEditingLog(null)}
          onSave={handleSaveEdit}
        />
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
});
