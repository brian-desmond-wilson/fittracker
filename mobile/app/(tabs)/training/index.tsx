import React, { useState, useEffect } from "react";
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
import { fetchPublishedPrograms } from "@/src/lib/supabase/training";
import { fetchAllExercises, fetchMovements, fetchWODs, fetchClasses } from "@/src/lib/supabase/crossfit";
import { supabase } from "@/src/lib/supabase";

type WorkoutMode = "crossfit" | "strength";
type CrossFitTab = "classes" | "wods" | "movements";
type StrengthTab = "programs" | "workouts" | "exercises";

export default function Training() {
  const [workoutMode, setWorkoutMode] = useState<WorkoutMode>("crossfit");
  const [crossfitTab, setCrossfitTab] = useState<CrossFitTab>("classes");
  const [strengthTab, setStrengthTab] = useState<StrengthTab>("programs");
  const [searchQuery, setSearchQuery] = useState("");

  // Track counts for each CrossFit tab
  const [classesCount, setClassesCount] = useState(0);
  const [wodsCount, setWodsCount] = useState(0);
  const [movementsCount, setMovementsCount] = useState(0);

  // Track counts for Strength tabs
  const [programsCount, setProgramsCount] = useState(0);
  const [workoutsCount, setWorkoutsCount] = useState(0);
  const [exercisesCount, setExercisesCount] = useState(0);

  // Fetch crossfit tab counts when entering crossfit mode
  useEffect(() => {
    if (workoutMode === "crossfit") {
      // Fetch classes count (requires user id)
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
          fetchClasses(user.id).then(classes => {
            setClassesCount(classes.length);
          }).catch(console.error);
        }
      }).catch(console.error);

      // Fetch WODs count
      fetchWODs().then(wods => {
        setWodsCount(wods.length);
      }).catch(console.error);

      // Fetch movements count
      fetchMovements().then(movements => {
        setMovementsCount(movements.length);
      }).catch(console.error);
    }
  }, [workoutMode]);

  // Fetch strength tab counts when entering strength mode
  useEffect(() => {
    if (workoutMode === "strength") {
      // Fetch programs count
      fetchPublishedPrograms().then(programs => {
        setProgramsCount(programs.length);
      }).catch(console.error);

      // Fetch exercises count
      fetchAllExercises().then(exercises => {
        setExercisesCount(exercises.length);
      }).catch(console.error);

      // Workouts is a placeholder, always 0
      setWorkoutsCount(0);
    }
  }, [workoutMode]);

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
          return <ClassesTab searchQuery={searchQuery} onSearchChange={setSearchQuery} onCountUpdate={setClassesCount} />;
        case "wods":
          return <WODsTab searchQuery={searchQuery} onSearchChange={setSearchQuery} onCountUpdate={setWodsCount} />;
        case "movements":
          return <MovementsTab searchQuery={searchQuery} onSearchChange={setSearchQuery} onCountUpdate={setMovementsCount} />;
        default:
          return null;
      }
    } else {
      switch (strengthTab) {
        case "programs":
          return <ProgramsTab searchQuery={searchQuery} onSearchChange={setSearchQuery} onCountUpdate={setProgramsCount} />;
        case "workouts":
          return <WorkoutsTab onCountUpdate={setWorkoutsCount} />;
        case "exercises":
          return <ExercisesTab searchQuery={searchQuery} onSearchChange={setSearchQuery} onCountUpdate={setExercisesCount} />;
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
          crossfitTabs.map((tab) => {
            const count = tab.key === "classes" ? classesCount : tab.key === "wods" ? wodsCount : movementsCount;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, crossfitTab === tab.key && styles.tabActive]}
                onPress={() => setCrossfitTab(tab.key)}
              >
                <View style={styles.tabContent}>
                  <Text style={[styles.tabText, crossfitTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.countChip, crossfitTab === tab.key && styles.countChipActive]}>
                    <Text style={[styles.countText, crossfitTab === tab.key && styles.countTextActive]}>
                      {count}
                    </Text>
                  </View>
                </View>
                {crossfitTab === tab.key && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            );
          })
        ) : (
          strengthTabs.map((tab) => {
            const count = tab.key === "programs" ? programsCount : tab.key === "workouts" ? workoutsCount : exercisesCount;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, strengthTab === tab.key && styles.tabActive]}
                onPress={() => setStrengthTab(tab.key)}
              >
                <View style={styles.tabContent}>
                  <Text style={[styles.tabText, strengthTab === tab.key && styles.tabTextActive]}>
                    {tab.label}
                  </Text>
                  <View style={[styles.countChip, strengthTab === tab.key && styles.countChipActive]}>
                    <Text style={[styles.countText, strengthTab === tab.key && styles.countTextActive]}>
                      {count}
                    </Text>
                  </View>
                </View>
                {strengthTab === tab.key && <View style={styles.tabIndicator} />}
              </TouchableOpacity>
            );
          })
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
  tabContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  countChip: {
    backgroundColor: colors.muted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  countChipActive: {
    backgroundColor: `${colors.primary}20`,
  },
  countText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  countTextActive: {
    color: colors.primary,
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
