import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Image, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Dumbbell, Search, X } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import ProgramsTab from "@/src/components/training/ProgramsTab";
import WorkoutsTab from "@/src/components/training/WorkoutsTab";
import ExercisesTab from "@/src/components/training/ExercisesTab";
import ClassesTab from "@/src/components/training/crossfit/ClassesTab";
import WODsTab from "@/src/components/training/crossfit/WODsTab";
import MovementsTab from "@/src/components/training/crossfit/MovementsTab";

type WorkoutMode = "crossfit" | "strength";
type CrossFitTab = "classes" | "wods" | "movements";
type StrengthTab = "programs" | "workouts" | "exercises";

export default function Training() {
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>("crossfit");
  const [crossfitTab, setCrossfitTab] = useState<CrossFitTab>("classes");
  const [strengthTab, setStrengthTab] = useState<StrengthTab>("programs");
  const [searchQuery, setSearchQuery] = useState("");

  const crossfitTabs: { key: CrossFitTab; label: string }[] = [
    { key: "classes", label: "Classes" },
    { key: "wods", label: "WODs" },
    { key: "movements", label: "Movements" },
  ];

  const strengthTabs: { key: StrengthTab; label: string }[] = [
    { key: "programs", label: "Programs" },
    { key: "workouts", label: "Workouts" },
    { key: "exercises", label: "Exercises" },
  ];

  const handleCrossFitPress = () => {
    setWorkoutMode("crossfit");
  };

  const handleStrengthPress = () => {
    setWorkoutMode("strength");
  };

  const renderTabContent = () => {
    if (workoutMode === "crossfit") {
      switch (crossfitTab) {
        case "classes":
          return <ClassesTab searchQuery={searchQuery} onSearchChange={setSearchQuery} />;
        case "wods":
          return <WODsTab searchQuery={searchQuery} onSearchChange={setSearchQuery} />;
        case "movements":
          return <MovementsTab searchQuery={searchQuery} onSearchChange={setSearchQuery} />;
        default:
          return null;
      }
    } else {
      switch (strengthTab) {
        case "programs":
          return <ProgramsTab searchQuery={searchQuery} onSearchChange={setSearchQuery} />;
        case "workouts":
          return <WorkoutsTab />;
        case "exercises":
          return <ExercisesTab />;
        default:
          return null;
      }
    }
  };

  const getSearchPlaceholder = () => {
    if (workoutMode === "crossfit") {
      switch (crossfitTab) {
        case "classes":
          return "Search classes...";
        case "wods":
          return "Search WODs...";
        case "movements":
          return "Search movements...";
        default:
          return "Search...";
      }
    } else {
      switch (strengthTab) {
        case "programs":
          return "Search programs...";
        case "workouts":
          return "Search workouts...";
        case "exercises":
          return "Search exercises...";
        default:
          return "Search...";
      }
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      {/* Header with Search */}
      <View style={styles.header}>
        <View style={styles.searchContainer}>
          <Search size={20} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder={getSearchPlaceholder()}
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery("")} activeOpacity={0.7}>
              <X size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={handleCrossFitPress} activeOpacity={0.7} style={styles.iconButton}>
            <Image
              source={require('@/assets/kettlebell.png')}
              style={styles.kettlebellIcon}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleStrengthPress} activeOpacity={0.7} style={styles.iconButton}>
            <Dumbbell size={24} color={colors.primary} strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Bar */}
      <View style={styles.tabBar}>
        {workoutMode === "crossfit" ? (
          crossfitTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, crossfitTab === tab.key && styles.tabActive]}
              onPress={() => setCrossfitTab(tab.key)}
            >
              <Text style={[styles.tabText, crossfitTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {crossfitTab === tab.key && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))
        ) : (
          strengthTabs.map((tab) => (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, strengthTab === tab.key && styles.tabActive]}
              onPress={() => setStrengthTab(tab.key)}
            >
              <Text style={[styles.tabText, strengthTab === tab.key && styles.tabTextActive]}>
                {tab.label}
              </Text>
              {strengthTab === tab.key && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          ))
        )}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    width: "100%",
  },
  searchContainer: {
    flexShrink: 1,
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.input,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    minWidth: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 12,
    flexShrink: 0,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  kettlebellIcon: {
    width: 24,
    height: 24,
    tintColor: colors.primary,
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
