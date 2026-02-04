import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus, Moon, Trash2, Star } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "@/src/lib/colors";
import { SleepLog } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

interface SleepScreenProps {
  onClose: () => void;
}

export function SleepScreen({ onClose }: SleepScreenProps) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<SleepLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Add Sleep State
  const [bedtime, setBedtime] = useState(new Date());
  const [wakeTime, setWakeTime] = useState(new Date());
  const [qualityRating, setQualityRating] = useState<number>(3);
  const [showBedtimePicker, setShowBedtimePicker] = useState(false);
  const [showWakeTimePicker, setShowWakeTimePicker] = useState(false);

  // Latest stats
  const [avgHoursSlept, setAvgHoursSlept] = useState<number | null>(null);
  const [latestSleep, setLatestSleep] = useState<SleepLog | null>(null);

  useEffect(() => {
    fetchSleepLogs();

    // Set default times
    const now = new Date();
    const defaultBedtime = new Date();
    defaultBedtime.setHours(22, 0, 0, 0); // 10:00 PM
    setBedtime(defaultBedtime);

    const defaultWakeTime = new Date();
    defaultWakeTime.setHours(6, 0, 0, 0); // 6:00 AM
    if (defaultWakeTime <= defaultBedtime) {
      defaultWakeTime.setDate(defaultWakeTime.getDate() + 1);
    }
    setWakeTime(defaultWakeTime);
  }, []);

  const fetchSleepLogs = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to track sleep");
        return;
      }

      // Fetch logs from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("sleep_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .order("date", { ascending: false });

      if (error) throw error;

      setLogs(data || []);

      // Calculate average hours slept (last 7 days)
      if (data && data.length > 0) {
        const last7Days = data.slice(0, Math.min(7, data.length));
        const totalHours = last7Days.reduce((sum, log) => sum + parseFloat(log.hours_slept.toString()), 0);
        setAvgHoursSlept(totalHours / last7Days.length);
        setLatestSleep(data[0]);
      }
    } catch (error: any) {
      console.error("Error fetching sleep logs:", error);
      Alert.alert("Error", "Failed to load sleep logs");
    } finally {
      setLoading(false);
    }
  };

  const handleAddSleep = async () => {
    if (wakeTime <= bedtime) {
      Alert.alert("Invalid Times", "Wake time must be after bedtime");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log sleep");
        return;
      }

      // Date is the date the user went to bed
      const sleepDate = bedtime.toISOString().split("T")[0];

      const { error } = await supabase.from("sleep_logs").insert([
        {
          user_id: user.id,
          date: sleepDate,
          bedtime: bedtime.toISOString(),
          wake_time: wakeTime.toISOString(),
          quality_rating: qualityRating,
          logged_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      // Reset form
      const defaultBedtime = new Date();
      defaultBedtime.setHours(22, 0, 0, 0);
      setBedtime(defaultBedtime);

      const defaultWakeTime = new Date();
      defaultWakeTime.setHours(6, 0, 0, 0);
      if (defaultWakeTime <= defaultBedtime) {
        defaultWakeTime.setDate(defaultWakeTime.getDate() + 1);
      }
      setWakeTime(defaultWakeTime);
      setQualityRating(3);

      await fetchSleepLogs();
      Alert.alert("Success", "Sleep logged successfully");
    } catch (error: any) {
      console.error("Error adding sleep log:", error);
      Alert.alert("Error", "Failed to add sleep log");
    }
  };

  const handleDeleteLog = async (logId: string) => {
    Alert.alert("Delete Log", "Are you sure you want to delete this sleep log?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("sleep_logs").delete().eq("id", logId);

            if (error) throw error;

            await fetchSleepLogs();
          } catch (error: any) {
            console.error("Error deleting sleep log:", error);
            Alert.alert("Error", "Failed to delete sleep log");
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

  const formatHours = (hours: number) => {
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    return `${h}h ${m}m`;
  };

  const calculateHours = (bedtimeStr: string, wakeTimeStr: string) => {
    const bed = new Date(bedtimeStr);
    const wake = new Date(wakeTimeStr);
    const diff = wake.getTime() - bed.getTime();
    return diff / (1000 * 60 * 60);
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
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleContainer}>
            <Moon size={32} color="#6366F1" strokeWidth={2} />
            <Text style={styles.pageTitle}>Sleep</Text>
          </View>

          {/* Average Sleep Card */}
          <View style={styles.statsCard}>
            <Text style={styles.statsLabel}>7-Day Average</Text>
            <Text style={styles.statsAmount}>
              {avgHoursSlept !== null ? formatHours(avgHoursSlept) : "No data"}
            </Text>
            {latestSleep && (
              <Text style={styles.statsSubtext}>
                Last: {formatHours(parseFloat(latestSleep.hours_slept.toString()))}
              </Text>
            )}
          </View>

          {/* Add Sleep Section */}
          <View style={styles.addSection}>
            <Text style={styles.sectionTitle}>Log Sleep</Text>

            {/* Bedtime Selector */}
            <View style={styles.timeSelector}>
              <Text style={styles.timeLabel}>Bedtime</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowBedtimePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.timeButtonText}>{formatTime(bedtime.toISOString())}</Text>
              </TouchableOpacity>
            </View>

            {showBedtimePicker && (
              <DateTimePicker
                value={bedtime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  setShowBedtimePicker(Platform.OS === "ios");
                  if (selectedDate) {
                    setBedtime(selectedDate);
                  }
                }}
              />
            )}

            {/* Wake Time Selector */}
            <View style={styles.timeSelector}>
              <Text style={styles.timeLabel}>Wake Time</Text>
              <TouchableOpacity
                style={styles.timeButton}
                onPress={() => setShowWakeTimePicker(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.timeButtonText}>{formatTime(wakeTime.toISOString())}</Text>
              </TouchableOpacity>
            </View>

            {showWakeTimePicker && (
              <DateTimePicker
                value={wakeTime}
                mode="time"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  setShowWakeTimePicker(Platform.OS === "ios");
                  if (selectedDate) {
                    setWakeTime(selectedDate);
                  }
                }}
              />
            )}

            {/* Quality Rating */}
            <View style={styles.qualitySection}>
              <Text style={styles.timeLabel}>Quality Rating</Text>
              <View style={styles.starContainer}>
                {[1, 2, 3, 4, 5].map((rating) => (
                  <TouchableOpacity
                    key={rating}
                    onPress={() => setQualityRating(rating)}
                    activeOpacity={0.7}
                    style={styles.starButton}
                  >
                    <Star
                      size={32}
                      color={rating <= qualityRating ? "#F59E0B" : colors.mutedForeground}
                      fill={rating <= qualityRating ? "#F59E0B" : "none"}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Add Button */}
            <TouchableOpacity style={styles.addButton} onPress={handleAddSleep} activeOpacity={0.7}>
              <Plus size={20} color="#FFFFFF" />
              <Text style={styles.addButtonText}>Log Sleep</Text>
            </TouchableOpacity>
          </View>

          {/* History */}
          <View style={styles.historySection}>
            <Text style={styles.sectionTitle}>History</Text>
            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : logs.length === 0 ? (
              <Text style={styles.emptyText}>No sleep logs yet. Start tracking today!</Text>
            ) : (
              logs.map((log) => (
                <View key={log.id} style={styles.logCard}>
                  <View style={styles.logHeader}>
                    <Text style={styles.logDate}>{formatDate(log.date)}</Text>
                    <TouchableOpacity
                      onPress={() => handleDeleteLog(log.id)}
                      style={styles.deleteButton}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={18} color={colors.mutedForeground} />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.logDetails}>
                    <View style={styles.logRow}>
                      <Text style={styles.logLabel}>Bedtime:</Text>
                      <Text style={styles.logValue}>{formatTime(log.bedtime)}</Text>
                    </View>
                    <View style={styles.logRow}>
                      <Text style={styles.logLabel}>Wake:</Text>
                      <Text style={styles.logValue}>{formatTime(log.wake_time)}</Text>
                    </View>
                    <View style={styles.logRow}>
                      <Text style={styles.logLabel}>Duration:</Text>
                      <Text style={styles.logHours}>
                        {formatHours(parseFloat(log.hours_slept.toString()))}
                      </Text>
                    </View>
                    {log.quality_rating && (
                      <View style={styles.logRow}>
                        <Text style={styles.logLabel}>Quality:</Text>
                        <View style={styles.miniStarContainer}>
                          {[1, 2, 3, 4, 5].map((rating) => (
                            <Star
                              key={rating}
                              size={14}
                              color={rating <= log.quality_rating! ? "#F59E0B" : colors.mutedForeground}
                              fill={rating <= log.quality_rating! ? "#F59E0B" : "none"}
                            />
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
              ))
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
  statsCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "rgba(99, 102, 241, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(99, 102, 241, 0.3)",
    alignItems: "center",
  },
  statsLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  statsAmount: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#6366F1",
    marginBottom: 4,
  },
  statsSubtext: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  addSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  timeSelector: {
    marginBottom: 16,
  },
  timeLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  timeButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  timeButtonText: {
    fontSize: 16,
    color: colors.foreground,
    fontWeight: "500",
  },
  qualitySection: {
    marginBottom: 20,
  },
  starContainer: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 8,
  },
  starButton: {
    padding: 4,
  },
  addButton: {
    backgroundColor: "#6366F1",
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
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
  logCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  logHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  logDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  deleteButton: {
    padding: 4,
  },
  logDetails: {
    gap: 8,
  },
  logRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  logLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  logValue: {
    fontSize: 14,
    color: colors.foreground,
    fontWeight: "500",
  },
  logHours: {
    fontSize: 14,
    color: "#6366F1",
    fontWeight: "600",
  },
  miniStarContainer: {
    flexDirection: "row",
    gap: 2,
  },
});
