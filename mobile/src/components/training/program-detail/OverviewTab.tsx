import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import StartProgramModal from "./StartProgramModal";

interface Cycle {
  id: string;
  name: string;
  weeks: number;
  description: string;
}

interface Program {
  id: string;
  title: string;
  durationWeeks: number;
  daysPerWeek: number;
  description: string;
  goals: string[];
  cycles: Cycle[];
}

interface OverviewTabProps {
  program: Program;
}

export default function OverviewTab({ program }: OverviewTabProps) {
  const [expandedCycle, setExpandedCycle] = useState<string | null>(null);
  const [showStartModal, setShowStartModal] = useState(false);

  const toggleCycle = (cycleId: string) => {
    setExpandedCycle(expandedCycle === cycleId ? null : cycleId);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* About This Program */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About This Program</Text>
        <Text style={styles.description}>{program.description}</Text>
      </View>

      {/* Program Goals */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Program Goals</Text>
        <View style={styles.goalsContainer}>
          {program.goals.map((goal, index) => (
            <View key={index} style={styles.goalPill}>
              <Text style={styles.goalText}>{goal}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Program Structure */}
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
                  Cycle {cycle.id}: {cycle.name}
                </Text>
                <Text style={styles.cycleWeeks}>{cycle.weeks} weeks</Text>
              </View>
              {expandedCycle === cycle.id ? (
                <ChevronUp size={20} color={colors.mutedForeground} />
              ) : (
                <ChevronDown size={20} color={colors.mutedForeground} />
              )}
            </TouchableOpacity>

            {expandedCycle === cycle.id && (
              <View style={styles.cycleContent}>
                <Text style={styles.cycleDescription}>{cycle.description}</Text>
              </View>
            )}
          </View>
        ))}
      </View>

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
          durationWeeks: program.durationWeeks,
          daysPerWeek: program.daysPerWeek,
        }}
      />
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
