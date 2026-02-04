import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronLeft,
  Calendar,
  TrendingUp,
  CheckCircle2,
  Activity,
  Target,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";

// Mock program instance data
const MOCK_INSTANCE = {
  id: "1",
  name: "Summer Build 2024",
  programTitle: "Project Mass",
  programCreator: "Dr. Jacob Wilson",
  startDate: "2024-06-01",
  expectedEndDate: "2024-09-08",
  actualEndDate: "2024-09-08",
  status: "completed",
  currentWeek: 14,
  currentDay: 84,
  totalWeeks: 14,
  totalWorkouts: 84,
  workoutsCompleted: 84,
  completionPercentage: 100,
  totalVolume: 1250000, // Total pounds lifted
  avgConsistency: 98, // Percentage
};

// Mock workout history
const MOCK_WORKOUT_HISTORY = [
  {
    id: "1",
    weekNumber: 14,
    dayNumber: 84,
    workoutName: "Pull Hypertrophy",
    completedDate: "2024-09-08",
    duration: 78,
    totalVolume: 15200,
    exercisesCompleted: 6,
  },
  {
    id: "2",
    weekNumber: 14,
    dayNumber: 83,
    workoutName: "Push Strength",
    completedDate: "2024-09-07",
    duration: 82,
    totalVolume: 18400,
    exercisesCompleted: 5,
  },
  {
    id: "3",
    weekNumber: 14,
    dayNumber: 82,
    workoutName: "Leg Hypertrophy",
    completedDate: "2024-09-06",
    duration: 90,
    totalVolume: 22100,
    exercisesCompleted: 7,
  },
  {
    id: "4",
    weekNumber: 13,
    dayNumber: 81,
    workoutName: "Pull Strength",
    completedDate: "2024-09-04",
    duration: 75,
    totalVolume: 16800,
    exercisesCompleted: 5,
  },
  {
    id: "5",
    weekNumber: 13,
    dayNumber: 80,
    workoutName: "Push Hypertrophy",
    completedDate: "2024-09-03",
    duration: 85,
    totalVolume: 19200,
    exercisesCompleted: 6,
  },
];

export default function ProgramInstanceDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();

  const instanceId = params.id as string;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const formatVolume = (pounds: number) => {
    if (pounds >= 1000000) {
      return `${(pounds / 1000000).toFixed(1)}M lbs`;
    }
    if (pounds >= 1000) {
      return `${(pounds / 1000).toFixed(1)}K lbs`;
    }
    return `${pounds} lbs`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed":
        return "#22C55E";
      case "active":
        return "#3B82F6";
      case "incomplete":
        return "#F59E0B";
      default:
        return colors.mutedForeground;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "active":
        return "Active";
      case "incomplete":
        return "Incomplete";
      default:
        return status;
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Program</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Program Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.instanceName}>{MOCK_INSTANCE.name}</Text>
            <Text style={styles.programTitle}>{MOCK_INSTANCE.programTitle}</Text>
            <Text style={styles.programCreator}>by {MOCK_INSTANCE.programCreator}</Text>
          </View>

          {/* Status Badge */}
          <View style={styles.statusSection}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${getStatusColor(MOCK_INSTANCE.status)}20` },
              ]}
            >
              <Text
                style={[styles.statusText, { color: getStatusColor(MOCK_INSTANCE.status) }]}
              >
                {getStatusLabel(MOCK_INSTANCE.status)}
              </Text>
            </View>
          </View>

          {/* Progress Overview */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Progress Overview</Text>

            {/* Progress Bar */}
            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressLabel}>Overall Completion</Text>
                <Text style={styles.progressPercentage}>
                  {MOCK_INSTANCE.completionPercentage}%
                </Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${MOCK_INSTANCE.completionPercentage}%`,
                      backgroundColor: getStatusColor(MOCK_INSTANCE.status),
                    },
                  ]}
                />
              </View>
              <View style={styles.progressStats}>
                <Text style={styles.progressStatsText}>
                  Week {MOCK_INSTANCE.currentWeek} of {MOCK_INSTANCE.totalWeeks}
                </Text>
                <Text style={styles.progressStatsText}>
                  {MOCK_INSTANCE.workoutsCompleted}/{MOCK_INSTANCE.totalWorkouts} workouts
                </Text>
              </View>
            </View>
          </View>

          {/* Timeline */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Timeline</Text>
            <View style={styles.timelineCard}>
              <View style={styles.timelineRow}>
                <Calendar size={18} color={colors.primary} />
                <Text style={styles.timelineLabel}>Started</Text>
                <Text style={styles.timelineValue}>{formatDate(MOCK_INSTANCE.startDate)}</Text>
              </View>
              <View style={styles.timelineRow}>
                <Target size={18} color={colors.primary} />
                <Text style={styles.timelineLabel}>Expected End</Text>
                <Text style={styles.timelineValue}>
                  {formatDate(MOCK_INSTANCE.expectedEndDate)}
                </Text>
              </View>
              {MOCK_INSTANCE.actualEndDate && (
                <View style={styles.timelineRow}>
                  <CheckCircle2 size={18} color="#22C55E" />
                  <Text style={styles.timelineLabel}>Completed</Text>
                  <Text style={styles.timelineValue}>
                    {formatDate(MOCK_INSTANCE.actualEndDate)}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Statistics */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Statistics</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Activity size={24} color={colors.primary} />
                <Text style={styles.statValue}>{formatVolume(MOCK_INSTANCE.totalVolume)}</Text>
                <Text style={styles.statLabel}>Total Volume</Text>
              </View>
              <View style={styles.statCard}>
                <TrendingUp size={24} color={colors.primary} />
                <Text style={styles.statValue}>{MOCK_INSTANCE.avgConsistency}%</Text>
                <Text style={styles.statLabel}>Consistency</Text>
              </View>
              <View style={styles.statCard}>
                <CheckCircle2 size={24} color={colors.primary} />
                <Text style={styles.statValue}>{MOCK_INSTANCE.workoutsCompleted}</Text>
                <Text style={styles.statLabel}>Workouts Done</Text>
              </View>
            </View>
          </View>

          {/* Workout History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workout History</Text>
            {MOCK_WORKOUT_HISTORY.map((workout) => (
              <TouchableOpacity key={workout.id} style={styles.workoutCard} activeOpacity={0.7}>
                <View style={styles.workoutHeader}>
                  <View style={styles.workoutDay}>
                    <Text style={styles.workoutDayText}>W{workout.weekNumber}</Text>
                    <Text style={styles.workoutDaySubtext}>D{workout.dayNumber}</Text>
                  </View>
                  <View style={styles.workoutInfo}>
                    <Text style={styles.workoutName}>{workout.workoutName}</Text>
                    <Text style={styles.workoutDate}>{formatDate(workout.completedDate)}</Text>
                  </View>
                </View>
                <View style={styles.workoutStats}>
                  <View style={styles.workoutStat}>
                    <Text style={styles.workoutStatLabel}>Duration</Text>
                    <Text style={styles.workoutStatValue}>{workout.duration} min</Text>
                  </View>
                  <View style={styles.workoutStat}>
                    <Text style={styles.workoutStatLabel}>Volume</Text>
                    <Text style={styles.workoutStatValue}>
                      {formatVolume(workout.totalVolume)}
                    </Text>
                  </View>
                  <View style={styles.workoutStat}>
                    <Text style={styles.workoutStatLabel}>Exercises</Text>
                    <Text style={styles.workoutStatValue}>{workout.exercisesCompleted}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>

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
    color: "#FFFFFF",
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  titleSection: {
    marginBottom: 16,
  },
  instanceName: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
    marginBottom: 8,
  },
  programTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  programCreator: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  statusSection: {
    marginBottom: 32,
  },
  statusBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "600",
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  progressCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  progressLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
  },
  progressPercentage: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.primary,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: colors.muted,
    borderRadius: 6,
    overflow: "hidden",
    marginBottom: 12,
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 6,
  },
  progressStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressStatsText: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  timelineCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 16,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  timelineLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.foreground,
  },
  timelineValue: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
  },
  statsGrid: {
    flexDirection: "row",
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.foreground,
  },
  statLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    textAlign: "center",
  },
  workoutCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  workoutHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 12,
  },
  workoutDay: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
  },
  workoutDayText: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primaryForeground,
  },
  workoutDaySubtext: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.primaryForeground,
    opacity: 0.8,
  },
  workoutInfo: {
    flex: 1,
  },
  workoutName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  workoutDate: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  workoutStats: {
    flexDirection: "row",
    gap: 20,
  },
  workoutStat: {
    flex: 1,
  },
  workoutStatLabel: {
    fontSize: 12,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  workoutStatValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
});
