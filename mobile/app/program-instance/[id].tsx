import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
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
  AlertCircle,
} from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { fetchProgramInstanceById } from "@/src/lib/supabase/training";
import type { ProgramInstanceWithRelations, WorkoutInstance } from "@/src/types/training";

export default function ProgramInstanceDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const instanceId = params.id as string;

  const [instance, setInstance] = useState<ProgramInstanceWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInstance();
  }, [instanceId]);

  async function loadInstance() {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchProgramInstanceById(instanceId);
      setInstance(data);
    } catch (err) {
      console.error('Error loading program instance:', err);
      setError('Failed to load program details');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadInstance();
  }

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "—";
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
      case "paused":
        return "#F59E0B";
      case "abandoned":
        return "#EF4444";
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
      case "paused":
        return "Paused";
      case "abandoned":
        return "Abandoned";
      default:
        return status;
    }
  };

  // Calculate stats from workout instances
  const calculateStats = () => {
    if (!instance) return { totalVolume: 0, consistency: 0, completedWorkouts: 0 };
    
    const workoutInstances = instance.workout_instances || [];
    const completedWorkouts = workoutInstances.filter(w => w.status === 'completed').length;
    
    // Calculate total volume from exercise instances and set instances
    let totalVolume = 0;
    workoutInstances.forEach(workout => {
      const exerciseInstances = (workout as any).exercise_instances || [];
      exerciseInstances.forEach((exercise: any) => {
        const setInstances = exercise.set_instances || [];
        setInstances.forEach((set: any) => {
          if (set.weight && set.reps) {
            totalVolume += set.weight * set.reps;
          }
        });
      });
    });

    // Calculate consistency (completed / scheduled up to now)
    const scheduledWorkouts = workoutInstances.filter(w => {
      const scheduledDate = new Date(w.scheduled_date);
      return scheduledDate <= new Date();
    }).length;
    const consistency = scheduledWorkouts > 0 
      ? Math.round((completedWorkouts / scheduledWorkouts) * 100) 
      : 0;

    return { totalVolume, consistency, completedWorkouts };
  };

  // Get sorted workout history (most recent first)
  const getWorkoutHistory = () => {
    if (!instance?.workout_instances) return [];
    
    return [...instance.workout_instances]
      .filter(w => w.status === 'completed' && w.performed_date)
      .sort((a, b) => {
        const dateA = new Date(a.performed_date || a.scheduled_date);
        const dateB = new Date(b.performed_date || b.scheduled_date);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 10); // Show last 10 workouts
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading program...</Text>
      </View>
    );
  }

  if (error || !instance) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={[styles.centered, { flex: 1 }]}>
          <AlertCircle size={48} color={colors.destructive} />
          <Text style={styles.errorText}>{error || "Program not found"}</Text>
          <TouchableOpacity onPress={loadInstance} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const stats = calculateStats();
  const workoutHistory = getWorkoutHistory();
  const completionPercentage = instance.total_workouts > 0
    ? Math.round((instance.workouts_completed / instance.total_workouts) * 100)
    : 0;

  // Calculate current week based on workouts completed (6 days per week)
  const currentWeek = Math.ceil((instance.workouts_completed + 1) / 6) || 1;
  const totalWeeks = Math.ceil(instance.total_workouts / 6) || 14;

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
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          {/* Program Title Section */}
          <View style={styles.titleSection}>
            <Text style={styles.instanceName}>{instance.instance_name}</Text>
            <Text style={styles.programTitle}>{instance.program?.name || "Project Mass"}</Text>
            <Text style={styles.programCreator}>
              by {instance.program?.created_by_name || "Dr. Jacob Wilson"}
            </Text>
          </View>

          {/* Status Badge */}
          <View style={styles.statusSection}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: `${getStatusColor(instance.status)}20` },
              ]}
            >
              <Text
                style={[styles.statusText, { color: getStatusColor(instance.status) }]}
              >
                {getStatusLabel(instance.status)}
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
                  {completionPercentage}%
                </Text>
              </View>
              <View style={styles.progressBarBackground}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${completionPercentage}%`,
                      backgroundColor: getStatusColor(instance.status),
                    },
                  ]}
                />
              </View>
              <View style={styles.progressStats}>
                <Text style={styles.progressStatsText}>
                  Week {currentWeek} of {totalWeeks}
                </Text>
                <Text style={styles.progressStatsText}>
                  {instance.workouts_completed}/{instance.total_workouts} workouts
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
                <Text style={styles.timelineValue}>{formatDate(instance.start_date)}</Text>
              </View>
              <View style={styles.timelineRow}>
                <Target size={18} color={colors.primary} />
                <Text style={styles.timelineLabel}>Expected End</Text>
                <Text style={styles.timelineValue}>
                  {formatDate(instance.expected_end_date)}
                </Text>
              </View>
              {instance.end_date && (
                <View style={styles.timelineRow}>
                  <CheckCircle2 size={18} color="#22C55E" />
                  <Text style={styles.timelineLabel}>Completed</Text>
                  <Text style={styles.timelineValue}>
                    {formatDate(instance.end_date)}
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
                <Text style={styles.statValue}>{formatVolume(stats.totalVolume)}</Text>
                <Text style={styles.statLabel}>Total Volume</Text>
              </View>
              <View style={styles.statCard}>
                <TrendingUp size={24} color={colors.primary} />
                <Text style={styles.statValue}>{stats.consistency}%</Text>
                <Text style={styles.statLabel}>Consistency</Text>
              </View>
              <View style={styles.statCard}>
                <CheckCircle2 size={24} color={colors.primary} />
                <Text style={styles.statValue}>{instance.workouts_completed}</Text>
                <Text style={styles.statLabel}>Workouts Done</Text>
              </View>
            </View>
          </View>

          {/* Workout History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Workout History</Text>
            {workoutHistory.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No completed workouts yet</Text>
              </View>
            ) : (
              workoutHistory.map((workout) => {
                const programWorkout = workout.program_workout;
                const weekNumber = programWorkout?.week_number || Math.ceil(workout.day_number / 6);
                const workoutName = programWorkout?.name || `Day ${workout.day_number}`;
                
                return (
                  <TouchableOpacity 
                    key={workout.id} 
                    style={styles.workoutCard} 
                    activeOpacity={0.7}
                    onPress={() => {
                      // Navigate to workout detail if needed
                    }}
                  >
                    <View style={styles.workoutHeader}>
                      <View style={styles.workoutDay}>
                        <Text style={styles.workoutDayText}>W{weekNumber}</Text>
                        <Text style={styles.workoutDaySubtext}>D{workout.day_number}</Text>
                      </View>
                      <View style={styles.workoutInfo}>
                        <Text style={styles.workoutName}>{workoutName}</Text>
                        <Text style={styles.workoutDate}>
                          {formatDate(workout.performed_date || workout.scheduled_date)}
                        </Text>
                      </View>
                    </View>
                    {workout.notes && (
                      <Text style={styles.workoutNotes} numberOfLines={2}>
                        {workout.notes}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
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
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  errorText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.destructive,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  retryText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primaryForeground,
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
  emptyCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontSize: 15,
    color: colors.mutedForeground,
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
  workoutNotes: {
    marginTop: 12,
    fontSize: 14,
    color: colors.mutedForeground,
    fontStyle: "italic",
  },
});
