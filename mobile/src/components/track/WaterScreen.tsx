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
import { ChevronLeft, Plus, Droplets, Trash2 } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { WaterLog } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

interface WaterScreenProps {
  onClose: () => void;
}

export function WaterScreen({ onClose }: WaterScreenProps) {
  const insets = useSafeAreaInsets();
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [addAmount, setAddAmount] = useState("");
  const [todayTotal, setTodayTotal] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    fetchWaterLogs();
  }, []);

  const fetchWaterLogs = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to track water");
        return;
      }

      // Fetch logs from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("water_logs")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .order("date", { ascending: false })
        .order("logged_at", { ascending: false });

      if (error) throw error;

      setLogs(data || []);

      // Calculate today's total
      const todayLogs = (data || []).filter((log) => log.date === today);
      const total = todayLogs.reduce((sum, log) => sum + parseFloat(log.amount_oz.toString()), 0);
      setTodayTotal(total);
    } catch (error: any) {
      console.error("Error fetching water logs:", error);
      Alert.alert("Error", "Failed to load water logs");
    } finally {
      setLoading(false);
    }
  };

  const handleAddWater = async () => {
    const amount = parseFloat(addAmount);

    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Invalid Amount", "Please enter a valid amount of water in ounces");
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to log water");
        return;
      }

      const { error } = await supabase.from("water_logs").insert([
        {
          user_id: user.id,
          date: today,
          amount_oz: amount,
          logged_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      setAddAmount("");
      await fetchWaterLogs();
      Alert.alert("Success", `Added ${amount} oz of water`);
    } catch (error: any) {
      console.error("Error adding water log:", error);
      Alert.alert("Error", "Failed to add water log");
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

            await fetchWaterLogs();
          } catch (error: any) {
            console.error("Error deleting water log:", error);
            Alert.alert("Error", "Failed to delete water log");
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

  // Group logs by date
  const groupedLogs: Record<string, WaterLog[]> = {};
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
            <Droplets size={32} color="#3B82F6" strokeWidth={2} />
            <Text style={styles.pageTitle}>Water Intake</Text>
          </View>

          {/* Today's Total */}
          <View style={styles.todayCard}>
            <Text style={styles.todayLabel}>Today's Total</Text>
            <Text style={styles.todayAmount}>{todayTotal.toFixed(1)} oz</Text>
            <Text style={styles.todaySubtext}>Goal: 64 oz</Text>
          </View>

          {/* Add Water Section */}
          <View style={styles.addSection}>
            <Text style={styles.sectionTitle}>Log Water</Text>
            <View style={styles.addForm}>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Amount (oz)"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="decimal-pad"
                  value={addAmount}
                  onChangeText={setAddAmount}
                />
              </View>
              <TouchableOpacity
                style={styles.addButton}
                onPress={handleAddWater}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add</Text>
              </TouchableOpacity>
            </View>

            {/* Quick Add Buttons */}
            <View style={styles.quickAddContainer}>
              <Text style={styles.quickAddLabel}>Quick Add:</Text>
              <View style={styles.quickAddButtons}>
                {[8, 12, 16, 20].map((amount) => (
                  <TouchableOpacity
                    key={amount}
                    style={styles.quickAddButton}
                    onPress={() => {
                      setAddAmount(amount.toString());
                      handleAddWater();
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickAddButtonText}>{amount} oz</Text>
                  </TouchableOpacity>
                ))}
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

                return (
                  <View key={date} style={styles.dayGroup}>
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayDate}>{formatDate(date)}</Text>
                      <Text style={styles.dayTotal}>{dayTotal.toFixed(1)} oz</Text>
                    </View>
                    {dayLogs.map((log) => (
                      <View key={log.id} style={styles.logCard}>
                        <View style={styles.logInfo}>
                          <Droplets size={16} color="#3B82F6" />
                          <Text style={styles.logAmount}>{log.amount_oz} oz</Text>
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
  todayCard: {
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 20,
    backgroundColor: "rgba(59, 130, 246, 0.1)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
    alignItems: "center",
  },
  todayLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 8,
  },
  todayAmount: {
    fontSize: 42,
    fontWeight: "bold",
    color: "#3B82F6",
    marginBottom: 4,
  },
  todaySubtext: {
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
  quickAddLabel: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 8,
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
