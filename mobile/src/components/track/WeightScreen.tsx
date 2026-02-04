import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus, Scale, Trash2, TrendingDown, TrendingUp } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WeightLog, TimeOfDay } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

interface WeightScreenProps {
  onClose: () => void;
}

export function WeightScreen({ onClose }: WeightScreenProps) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<WeightLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [addWeight, setAddWeight] = useState("");
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<TimeOfDay>("morning");
  const [latestWeight, setLatestWeight] = useState<number | null>(null);
  const [weightChange, setWeightChange] = useState<number | null>(null);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchWeightLogs();
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

      // Calculate latest weight and change
      if (data && data.length > 0) {
        const latest = parseFloat(data[0].weight_lbs.toString());
        setLatestWeight(latest);

        if (data.length > 1) {
          const previous = parseFloat(data[1].weight_lbs.toString());
          setWeightChange(latest - previous);
        }
      }
    } catch (error: any) {
      console.error("Error fetching weight logs:", error);
      Alert.alert("Error", "Failed to load weight logs");
    } finally {
      setLoading(false);
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

  // Group logs by date
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

          {/* Latest Weight Card */}
          <View style={styles.latestCard}>
            <Text style={styles.latestLabel}>Latest Weight</Text>
            <Text style={styles.latestAmount}>
              {latestWeight !== null ? `${latestWeight.toFixed(1)} lbs` : "No data"}
            </Text>
            {weightChange !== null && (
              <View style={styles.changeContainer}>
                {weightChange > 0 ? (
                  <TrendingUp size={16} color="#EF4444" />
                ) : weightChange < 0 ? (
                  <TrendingDown size={16} color="#22C55E" />
                ) : null}
                <Text
                  style={[
                    styles.changeText,
                    { color: weightChange > 0 ? "#EF4444" : weightChange < 0 ? "#22C55E" : colors.mutedForeground },
                  ]}
                >
                  {weightChange > 0 ? "+" : ""}
                  {weightChange.toFixed(1)} lbs
                </Text>
              </View>
            )}
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

          {/* History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>History</Text>
            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : sortedDates.length === 0 ? (
              <Text style={styles.emptyText}>No weight logs yet. Start tracking today!</Text>
            ) : (
              sortedDates.map((date) => {
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
  latestCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    alignItems: "center",
  },
  latestLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  latestAmount: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#22C55E",
    marginBottom: 8,
  },
  changeContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  changeText: {
    fontSize: 16,
    fontWeight: "600",
  },
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
