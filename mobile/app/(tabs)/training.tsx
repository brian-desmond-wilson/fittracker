import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/src/lib/colors";
import ProgramsTab from "@/src/components/training/ProgramsTab";
import WorkoutsTab from "@/src/components/training/WorkoutsTab";
import ExercisesTab from "@/src/components/training/ExercisesTab";

type Tab = "programs" | "workouts" | "exercises";

export default function Training() {
  const [activeTab, setActiveTab] = useState<Tab>("programs");

  const tabs: { key: Tab; label: string }[] = [
    { key: "programs", label: "Programs" },
    { key: "workouts", label: "Workouts" },
    { key: "exercises", label: "Exercises" },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "programs":
        return <ProgramsTab />;
      case "workouts":
        return <WorkoutsTab />;
      case "exercises":
        return <ExercisesTab />;
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Training</Text>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>
              {tab.label}
            </Text>
            {activeTab === tab.key && <View style={styles.tabIndicator} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      {renderTabContent()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: colors.foreground,
  },
  tabBar: {
    flexDirection: "row",
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    position: "relative",
  },
  tabActive: {
    // Active tab styling handled by indicator
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    color: colors.mutedForeground,
  },
  tabTextActive: {
    color: colors.primary,
    fontWeight: "600",
  },
  tabIndicator: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.primary,
  },
});
