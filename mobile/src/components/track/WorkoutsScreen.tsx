import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Dumbbell, Clock } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface WorkoutsScreenProps {
  onClose: () => void;
}

export function WorkoutsScreen({ onClose }: WorkoutsScreenProps) {
  const insets = useSafeAreaInsets();

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
            <Dumbbell size={32} color="#EF4444" strokeWidth={2} />
            <Text style={styles.pageTitle}>Workouts</Text>
          </View>

          {/* Coming Soon Card */}
          <View style={styles.comingSoonCard}>
            <View style={styles.iconContainer}>
              <Clock size={48} color="#EF4444" strokeWidth={1.5} />
            </View>
            <Text style={styles.comingSoonTitle}>Coming Soon</Text>
            <Text style={styles.comingSoonText}>
              Workout tracking is currently under development.
            </Text>
            <Text style={styles.comingSoonDescription}>
              This feature will allow you to log and track your workouts, including exercises, sets,
              reps, and weights for bodybuilding, CrossFit, cardio, and custom routines.
            </Text>
          </View>

          {/* Feature List */}
          <View style={styles.featureSection}>
            <Text style={styles.featureTitle}>Planned Features</Text>
            <View style={styles.featureList}>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>Multiple workout types (bodybuilding, CrossFit, cardio)</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>Exercise library with custom exercises</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>Track sets, reps, and weights</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>Workout duration and time tracking</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>Integration with calendar schedule</Text>
              </View>
              <View style={styles.featureItem}>
                <View style={styles.featureBullet} />
                <Text style={styles.featureText}>Progress tracking and workout history</Text>
              </View>
            </View>
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
    paddingBottom: 24,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },
  comingSoonCard: {
    marginHorizontal: 20,
    marginBottom: 32,
    padding: 32,
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.3)",
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: "rgba(239, 68, 68, 0.15)",
    borderRadius: 50,
  },
  comingSoonTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#EF4444",
    marginBottom: 12,
  },
  comingSoonText: {
    fontSize: 16,
    color: colors.foreground,
    textAlign: "center",
    marginBottom: 16,
  },
  comingSoonDescription: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    lineHeight: 20,
  },
  featureSection: {
    paddingHorizontal: 20,
  },
  featureTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  featureList: {
    gap: 12,
  },
  featureItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  featureBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#EF4444",
    marginTop: 7,
  },
  featureText: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
    lineHeight: 22,
  },
});
