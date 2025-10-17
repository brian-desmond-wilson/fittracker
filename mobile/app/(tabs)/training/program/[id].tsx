import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  StatusBar,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, Calendar, Clock, BarChart3, TrendingUp, User } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { fetchProgramById } from "@/src/lib/supabase/training";
import type { ProgramTemplateWithRelations } from "@/src/types/training";
import OverviewTab from "@/src/components/training/program-detail/OverviewTab";
import ScheduleTab from "@/src/components/training/program-detail/ScheduleTab";
import MediaTab from "@/src/components/training/program-detail/MediaTab";
import HistoryTab from "@/src/components/training/program-detail/HistoryTab";

type Tab = "overview" | "schedule" | "media" | "history";

export default function ProgramDetail() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [program, setProgram] = useState<ProgramTemplateWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const programId = params.id as string;

  useEffect(() => {
    loadProgram();
  }, [programId]);

  async function loadProgram() {
    try {
      setLoading(true);
      setError(null);
      const programData = await fetchProgramById(programId);
      setProgram(programData);
    } catch (err) {
      console.error('Error loading program:', err);
      setError('Failed to load program details');
    } finally {
      setLoading(false);
    }
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "schedule", label: "Schedule" },
    { key: "media", label: "Media" },
    { key: "history", label: "History" },
  ];

  const renderTabContent = () => {
    if (!program) return null;

    switch (activeTab) {
      case "overview":
        return <OverviewTab program={program} />;
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

  // Show loading state
  if (loading) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading program...</Text>
        </View>
      </>
    );
  }

  // Show error state
  if (error || !program) {
    return (
      <>
        <StatusBar barStyle="light-content" />
        <View style={[styles.container, styles.centerContent, { paddingTop: insets.top }]}>
          <TouchableOpacity onPress={() => router.back()} style={styles.errorBackButton}>
            <ChevronLeft size={24} color={colors.foreground} />
            <Text style={styles.errorBackText}>Back</Text>
          </TouchableOpacity>
          <View style={styles.errorContent}>
            <Text style={styles.errorTitle}>Oops!</Text>
            <Text style={styles.errorText}>{error || 'Program not found'}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadProgram}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Fixed Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.headerButton}>
            <ChevronLeft size={24} color={colors.foreground} />
            <Text style={styles.headerText}>Training</Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable Content */}
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
        >
          {/* Cover Image Banner */}
          <View style={styles.bannerContainer}>
            <Image
              source={{ uri: program.cover_image_url || 'https://via.placeholder.com/400x250/1a1a1a/ffffff?text=PROGRAM' }}
              style={styles.bannerImage}
            />

            {/* Program Title Overlay */}
            <View style={styles.bannerContent}>
              <Text style={styles.bannerTitle}>{program.title}</Text>
              <View style={styles.bannerCreator}>
                <User size={14} color="#FFFFFF" />
                <Text style={styles.bannerCreatorText}>by {program.creator_name}</Text>
              </View>
            </View>
          </View>

          {/* Program Stats Row */}
          <View style={styles.statsContainer}>
            <View style={styles.statBox}>
              <Calendar size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.statValue} numberOfLines={1}>{program.duration_weeks} weeks</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Clock size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.statValue} numberOfLines={1}>{program.minutes_per_session} min</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <BarChart3 size={18} color={colors.primary} strokeWidth={2} />
              <Text style={styles.statValue} numberOfLines={1}>{program.days_per_week} days/wk</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <TrendingUp size={18} color="#F59E0B" strokeWidth={2} />
              <Text style={styles.statValue} numberOfLines={1}>{program.difficulty_level}</Text>
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
    backgroundColor: colors.background,
  },
  headerButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerText: {
    fontSize: 17,
    color: colors.foreground,
    fontWeight: "500",
  },
  scrollView: {
    flex: 1,
  },
  centerContent: {
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  errorBackButton: {
    position: "absolute",
    top: 60,
    left: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  errorBackText: {
    fontSize: 17,
    color: colors.foreground,
    fontWeight: "500",
  },
  errorContent: {
    alignItems: "center",
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.foreground,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.primaryForeground,
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
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: colors.secondary,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  statBox: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: 3,
  },
  statValue: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
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
