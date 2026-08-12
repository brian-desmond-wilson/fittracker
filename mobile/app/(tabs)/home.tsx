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
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { User } from "lucide-react-native";
import { colors, icons, radii, spacing, typography } from "@/src/theme/tokens";
import MorningRoutineBanner from "@/src/components/morning/MorningRoutineBanner";
import MorningRoutineWizard from "@/src/components/morning/MorningRoutineWizard";
import { TodaysWorkoutCard } from "@/src/components/TodaysWorkoutCard";
import { WaterIntakeHomeCard } from "@/src/components/WaterIntakeHomeCard";
import { MealsHomeCard } from "@/src/components/MealsHomeCard";
import { EatNextHomeCard } from "@/src/components/EatNextHomeCard";
import { RampHomeBanner } from "@/src/components/RampHomeBanner";

export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
        <ActivityIndicator size="large" color={colors.brand} />
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
          <User size={icons.lg} color={colors.textMuted} strokeWidth={icons.strokeWidth} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing.xxl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.brand}
            colors={[colors.brand]}
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

        {/* Ramp advance banner (renders nothing unless actionable) */}
        <RampHomeBanner refreshKey={refreshKey} />

        {/* Today's Summary Section */}
        <Text style={styles.sectionTitle}>Today's Summary</Text>

        {/* Summary Cards Grid */}
        <View style={styles.grid}>
          {/* Meals Card */}
          <MealsHomeCard refreshKey={refreshKey} />

          {/* Water Intake Card */}
          <WaterIntakeHomeCard refreshKey={refreshKey} />
        </View>

        {/* Eat Next Section */}
        <Text style={styles.sectionTitle}>Eat Next</Text>
        <EatNextHomeCard refreshKey={refreshKey} />

        {/* Today's Workout Section */}
        <Text style={styles.sectionTitle}>Today's Workout</Text>
        <TodaysWorkoutCard key={`workout-${refreshKey}`} />
      </ScrollView>

      {/* Sticky Refresh Indicator */}
      {refreshing && (
        <View style={styles.refreshingContainer}>
          <ActivityIndicator size="large" color={colors.brand} />
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
    backgroundColor: colors.bg,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  refreshingContainer: {
    position: "absolute",
    // Positional offset, not spacing: parks the sticky indicator just below
    // the top bar. No spacing step lands there and it is not padding on a
    // control, so it stays a literal.
    top: 100,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: spacing.xl,
    backgroundColor: colors.bg,
    zIndex: 10,
  },
  refreshingText: {
    ...typography.body,
    color: colors.textMuted,
    marginTop: spacing.md,
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: spacing.screenGutter,
    paddingVertical: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconButton: {
    padding: spacing.sm,
    borderRadius: radii.control,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.screenGutter,
  },
  header: {
    marginBottom: spacing.xxl,
  },
  welcomeText: {
    ...typography.body,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  userName: {
    ...typography.titleRoot,
    color: colors.text,
  },
  // Home's section headers stay screen-owned 20/600 text (they are the
  // scroll body's own landmarks, not the 13/700 uppercase `typography.section`
  // rail) — recolored via tokens only, per the plan.
  sectionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
    marginBottom: spacing.xxl,
  },
});
