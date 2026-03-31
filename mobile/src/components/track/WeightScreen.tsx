import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  Dimensions,
  Switch,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronLeft,
  Plus,
  Scale,
  Trash2,
  TrendingDown,
  TrendingUp,
  Bell,
  Calendar,
  Target,
} from "lucide-react-native";
import { LineChart } from "react-native-chart-kit";
import * as Notifications from "expo-notifications";
import { colors } from "@/src/lib/colors";
import { WeightLog, TimeOfDay } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

interface WeightScreenProps {
  onClose: () => void;
}

interface WeeklyStats {
  weekStart: string;
  weekEnd: string;
  average: number;
  min: number;
  max: number;
  count: number;
}

const SCREEN_WIDTH = Dimensions.get("window").width;

export function WeightScreen({ onClose }: WeightScreenProps) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [addWeight, setAddWeight] = useState("");
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay>("morning");
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [weightChange, setWeightChange] = useState<number | null>(null);
  const [weeklyAverage, setWeeklyAverage] = useState<number | null>(null);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyStats[]>([]);
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchWeightLogs();
    checkReminderStatus();
  }, []);

  const fetchWeightLogs = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to track weight");
        return;
      }

      // Fetch logs from last 90 days
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
      const startDate = ninetyDaysAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("weight_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false });

      if (error) throw error;

      setLogs(data || []);
      calculateStats(data || []);
    } catch (error: any) {
      console.error("Error fetching weight logs:", error);
      Alert.alert("Error", "Failed to load weight logs");
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (data: WeightLog[]) => {
    if (!data || data.length === 0) {
      setLatestWeight(null);
      setWeightChange(null);
      setWeeklyAverage(null);
      setWeeklyStats([]);
      return;
    }

    // Latest weight and change
    const latest = parseFloat(data[0].weight_lbs.toString());
    setLatestWeight(latest);

    if (data.length > 1) {
      const previous = parseFloat(data[1].weight_lbs.toString());
      setWeightChange(latest - previous);
    } else {
      setWeightChange(null);
    }

    // Calculate weekly averages
    const now = new Date();
    const weeks: WeeklyStats[] = [];

    for (let i = 0; i < 4; i++) {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - i * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);

      const weekStartStr = weekStart.toISOString().split("T")[0];
      const weekEndStr = weekEnd.toISOString().split("T")[0];

      const weekLogs = data.filter(
        (log) => log.date >= weekStartStr && log.date <= weekEndStr
      );

      if (weekLogs.length > 0) {
        const weights = weekLogs.map((l) => parseFloat(l.weight_lbs.toString()));
        const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
        weeks.push({
          weekStart: weekStartStr,
          weekEnd: weekEndStr,
          average: avg,
          min: Math.min(...weights),
          max: Math.max(...weights),
          count: weekLogs.length,
        });
      }
    }

    setWeeklyStats(weeks);

    // Current week's average
    if (weeks.length > 0) {
      setWeeklyAverage(weeks[0].average);
    }
  };

  const checkReminderStatus = async () => {
    const { status } = await Notifications.getPermissionsAsync();
    if (status === "granted") {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      const hasWeightReminder = scheduled.some(
        (n) => n.content.data?.type === "weight_reminder"
      );
      setReminderEnabled(hasWeightReminder);
    }
  };

  const toggleReminder = async (enabled: boolean) => {
    try {
      if (enabled) {
        const { status } = await Notifications.requestPermissionsAsync();
        if (status !== "granted") {
          Alert.alert(
            "Permissions Required",
            "Please enable notifications to set a morning reminder."
          );
          return;
        }

        // Cancel any existing weight reminders
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const n of scheduled) {
          if (n.content.data?.type === "weight_reminder") {
            await Notifications.cancelScheduledNotificationAsync(n.identifier);
          }
        }

        // Schedule daily reminder at 7:30 AM
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "⚖️ Time to Weigh In!",
            body: "Log your morning weight for accurate tracking.",
            data: { type: "weight_reminder" },
          },
          trigger: {
            hour: 7,
            minute: 30,
            repeats: true,
          },
        });

        setReminderEnabled(true);
        Alert.alert("Reminder Set", "You'll be reminded daily at 7:30 AM to log your weight.");
      } else {
        // Cancel weight reminders
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const n of scheduled) {
          if (n.content.data?.type === "weight_reminder") {
            await Notifications.cancelScheduledNotificationAsync(n.identifier);
          }
        }
        setReminderEnabled(false);
      }
    } catch (error) {
      console.error("Error toggling reminder:", error);
      Alert.alert("Error", "Failed to set reminder");
    }
  };

  const handleAddWeight = async () => {
    const weight = parseFloat(addWeight);

    if (isNaN(weight) || weight <= 0) {
      Alert.alert("Invalid Weight", "Please enter a valid weight in pounds");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log weight");
        return;
      }

      const { error } = await supabase.from("weight_logs").insert([
        {
          user_id: user.id,
          date: today,
          weight_lbs: weight,
          time_of_day: selectedTimeOfDay,
          logged_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      setAddWeight("");
      await fetchWeightLogs();
      Alert.alert("Success", `Weight logged: ${weight} lbs`);
    } catch (error: any) {
      console.error("Error adding weight log:", error);
      Alert.alert("Error", "Failed to add weight log");
    }
  };

  const handleDeleteLog = async (logId: string) => {
    Alert.alert("Delete Log", "Are you sure you want to delete this weight log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("weight_logs").delete().eq("id", logId);

            if (error) throw error;

            await fetchWeightLogs();
          } catch (error: any) {
            console.error("Error deleting weight log:", error);
            Alert.alert("Error", "Failed to delete weight log");
          }
        },
      },
    ]);
  };

  // Prepare chart data (last 30 days, one point per day using daily average)
  const getChartData = useCallback(() => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Group logs by date and take average
    const dailyAverages: { date: string; avg: number }[] = [];
    const byDate: Record<string, number[]> = {};

    logs.forEach((log) => {
      if (new Date(log.date) >= thirtyDaysAgo) {
        if (!byDate[log.date]) byDate[log.date] = [];
        byDate[log.date].push(parseFloat(log.weight_lbs.toString()));
      }
    });

    Object.keys(byDate)
      .sort()
      .forEach((date) => {
        const weights = byDate[date];
        const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
        dailyAverages.push({ date, avg });
      });

    if (dailyAverages.length === 0) {
      return null;
    }

    // Take last 14 points max for readability
    const dataPoints = dailyAverages.slice(-14);

    return {
      labels: dataPoints.map((d) => {
        const date = new Date(d.date);
        return `${date.getMonth() + 1}/${date.getDate()}`;
      }),
      datasets: [
        {
          data: dataPoints.map((d) => d.avg),
          strokeWidth: 2,
        },
      ],
    };
  }, [logs]);

  const chartData = getChartData();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateStr === today.toISOString().split("T")[0]) {
      return "Today";
    } else if (dateStr === yesterday.toISOString().split("T")[0]) {
      return "Yesterday";
    } else {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    }
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  };

  const formatTimeOfDay = (timeOfDay: string | null) => {
    if (!timeOfDay) return "";
    return timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1);
  };

  const formatWeekRange = (start: string, end: string) => {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.getMonth() + 1}/${s.getDate()} - ${e.getMonth() + 1}/${e.getDate()}`;
  };

  // Group logs by date for history
  const groupedLogs: Record<string, WeightLog[]> = {};
  logs.forEach((log) => {
    if (!groupedLogs[log.date]) {
      groupedLogs[log.date] = [];
    }
    groupedLogs[log.date].push(log);
  });

  const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

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
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleContainer}>
            <Scale size={32} color="#22C55E" strokeWidth={2} />
            <Text style={styles.pageTitle}>Weight</Text>
          </View>

          {/* Stats Cards Row */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Current</Text>
              <Text style={styles.statValue}>
                {latestWeight !== null ? `${latestWeight.toFixed(1)}` : "--"}
              </Text>
              <Text style={styles.statUnit}>lbs</Text>
              {weightChange !== null && (
                <View style={styles.changeContainer}>
                  {weightChange > 0 ? (
                    <TrendingUp size={12} color="#EF4444" />
                  ) : weightChange < 0 ? (
                    <TrendingDown size={12} color="#22C55E" />
                  ) : null}
                  <Text
                    style={[
                      styles.changeText,
                      {
                        color:
                          weightChange > 0
                            ? "#EF4444"
                            : weightChange < 0
                            ? "#22C55E"
                            : colors.mutedForeground,
                      },
                    ]}
                  >
                    {weightChange > 0 ? "+" : ""}
                    {weightChange.toFixed(1)}
                  </Text>
                </View>
              )}
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Weekly Avg</Text>
              <Text style={styles.statValue}>
                {weeklyAverage !== null ? `${weeklyAverage.toFixed(1)}` : "--"}
              </Text>
              <Text style={styles.statUnit}>lbs</Text>
              {weeklyStats.length >= 2 && (
                <View style={styles.changeContainer}>
                  {(() => {
                    const diff = weeklyStats[0].average - weeklyStats[1].average;
                    return (
                      <>
                        {diff > 0 ? (
                          <TrendingUp size={12} color="#EF4444" />
                        ) : diff < 0 ? (
                          <TrendingDown size={12} color="#22C55E" />
                        ) : null}
                        <Text
                          style={[
                            styles.changeText,
                            {
                              color:
                                diff > 0
                                  ? "#EF4444"
                                  : diff < 0
                                  ? "#22C55E"
                                  : colors.mutedForeground,
                            },
                          ]}
                        >
                          {diff > 0 ? "+" : ""}
                          {diff.toFixed(1)}
                        </Text>
                      </>
                    );
                  })()}
                </View>
              )}
            </View>

            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Entries</Text>
              <Text style={styles.statValue}>{logs.length}</Text>
              <Text style={styles.statUnit}>total</Text>
            </View>
          </View>

          {/* Weight Chart */}
          {chartData && chartData.datasets[0].data.length >= 2 && (
            <View style={styles.chartSection}>
              <Text style={styles.sectionTitle}>Trend (Last 2 Weeks)</Text>
              <View style={styles.chartContainer}>
                <LineChart
                  data={chartData}
                  width={SCREEN_WIDTH - 40}
                  height={180}
                  chartConfig={{
                    backgroundColor: colors.card,
                    backgroundGradientFrom: colors.card,
                    backgroundGradientTo: colors.card,
                    decimalPlaces: 1,
                    color: (opacity = 1) => `rgba(34, 197, 94, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
                    style: {
                      borderRadius: 12,
                    },
                    propsForDots: {
                      r: "4",
                      strokeWidth: "2",
                      stroke: "#22C55E",
                    },
                    propsForBackgroundLines: {
                      strokeDasharray: "",
                      stroke: "rgba(100, 116, 139, 0.2)",
                    },
                  }}
                  bezier
                  style={{
                    marginVertical: 8,
                    borderRadius: 12,
                  }}
                  withInnerLines={true}
                  withOuterLines={false}
                  fromZero={false}
                />
              </View>
            </View>
          )}

          {/* Weekly Averages */}
          {weeklyStats.length > 0 && (
            <View style={styles.weeklySection}>
              <Text style={styles.sectionTitle}>Weekly Averages</Text>
              {weeklyStats.map((week, index) => (
                <View key={week.weekStart} style={styles.weekRow}>
                  <View style={styles.weekInfo}>
                    <Calendar size={14} color={colors.mutedForeground} />
                    <Text style={styles.weekRange}>
                      {index === 0 ? "This Week" : formatWeekRange(week.weekStart, week.weekEnd)}
                    </Text>
                  </View>
                  <View style={styles.weekStats}>
                    <Text style={styles.weekAvg}>{week.average.toFixed(1)} lbs</Text>
                    <Text style={styles.weekMeta}>
                      ({week.count} entries, {week.min.toFixed(1)}-{week.max.toFixed(1)})
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Morning Reminder Toggle */}
          <View style={styles.reminderSection}>
            <View style={styles.reminderRow}>
              <View style={styles.reminderInfo}>
                <Bell size={20} color="#22C55E" />
                <View>
                  <Text style={styles.reminderTitle}>Morning Reminder</Text>
                  <Text style={styles.reminderSubtitle}>Daily at 7:30 AM</Text>
                </View>
              </View>
              <Switch
                value={reminderEnabled}
                onValueChange={toggleReminder}
                trackColor={{ false: colors.border, true: "rgba(34, 197, 94, 0.5)" }}
                thumbColor={reminderEnabled ? "#22C55E" : colors.mutedForeground}
              />
            </View>
          </View>

          {/* Add Weight Section */}
          <View style={styles.addSection}>
            <Text style={styles.sectionTitle}>Log Weight</Text>

            {/* Time of Day Selector */}
            <View style={styles.timeOfDayContainer}>
              <TouchableOpacity
                style={[
                  styles.timeOfDayButton,
                  selectedTimeOfDay === "morning" && styles.timeOfDayButtonActive,
                ]}
                onPress={() => setSelectedTimeOfDay("morning")}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.timeOfDayText,
                    selectedTimeOfDay === "morning" && styles.timeOfDayTextActive,
                  ]}
                >
                  Morning
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.timeOfDayButton,
                  selectedTimeOfDay === "evening" && styles.timeOfDayButtonActive,
                ]}
                onPress={() => setSelectedTimeOfDay("evening")}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.timeOfDayText,
                    selectedTimeOfDay === "evening" && styles.timeOfDayTextActive,
                  ]}
                >
                  Evening
                </Text>
              </TouchableOpacity>
            </View>

            {/* Weight Input */}
            <View style={styles.addForm}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Weight (lbs)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={addWeight}
                  onChangeText={setAddWeight}
                />
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddWeight}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* History Toggle */}
          <TouchableOpacity
            style={styles.historyToggle}
            onPress={() => setShowHistory(!showHistory)}
            activeOpacity={0.7}
          >
            <Text style={styles.historyToggleText}>
              {showHistory ? "Hide History" : "Show History"}
            </Text>
          </TouchableOpacity>

          {/* History */}
          {showHistory && (
            <View style={styles.historySection}>
              <Text style={styles.sectionTitle}>History</Text>
              {loading ? (
                <Text style={styles.loadingText}>Loading...</Text>
              ) : sortedDates.length === 0 ? (
                <Text style={styles.emptyText}>No weight logs yet. Start tracking today!</Text>
              ) : (
                sortedDates.slice(0, 14).map((date) => {
                  const dayLogs = groupedLogs[date];

                  return (
                    <View key={date} style={styles.dayGroup}>
                      <Text style={styles.dayDate}>{formatDate(date)}</Text>
                      {dayLogs.map((log) => (
                        <View key={log.id} style={styles.logCard}>
                          <View style={styles.logInfo}>
                            <Scale size={16} color="#22C55E" />
                            <Text style={styles.logAmount}>{log.weight_lbs} lbs</Text>
                            {log.time_of_day && (
                              <View style={styles.timeOfDayBadge}>
                                <Text style={styles.timeOfDayBadgeText}>
                                  {formatTimeOfDay(log.time_of_day)}
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
                      ))}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Bottom Spacing */}
          <View style={{ height: 40 }} />
        </ScrollView>
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
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "bold",
    color: colors.foreground,
  },
  statUnit: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  changeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginTop: 4,
  },
  changeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chartSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
  },
  chartContainer: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    paddingTop: 8,
  },
  weeklySection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  weekRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  weekInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  weekRange: {
    fontSize: 14,
    color: colors.foreground,
  },
  weekStats: {
    alignItems: "flex-end",
  },
  weekAvg: {
    fontSize: 16,
    fontWeight: "600",
    color: "#22C55E",
  },
  weekMeta: {
    fontSize: 11,
    color: colors.mutedForeground,
  },
  reminderSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  reminderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 16,
  },
  reminderInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  reminderTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  reminderSubtitle: {
    fontSize: 12,
    color: colors.mutedForeground,
  },
  addSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  timeOfDayContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  timeOfDayButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  timeOfDayButtonActive: {
    backgroundColor: "#22C55E",
    borderColor: "#22C55E",
  },
  timeOfDayText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  timeOfDayTextActive: {
    color: "#FFFFFF",
  },
  addForm: {
    flexDirection: "row",
    gap: 12,
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
    backgroundColor: "#22C55E",
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
  historyToggle: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  historyToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
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
  dayDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
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
  timeOfDayBadge: {
    backgroundColor: colors.background,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  timeOfDayBadgeText: {
    fontSize: 12,
    color: colors.mutedForeground,
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
