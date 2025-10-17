import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { Calendar, CheckCircle2, TrendingUp } from "lucide-react-native";
import { useRouter } from "expo-router";
import { colors } from "@/src/lib/colors";

interface HistoryTabProps {
  programId: string;
}

// Mock program instance data
const MOCK_INSTANCES = [
  {
    id: "1",
    name: "Summer Build 2024",
    startDate: "2024-06-01",
    endDate: "2024-09-08",
    status: "completed",
    completionPercentage: 100,
    workoutsCompleted: 84,
    totalWorkouts: 84,
  },
  {
    id: "2",
    name: "Project Mass - Take 1",
    startDate: "2024-01-15",
    endDate: "2024-03-22",
    status: "incomplete",
    completionPercentage: 65,
    workoutsCompleted: 55,
    totalWorkouts: 84,
  },
];

export default function HistoryTab({ programId }: HistoryTabProps) {
  const router = useRouter();

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
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
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {MOCK_INSTANCES.length === 0 ? (
        <View style={styles.emptyState}>
          <Calendar size={48} color={colors.mutedForeground} />
          <Text style={styles.emptyStateTitle}>No Program History</Text>
          <Text style={styles.emptyStateText}>
            You haven't started this program yet. Tap "Start Program" in the Overview tab to begin
            your first cycle.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.sectionTitle}>Program History</Text>
            <Text style={styles.sectionSubtitle}>
              {MOCK_INSTANCES.length} {MOCK_INSTANCES.length === 1 ? "attempt" : "attempts"}
            </Text>
          </View>

          {MOCK_INSTANCES.map((instance) => (
            <TouchableOpacity
              key={instance.id}
              style={styles.instanceCard}
              activeOpacity={0.7}
              onPress={() => router.push(`/program-instance/${instance.id}`)}
            >
              {/* Header Row */}
              <View style={styles.instanceHeader}>
                <Text style={styles.instanceName}>{instance.name}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: `${getStatusColor(instance.status)}20` },
                  ]}
                >
                  <Text style={[styles.statusText, { color: getStatusColor(instance.status) }]}>
                    {getStatusLabel(instance.status)}
                  </Text>
                </View>
              </View>

              {/* Date Range */}
              <View style={styles.dateRow}>
                <Calendar size={14} color={colors.mutedForeground} />
                <Text style={styles.dateText}>
                  {formatDate(instance.startDate)} - {formatDate(instance.endDate)}
                </Text>
              </View>

              {/* Progress Bar */}
              <View style={styles.progressSection}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressLabel}>Progress</Text>
                  <Text style={styles.progressPercentage}>{instance.completionPercentage}%</Text>
                </View>
                <View style={styles.progressBarBackground}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${instance.completionPercentage}%`,
                        backgroundColor: getStatusColor(instance.status),
                      },
                    ]}
                  />
                </View>
              </View>

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <CheckCircle2 size={16} color={colors.primary} />
                  <Text style={styles.statText}>
                    {instance.workoutsCompleted}/{instance.totalWorkouts} workouts
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <TrendingUp size={16} color={colors.primary} />
                  <Text style={styles.statText}>
                    {Math.round((instance.workoutsCompleted / instance.totalWorkouts) * 14)} weeks
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: 20,
  },
  header: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  instanceCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  instanceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  instanceName: {
    flex: 1,
    fontSize: 17,
    fontWeight: "600",
    color: colors.foreground,
    marginRight: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 16,
  },
  dateText: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  progressSection: {
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.foreground,
  },
  progressPercentage: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.primary,
  },
  progressBarBackground: {
    height: 8,
    backgroundColor: colors.muted,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: "row",
    gap: 20,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  emptyState: {
    paddingVertical: 80,
    alignItems: "center",
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingHorizontal: 40,
    lineHeight: 20,
  },
});
