import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { X, Calendar, Clock, CheckCircle } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { colors } from "@/src/lib/colors";
import { supabase } from "@/src/lib/supabase";
import {
  createProgramInstance,
  createWorkoutInstances,
  calculateTotalWorkouts,
} from "@/src/lib/supabase/training";
import type { CreateWorkoutInstanceInput } from "@/src/types/training";

interface StartProgramModalProps {
  visible: boolean;
  onClose: () => void;
  program: {
    id: string;
    title: string;
    durationWeeks: number;
    daysPerWeek: number;
  };
}

export default function StartProgramModal({ visible, onClose, program }: StartProgramModalProps) {
  const router = useRouter();
  const [instanceName, setInstanceName] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const calculateEndDate = (start: string, weeks: number) => {
    const startDate = new Date(start);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + weeks * 7);
    return endDate.toISOString().split("T")[0];
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  };

  /**
   * Calculate the scheduled date for a workout based on start date, week, and day.
   * Formula: startDate + ((weekNumber - 1) * 7) + (dayNumber - 1) days
   */
  const getScheduledDate = (start: string, weekNumber: number, dayNumber: number): string => {
    const date = new Date(start);
    date.setDate(date.getDate() + (weekNumber - 1) * 7 + (dayNumber - 1));
    return date.toISOString().split("T")[0];
  };

  const handleStartProgram = async () => {
    if (!instanceName.trim()) {
      Alert.alert("Required", "Please give this program run a name.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("You must be logged in to start a program.");
      }

      // 2. Calculate program parameters
      const expectedEndDate = calculateEndDate(startDate, program.durationWeeks);
      const totalWorkouts = calculateTotalWorkouts(program.daysPerWeek, program.durationWeeks);

      // 3. Create the program instance
      const instance = await createProgramInstance(
        {
          program_id: program.id,
          instance_name: instanceName.trim(),
          start_date: startDate,
          expected_end_date: expectedEndDate,
          total_workouts: totalWorkouts,
        },
        user.id
      );

      // 4. Fetch all program workouts for this program
      const { data: programWorkouts, error: workoutsError } = await supabase
        .from("program_workouts")
        .select("id, week_number, day_number")
        .eq("program_id", program.id)
        .order("week_number")
        .order("day_number");

      if (workoutsError) {
        throw new Error("Failed to fetch program workouts. Please try again.");
      }

      // 5. Schedule all workout instances
      if (programWorkouts && programWorkouts.length > 0) {
        const workoutInstances: CreateWorkoutInstanceInput[] = programWorkouts.map((pw) => ({
          program_instance_id: instance.id,
          program_workout_id: pw.id,
          user_id: user.id,
          scheduled_date: getScheduledDate(startDate, pw.week_number, pw.day_number),
          week_number: pw.week_number,
          day_number: pw.day_number,
        }));

        await createWorkoutInstances(workoutInstances);
      }

      // 6. Success! Close modal and navigate to instance detail
      onClose();
      setInstanceName("");
      setError(null);

      // Small delay to allow modal close animation before navigation
      setTimeout(() => {
        router.push(`/program-instance/${instance.id}`);
      }, 300);
    } catch (err: any) {
      console.error("Error starting program:", err);
      const message = err?.message || "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setError(null);
      onClose();
    }
  };

  const handleDateChange = (_event: any, selectedDate?: Date) => {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }
    if (selectedDate) {
      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, "0");
      const day = String(selectedDate.getDate()).padStart(2, "0");
      setStartDate(`${year}-${month}-${day}`);
    }
  };

  const expectedEndDate = calculateEndDate(startDate, program.durationWeeks);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Start Program</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton} disabled={isLoading}>
            <X size={24} color={isLoading ? colors.mutedForeground : colors.foreground} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Program Info */}
          <View style={styles.programInfo}>
            <Text style={styles.programTitle}>{program.title}</Text>
            <View style={styles.programStats}>
              <View style={styles.programStat}>
                <Clock size={16} color={colors.mutedForeground} />
                <Text style={styles.programStatText}>
                  {program.durationWeeks} weeks • {program.daysPerWeek} days/week
                </Text>
              </View>
            </View>
          </View>

          {/* Error Banner */}
          {error && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError(null)}>
                <X size={16} color="#EF4444" />
              </TouchableOpacity>
            </View>
          )}

          {/* Instance Name Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Name This Program Run</Text>
            <Text style={styles.helperText}>
              Give this run a memorable name to track your progress over time.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Summer Build 2024"
              placeholderTextColor={colors.mutedForeground}
              value={instanceName}
              onChangeText={setInstanceName}
              autoCapitalize="words"
              editable={!isLoading}
            />
          </View>

          {/* Start Date Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Start Date</Text>
            <Text style={styles.helperText}>When do you want to begin this program?</Text>
            <TouchableOpacity
              style={styles.dateInputContainer}
              onPress={() => setShowDatePicker(true)}
              activeOpacity={0.7}
              disabled={isLoading}
            >
              <Calendar size={18} color={colors.primary} />
              <Text style={styles.dateInputText}>{formatDate(startDate)}</Text>
            </TouchableOpacity>
          </View>

          {/* Timeline Preview */}
          <View style={styles.timelineSection}>
            <Text style={styles.label}>Program Timeline</Text>
            <View style={styles.timelineCard}>
              <View style={styles.timelineRow}>
                <View style={styles.timelineDot} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>Start Date</Text>
                  <Text style={styles.timelineDate}>{formatDate(startDate)}</Text>
                </View>
              </View>
              <View style={styles.timelineLine} />
              <View style={styles.timelineRow}>
                <View style={[styles.timelineDot, styles.timelineDotSecondary]} />
                <View style={styles.timelineContent}>
                  <Text style={styles.timelineLabel}>Expected Completion</Text>
                  <Text style={styles.timelineDate}>{formatDate(expectedEndDate)}</Text>
                  <Text style={styles.timelineNote}>
                    {program.durationWeeks} weeks from start
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* Info Callout */}
          <View style={styles.infoCallout}>
            <CheckCircle size={20} color={colors.primary} />
            <View style={styles.infoCalloutContent}>
              <Text style={styles.infoCalloutTitle}>What happens next?</Text>
              <Text style={styles.infoCalloutText}>
                Your workouts will be scheduled automatically. You can track your progress and view
                workout history at any time.
              </Text>
            </View>
          </View>

          {/* Start Button */}
          <TouchableOpacity
            style={[
              styles.startButton,
              (!instanceName.trim() || isLoading) && styles.startButtonDisabled,
            ]}
            onPress={handleStartProgram}
            activeOpacity={0.8}
            disabled={!instanceName.trim() || isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.primaryForeground} />
                <Text style={styles.startButtonText}>Creating Program...</Text>
              </View>
            ) : (
              <Text style={styles.startButtonText}>Start Program</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>

        {/* iOS Date Picker Modal */}
        {showDatePicker && Platform.OS === "ios" && (
          <Modal transparent visible={showDatePicker} animationType="fade">
            <TouchableOpacity
              style={styles.datePickerOverlay}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            >
              <View style={styles.datePickerContent}>
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>Select Start Date</Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={new Date(startDate + "T12:00:00")}
                  mode="date"
                  display="spinner"
                  textColor="#FFFFFF"
                  onChange={handleDateChange}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Android Date Picker */}
        {showDatePicker && Platform.OS === "android" && (
          <DateTimePicker
            value={new Date(startDate + "T12:00:00")}
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.foreground,
  },
  closeButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  programInfo: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 16,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: colors.border,
  },
  programTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.foreground,
    marginBottom: 12,
  },
  programStats: {
    flexDirection: "row",
    gap: 16,
  },
  programStat: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  programStatText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "rgba(239, 68, 68, 0.2)",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    color: "#EF4444",
    lineHeight: 20,
    marginRight: 12,
  },
  section: {
    marginBottom: 28,
  },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  helperText: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 12,
    lineHeight: 20,
  },
  input: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.foreground,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  dateInputText: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  datePickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
  },
  datePickerContent: {
    backgroundColor: colors.secondary,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primary,
  },
  timelineSection: {
    marginBottom: 28,
  },
  timelineCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginTop: 4,
  },
  timelineDotSecondary: {
    backgroundColor: colors.mutedForeground,
  },
  timelineContent: {
    flex: 1,
  },
  timelineLabel: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginBottom: 4,
  },
  timelineDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  timelineNote: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  timelineLine: {
    width: 2,
    height: 24,
    backgroundColor: colors.border,
    marginLeft: 5,
    marginVertical: 8,
  },
  infoCallout: {
    flexDirection: "row",
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderRadius: 12,
    padding: 16,
    gap: 12,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.2)",
  },
  infoCalloutContent: {
    flex: 1,
  },
  infoCalloutTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 6,
  },
  infoCalloutText: {
    fontSize: 14,
    color: colors.mutedForeground,
    lineHeight: 20,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.primaryForeground,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});
