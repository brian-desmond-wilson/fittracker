import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Calendar, Clock, BarChart3, TrendingUp, User } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import OverviewTab from "@/src/components/training/program-detail/OverviewTab";
import ScheduleTab from "@/src/components/training/program-detail/ScheduleTab";
import MediaTab from "@/src/components/training/program-detail/MediaTab";
import HistoryTab from "@/src/components/training/program-detail/HistoryTab";

type Tab = "overview" | "schedule" | "media" | "history";

// Mock program data (will be replaced with actual data from database)
const MOCK_PROGRAM = {
  id: "1",
  title: "Project Mass",
  creator: "Dr. Jacob Wilson",
  durationWeeks: 14,
  daysPerWeek: 6,
  minutesPerSession: 75,
  primaryGoal: "Hybrid",
  difficultyLevel: "Intermediate",
  coverImageUrl: "https://via.placeholder.com/400x250/1a1a1a/ffffff?text=PROJECT+MASS",
  description:
    "14-week advanced DUP program combining heavy strength work with high-volume hypertrophy training",
  goals: ["Hybrid", "Progressive Overload", "Form Focus"],
  cycles: [
    {
      id: "1",
      name: "Foundation",
      weeks: 4,
      description: "Build base strength with progressive overload",
    },
    {
      id: "2",
      name: "Accumulation",
      weeks: 5,
      description: "High-volume hypertrophy phase",
    },
    {
      id: "3",
      name: "Intensification",
      weeks: 3,
      description: "Increased intensity with lower volume",
    },
    {
      id: "4",
      name: "Realization",
      weeks: 2,
      description: "Peak strength and test maxes",
    },
  ],
};

export default function ProgramDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  const programId = params.id as string;

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "schedule", label: "Schedule" },
    { key: "media", label: "Media" },
    { key: "history", label: "History" },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab program={MOCK_PROGRAM} />;
      case "schedule":
        return <ScheduleTab programId={programId} />;
      case "media":
        return <MediaTab programId={programId} />;
      case "history":
        return <HistoryTab programId={programId} />;
      default:
        return null;
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Cover Image Banner */}
        <View style={styles.bannerContainer}>
          <Image source={{ uri: MOCK_PROGRAM.coverImageUrl }} style={styles.bannerImage} />

          {/* Back Button Overlay */}
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Training</Text>
          </TouchableOpacity>

          {/* Gradient Overlay */}
          <View style={styles.bannerGradient} />

          {/* Program Title Overlay */}
          <View style={styles.bannerContent}>
            <Text style={styles.bannerTitle}>{MOCK_PROGRAM.title}</Text>
            <View style={styles.bannerCreator}>
              <User size={14} color="#FFFFFF" />
              <Text style={styles.bannerCreatorText}>by {MOCK_PROGRAM.creator}</Text>
            </View>
          </View>
        </View>

        {/* Program Stats Row */}
        <View style={styles.statsContainer}>
          <View style={styles.statBox}>
            <Calendar size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.statValue}>{MOCK_PROGRAM.durationWeeks} weeks</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <Clock size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.statValue}>{MOCK_PROGRAM.minutesPerSession} min</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <BarChart3 size={18} color={colors.primary} strokeWidth={2} />
            <Text style={styles.statValue}>{MOCK_PROGRAM.daysPerWeek} days/wk</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statBox}>
            <TrendingUp size={18} color="#F59E0B" strokeWidth={2} />
            <Text style={styles.statValue}>{MOCK_PROGRAM.difficultyLevel}</Text>
          </View>
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
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  bannerContainer: {
    position: "relative",
    width: "100%",
    height: 250,
  },
  bannerImage: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.muted,
  },
  backButton: {
    position: "absolute",
    top: 12,
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    zIndex: 10,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
    fontWeight: "500",
  },
  bannerGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
  },
  bannerContent: {
    position: "absolute",
    bottom: 16,
    left: 20,
    right: 20,
  },
  bannerTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 8,
  },
  bannerCreator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  bannerCreatorText: {
    fontSize: 14,
    color: "#FFFFFF",
    opacity: 0.9,
  },
  statsContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 8,
  },
  statValue: {
    fontSize: 13,
    fontWeight: "600",
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
    paddingVertical: 14,
    alignItems: "center",
    position: "relative",
  },
  tabActive: {
    // Active styling handled by indicator
  },
  tabText: {
    fontSize: 14,
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
