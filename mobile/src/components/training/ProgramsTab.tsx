import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Modal,
  RefreshControl,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { TrendingUp, BarChart3, Clock, User, Plus } from "lucide-react-native";
import { AddProgramModal } from "./AddProgramModal";
import { colors } from "@/src/lib/colors";
import { useRouter } from "expo-router";
import { fetchPublishedPrograms, fetchUserProgramInstances } from "@/src/lib/supabase/training";
import { supabase } from "@/src/lib/supabase";
import type { ProgramTemplateWithRelations, ProgramInstanceWithRelations } from "@/src/types/training";

interface ProgramDisplayData {
  id: string;
  title: string;
  creator: string;
  durationWeeks: number;
  daysPerWeek: number;
  minutesPerSession: number;
  primaryGoal: string;
  difficultyLevel: string;
  coverImageUrl: string | null;
  isActive: boolean;
}

interface ProgramCardProps {
  program: ProgramDisplayData;
  onPress: () => void;
}

function ProgramCard({ program, onPress }: ProgramCardProps) {
  const getDifficultyColor = (level: string) => {
    switch (level) {
      case "Beginner":
        return "#22C55E";
      case "Intermediate":
        return "#F59E0B";
      case "Advanced":
        return "#EF4444";
      default:
        return colors.mutedForeground;
    }
  };

  return (
    <TouchableOpacity style={styles.programCard} onPress={onPress} activeOpacity={0.7}>
      {/* Cover Image */}
      <View style={styles.imageContainer}>
        <Image source={{ uri: program.coverImageUrl }} style={styles.coverImage} />
        {program.isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ACTIVE</Text>
          </View>
        )}
      </View>

      {/* Program Info */}
      <View style={styles.cardContent}>
        <Text style={styles.programTitle}>{program.title}</Text>
        <View style={styles.creatorRow}>
          <User size={14} color={colors.mutedForeground} />
          <Text style={styles.creatorText}>by {program.creator}</Text>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Clock size={14} color={colors.mutedForeground} />
            <Text style={styles.statText}>{program.durationWeeks} weeks</Text>
          </View>
          <View style={styles.statItem}>
            <BarChart3 size={14} color={colors.mutedForeground} />
            <Text style={styles.statText}>{program.daysPerWeek} days/week</Text>
          </View>
          <View style={styles.statItem}>
            <TrendingUp size={14} color={getDifficultyColor(program.difficultyLevel)} />
            <Text style={[styles.statText, { color: getDifficultyColor(program.difficultyLevel) }]}>
              {program.difficultyLevel}
            </Text>
          </View>
        </View>

        {/* Goal Badge */}
        <View style={styles.goalRow}>
          <View style={styles.goalBadge}>
            <Text style={styles.goalText}>Goal: {program.primaryGoal}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

interface ProgramsTabProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export default function ProgramsTab({ searchQuery, onSearchChange }: ProgramsTabProps) {
  const router = useRouter();
  const [programs, setPrograms] = useState<ProgramDisplayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);

  useEffect(() => {
    loadPrograms();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPrograms(true);
    setRefreshing(false);
  };

  async function loadPrograms(isRefresh = false) {
    try {
      if (!isRefresh) {
        setLoading(true);
      }
      setError(null);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Fetch all published programs
      const publishedPrograms = await fetchPublishedPrograms();

      // Fetch user's active program instances if logged in
      let userProgramInstances: ProgramInstanceWithRelations[] = [];
      if (user) {
        userProgramInstances = await fetchUserProgramInstances(user.id);
      }

      // Create a Set of program IDs that the user has active instances for
      const activeProgramIds = new Set(
        userProgramInstances
          .filter(instance => instance.status === 'active')
          .map(instance => instance.program_id)
      );

      // Map Supabase data to display format
      const mappedPrograms: ProgramDisplayData[] = publishedPrograms.map(program => ({
        id: program.id,
        title: program.title,
        creator: program.creator_name,
        durationWeeks: program.duration_weeks,
        daysPerWeek: program.days_per_week,
        minutesPerSession: program.minutes_per_session,
        primaryGoal: program.primary_goal,
        difficultyLevel: program.difficulty_level,
        coverImageUrl: program.cover_image_url,
        isActive: activeProgramIds.has(program.id),
      }));

      setPrograms(mappedPrograms);
    } catch (err) {
      console.error('Error loading programs:', err);
      setError('Failed to load programs. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const filteredPrograms = programs.filter((program) => {
    const matchesSearch =
      program.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      program.creator.toLowerCase().includes(searchQuery.toLowerCase());

    return matchesSearch;
  });

  const myPrograms = filteredPrograms.filter((p) => p.isActive);
  const discoverPrograms = filteredPrograms.filter((p) => !p.isActive);

  // Show loading state
  if (loading) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading programs...</Text>
      </View>
    );
  }

  // Show error state
  if (error) {
    return (
      <View style={[styles.container, styles.centerContent]}>
        <Text style={styles.errorTitle}>Oops!</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadPrograms}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Programs List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {/* My Programs Section */}
        {myPrograms.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>MY PROGRAMS</Text>
            {myPrograms.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                onPress={() => router.push(`/(tabs)/training/program/${program.id}`)}
              />
            ))}
          </View>
        )}

        {/* Discover Programs Section */}
        {discoverPrograms.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>DISCOVER PROGRAMS</Text>
            {discoverPrograms.map((program) => (
              <ProgramCard
                key={program.id}
                program={program}
                onPress={() => router.push(`/(tabs)/training/program/${program.id}`)}
              />
            ))}
          </View>
        )}

        {/* Empty Search Results */}
        {filteredPrograms.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No Programs Found</Text>
            <Text style={styles.emptyStateText}>
              Try adjusting your search or browse all programs.
            </Text>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Sticky Refresh Indicator */}
      {refreshing && (
        <View style={styles.refreshingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.refreshingText}>Refreshing...</Text>
        </View>
      )}

      {/* FAB - Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.8}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Add Program Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <AddProgramModal
          onClose={() => setAddModalVisible(false)}
          onSave={(programId) => {
            setAddModalVisible(false);
            loadPrograms();
            router.push(`/(tabs)/training/program/${programId}`);
          }}
        />
      </Modal>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  refreshingContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingVertical: 20,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  refreshingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.mutedForeground,
    letterSpacing: 1,
    marginBottom: 16,
  },
  programCard: {
    backgroundColor: colors.secondary,
    borderRadius: 16,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  imageContainer: {
    position: "relative",
    width: "100%",
    height: 160,
  },
  coverImage: {
    width: "100%",
    height: "100%",
    backgroundColor: colors.muted,
  },
  activeBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  activeBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.primaryForeground,
    letterSpacing: 0.5,
  },
  cardContent: {
    padding: 16,
  },
  programTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.foreground,
    marginBottom: 8,
  },
  creatorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 12,
  },
  creatorText: {
    fontSize: 14,
    color: colors.mutedForeground,
  },
  statsRow: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statText: {
    fontSize: 13,
    color: colors.mutedForeground,
  },
  goalRow: {
    flexDirection: "row",
    gap: 8,
  },
  goalBadge: {
    backgroundColor: "rgba(34, 197, 94, 0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
  },
  goalText: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.primary,
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingHorizontal: 40,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
