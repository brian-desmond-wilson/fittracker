import { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { User } from "lucide-react-native";
import MorningRoutineBanner from "@/src/components/morning/MorningRoutineBanner";
import MorningRoutineWizard from "@/src/components/morning/MorningRoutineWizard";
import { TodaysWorkoutCard } from "@/src/components/TodaysWorkoutCard";
import { WaterIntakeHomeCard } from "@/src/components/WaterIntakeHomeCard";
import { MealsHomeCard } from "@/src/components/MealsHomeCard";

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [morningRoutineWizardVisible, setMorningRoutineWizardVisible] = useState(false);
  const [routineBannerKey, setRoutineBannerKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

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

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Minimum delay so spinner is visible
      await Promise.all([
        loadUserData(),
        new Promise(resolve => setTimeout(resolve, 500)),
      ]);
      // Refresh child components (Meals + Water cards re-fetch on focus
      // but they also watch refreshKey)
      setRefreshKey((prev) => prev + 1);
      setRoutineBannerKey((prev) => prev + 1);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const handleRoutineComplete = () => {
    // Refresh banner to hide it after routine is completed
    setRoutineBannerKey((prev) => prev + 1);
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
      {/* Top Navigation Bar */}
      <View style={styles.topBar}>
        <TouchableOpacity
          onPress={() => router.push("/profile")}
          style={styles.iconButton}
        >
          <User size={24} color="#9CA3AF" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#22C55E"
            colors={["#22C55E"]}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{userName}</Text>
        </View>

        {/* Morning Routine Banner */}
        <MorningRoutineBanner
          key={`banner-${routineBannerKey}`}
          onPress={() => setMorningRoutineWizardVisible(true)}
          refreshKey={routineBannerKey}
        />

        {/* Today's Workout Section */}
        <Text style={styles.sectionTitle}>Today's Workout</Text>
        <TodaysWorkoutCard key={`workout-${refreshKey}`} />

        {/* Today's Summary Section */}
        <Text style={styles.sectionTitle}>Today's Summary</Text>

        {/* Summary Cards Grid */}
        <View style={styles.grid}>
          {/* Meals Card */}
          <MealsHomeCard refreshKey={refreshKey} />

          {/* Water Intake Card */}
          <WaterIntakeHomeCard refreshKey={refreshKey} />
        </View>
      </ScrollView>

      {/* Sticky Refresh Indicator */}
      {refreshing && (
        <View style={styles.refreshingContainer}>
          <ActivityIndicator size="large" color="#22C55E" />
          <Text style={styles.refreshingText}>Refreshing...</Text>
        </View>
      )}

      {/* Morning Routine Wizard */}
      <MorningRoutineWizard
        visible={morningRoutineWizardVisible}
        onClose={() => {
          setMorningRoutineWizardVisible(false);
          setRoutineBannerKey((prev) => prev + 1);
        }}
        onComplete={handleRoutineComplete}
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
  refreshingContainer: {
    position: "absolute",
    top: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: "#0A0F1E",
    zIndex: 10,
  },
  refreshingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#9CA3AF",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#0A0F1E",
    borderBottomWidth: 1,
    borderBottomColor: "#1E293B",
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
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
