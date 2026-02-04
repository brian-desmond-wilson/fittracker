import React from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, StatusBar, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Dumbbell } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

interface WorkoutsScreenProps {
  onClose: () => void;
}

type WorkoutType = "crossfit" | "strength" | null;

export function WorkoutsScreen({ onClose }: WorkoutsScreenProps) {
  const insets = useSafeAreaInsets();
  const [selectedType, setSelectedType] = React.useState<WorkoutType>("crossfit");

  const handleCrossFitPress = () => {
    setSelectedType("crossfit");
  };

  const handleStrengthPress = () => {
    setSelectedType("strength");
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
          {/* Title with Workout Type Buttons */}
          <View style={styles.titleContainer}>
            <View style={styles.titleLeft}>
              <Dumbbell size={32} color="#EF4444" strokeWidth={2} />
              <Text style={styles.pageTitle}>Workouts</Text>
            </View>
            <View style={styles.workoutTypeButtons}>
              <TouchableOpacity style={styles.workoutTypeButton} onPress={handleCrossFitPress} activeOpacity={0.7}>
                <Image
                  source={require('@/assets/kettlebell.png')}
                  style={styles.kettlebellIcon}
                  resizeMode="contain"
                />
                <Text style={styles.workoutTypeLabel}>CrossFit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.workoutTypeButton} onPress={handleStrengthPress} activeOpacity={0.7}>
                <Dumbbell size={24} color="#EF4444" strokeWidth={2} />
                <Text style={styles.workoutTypeLabel}>Strength</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Conditional Content based on selected workout type */}
          {selectedType === "crossfit" && (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderTitle}>CrossFit Workouts</Text>
              <Text style={styles.placeholderText}>
                CrossFit workout tracking will be available here.
              </Text>
              <Text style={styles.placeholderText}>
                Track WODs, benchmark workouts, AMRAP, EMOM, and more.
              </Text>
            </View>
          )}

          {selectedType === "strength" && (
            <View style={styles.placeholderContainer}>
              <Text style={styles.placeholderTitle}>Strength Training</Text>
              <Text style={styles.placeholderText}>
                Strength training workout tracking will be available here.
              </Text>
              <Text style={styles.placeholderText}>
                Track exercises, sets, reps, weight, and progressive overload.
              </Text>
            </View>
          )}

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
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
  },
  titleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },
  workoutTypeButtons: {
    flexDirection: "row",
    gap: 16,
  },
  workoutTypeButton: {
    alignItems: "center",
    gap: 4,
  },
  kettlebellIcon: {
    width: 24,
    height: 24,
    tintColor: "#EF4444",
  },
  workoutTypeLabel: {
    fontSize: 12,
    color: colors.foreground,
    fontWeight: "500",
  },
  placeholderContainer: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 24,
    backgroundColor: "rgba(239, 68, 68, 0.05)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  placeholderTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.foreground,
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 15,
    color: colors.mutedForeground,
    lineHeight: 22,
    marginBottom: 8,
  },
});
