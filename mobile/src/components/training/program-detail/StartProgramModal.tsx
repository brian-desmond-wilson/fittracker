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
} from "react-native";
import { X, Calendar, Clock, CheckCircle } from "lucide-react-native";
import { colors } from "@/src/lib/colors";

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
  const [instanceName, setInstanceName] = useState("");
  const [startDate, setStartDate] = useState(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });

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

  const handleStartProgram = () => {
    if (!instanceName.trim()) {
      Alert.alert("Required", "Please give this program run a name.");
      return;
    }

    // TODO: Create program instance in database
    // - Create program_instances record
    // - Schedule all workout_instances
    // - Navigate to program instance detail page

    Alert.alert(
      "Program Started!",
      `${instanceName} has been added to your training schedule. Your first workout is ready.`,
      [
        {
          text: "OK",
          onPress: () => {
            onClose();
            setInstanceName("");
          },
        },
      ]
    );
  };

  const expectedEndDate = calculateEndDate(startDate, program.durationWeeks);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Start Program</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.foreground} />
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
            />
          </View>

          {/* Start Date Input */}
          <View style={styles.section}>
            <Text style={styles.label}>Start Date</Text>
            <Text style={styles.helperText}>When do you want to begin this program?</Text>
            <View style={styles.dateInputContainer}>
              <Calendar size={18} color={colors.primary} />
              <TextInput
                style={styles.dateInput}
                value={formatDate(startDate)}
                editable={false}
                placeholderTextColor={colors.mutedForeground}
              />
            </View>
            <Text style={styles.dateNote}>Starting today: {formatDate(startDate)}</Text>
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
            style={[styles.startButton, !instanceName.trim() && styles.startButtonDisabled]}
            onPress={handleStartProgram}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>Start Program</Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
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
  dateInput: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  dateNote: {
    fontSize: 13,
    color: colors.mutedForeground,
    marginTop: 8,
    fontStyle: "italic",
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
});
