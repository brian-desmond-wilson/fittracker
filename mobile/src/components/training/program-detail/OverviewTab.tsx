import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import type { ProgramTemplateWithRelations } from "@/src/types/training";
import StartProgramModal from "./StartProgramModal";

interface OverviewTabProps {
  program: ProgramTemplateWithRelations;
}

export default function OverviewTab({ program }: OverviewTabProps) {
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);

  const toggleCycle = (cycleId: string) => {
    setExpandedCycle(expandedCycle === cycleId ? null : cycleId);
  };

  return (
    <View style={styles.container}>
      {/* About This Program */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About This Program</Text>
        <Text style={styles.description}>{program.description}</Text>
      </View>

      {/* Program Tags */}
      {program.tags && program.tags.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Program Tags</Text>
          <View style={styles.goalsContainer}>
            {program.tags.map((tag, index) => (
              <View key={index} style={styles.goalPill}>
                <Text style={styles.goalText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Equipment Required */}
      {program.equipment_required && program.equipment_required.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Equipment Required</Text>
          <View style={styles.goalsContainer}>
            {program.equipment_required.map((equipment, index) => (
              <View key={index} style={styles.equipmentPill}>
                <Text style={styles.equipmentText}>{equipment}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Prerequisites */}
      {program.prerequisites && program.prerequisites.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Prerequisites</Text>
          <View style={styles.goalsContainer}>
            {program.prerequisites.map((prereq, index) => (
              <View key={index} style={styles.prereqPill}>
                <Text style={styles.prereqText}>{prereq}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Program Structure */}
      {program.cycles && program.cycles.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Program Structure</Text>
          {program.cycles.map((cycle) => (
            <View key={cycle.id} style={styles.cycleCard}>
              <TouchableOpacity
                style={styles.cycleHeader}
                onPress={() => toggleCycle(cycle.id)}
                activeOpacity={0.7}
              >
                <View style={styles.cycleHeaderLeft}>
                  <Text style={styles.cycleName}>
                    Cycle {cycle.cycle_number}: {cycle.name}
                  </Text>
                  <Text style={styles.cycleWeeks}>{cycle.duration_weeks} weeks</Text>
                </View>
                {expandedCycle === cycle.id ? (
                  <ChevronUp size={20} color={colors.mutedForeground} />
                ) : (
                  <ChevronDown size={20} color={colors.mutedForeground} />
                )}
              </TouchableOpacity>

              {expandedCycle === cycle.id && cycle.description && (
                <View style={styles.cycleContent}>
                  <Text style={styles.cycleDescription}>{cycle.description}</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      {/* Start Program Button */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.startButton}
          activeOpacity={0.8}
          onPress={() => setShowStartModal(true)}
        >
          <Text style={styles.startButtonText}>Start Program</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />

      {/* Start Program Modal */}
      <StartProgramModal
        visible={showStartModal}
        onClose={() => setShowStartModal(false)}
        program={{
          id: program.id,
          title: program.title,
          durationWeeks: program.duration_weeks,
          daysPerWeek: program.days_per_week,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    padding: 20,
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
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.mutedForeground,
  },
  goalsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  goalPill: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  goalText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.primary,
  },
  equipmentPill: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(59, 130, 246, 0.3)",
  },
  equipmentText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#3B82F6",
  },
  prereqPill: {
    backgroundColor: "rgba(245, 158, 11, 0.15)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(245, 158, 11, 0.3)",
  },
  prereqText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F59E0B",
  },
  cycleCard: {
    backgroundColor: colors.secondary,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  cycleHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  cycleHeaderLeft: {
    flex: 1,
  },
  cycleName: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  cycleWeeks: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  cycleContent: {
    padding: 16,
    paddingTop: 0,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cycleDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedForeground,
  },
  buttonContainer: {
    marginTop: 8,
  },
  startButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  startButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.primaryForeground,
  },
});
