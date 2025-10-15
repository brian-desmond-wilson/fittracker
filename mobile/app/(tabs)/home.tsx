import { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "@/src/lib/supabase";
import { Flame, Timer, Droplet } from "lucide-react-native";
import GoingToBedButton from "@/src/components/sleep/GoingToBedButton";
import WakeUpButton from "@/src/components/sleep/WakeUpButton";
import SleepQualityModal from "@/src/components/sleep/SleepQualityModal";

export default function Home() {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [sleepQualityModalVisible, setSleepQualityModalVisible] = useState(false);
  const [currentSleepSessionId, setCurrentSleepSessionId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();

        if (profile?.full_name) {
          setUserName(profile.full_name);
        } else {
          setUserName("User");
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
      setUserName("User");
    } finally {
      setLoading(false);
    }
  }

  const handleWakeUp = (sleepSessionId: string) => {
    setCurrentSleepSessionId(sleepSessionId);
    setSleepQualityModalVisible(true);
  };

  const handleSleepQualityComplete = () => {
    // Refresh the wake up button to check if it should still be visible
    setRefreshKey((prev) => prev + 1);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22C55E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{userName}</Text>
        </View>

        {/* Sleep Tracking Buttons */}
        <WakeUpButton key={`wake-${refreshKey}`} onWakeUp={handleWakeUp} />
        <GoingToBedButton />

        {/* Today's Summary Section */}
        <Text style={styles.sectionTitle}>Today's Summary</Text>

        {/* Summary Cards Grid */}
        <View style={styles.grid}>
          {/* Calories Burned Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Calories Burned</Text>
              <View style={styles.iconContainer}>
                <Flame size={20} color="#F97316" strokeWidth={2} />
              </View>
            </View>
            <Text style={styles.cardValue}>0</Text>
            <Text style={styles.cardSubtext}>0 workouts</Text>
          </View>

          {/* Workout Time Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Workout Time</Text>
              <View style={[styles.iconContainer, styles.iconGreen]}>
                <Timer size={20} color="#22C55E" strokeWidth={2} />
              </View>
            </View>
            <Text style={styles.cardValue}>0m</Text>
            <Text style={styles.cardSubtext}>Minutes active</Text>
          </View>

          {/* Calories Eaten Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Calories Eaten</Text>
              <View style={styles.iconContainer}>
                <Flame size={20} color="#F97316" strokeWidth={2} />
              </View>
            </View>
            <Text style={styles.cardValue}>0</Text>
            <Text style={styles.cardSubtext}>No goal set</Text>
          </View>

          {/* Water Intake Card */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Water Intake</Text>
              <View style={[styles.iconContainer, styles.iconBlue]}>
                <Droplet size={20} color="#3B82F6" strokeWidth={2} />
              </View>
            </View>
            <Text style={styles.cardValue}>0.0L</Text>
            <Text style={styles.cardSubtext}>Stay hydrated</Text>
          </View>
        </View>

        {/* Recent Workouts Section */}
        <Text style={styles.sectionTitle}>Recent Workouts</Text>

        {/* Empty State */}
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>🏋️</Text>
          <Text style={styles.emptyStateTitle}>No workouts yet</Text>
          <Text style={styles.emptyStateText}>
            Start your first workout to see it here
          </Text>
        </View>
      </ScrollView>

      {/* Sleep Quality Modal */}
      <SleepQualityModal
        visible={sleepQualityModalVisible}
        sleepSessionId={currentSleepSessionId}
        onClose={() => setSleepQualityModalVisible(false)}
        onComplete={handleSleepQualityComplete}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0F1E",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
  },
  welcomeText: {
    fontSize: 16,
    color: "#9CA3AF",
    marginBottom: 4,
  },
  userName: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 16,
    marginTop: 8,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
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
    backgroundColor: "rgba(249, 115, 22, 0.2)",
    borderRadius: 8,
    padding: 6,
  },
  iconGreen: {
    backgroundColor: "rgba(34, 197, 94, 0.2)",
  },
  iconBlue: {
    backgroundColor: "rgba(59, 130, 246, 0.2)",
  },
  cardValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  cardSubtext: {
    fontSize: 12,
    color: "#6B7280",
  },
  emptyState: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 40,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#9CA3AF",
    textAlign: "center",
  },
});
