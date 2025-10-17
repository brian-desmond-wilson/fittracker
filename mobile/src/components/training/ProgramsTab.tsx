import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
} from "react-native";
import { Search, TrendingUp, BarChart3, Clock, User } from "lucide-react-native";
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

export default function ProgramsTab() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "my-programs">("all");
  const [programs, setPrograms] = useState<ProgramDisplayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPrograms();
  }, []);

  async function loadPrograms() {
    try {
      setLoading(true);
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

    const matchesFilter =
      activeFilter === "all" || (activeFilter === "my-programs" && program.isActive);

    return matchesSearch && matchesFilter;
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
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color={colors.mutedForeground} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search programs..."
            placeholderTextColor={colors.mutedForeground}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === "all" && styles.filterTabActive]}
          onPress={() => setActiveFilter("all")}
        >
          <Text
            style={[styles.filterTabText, activeFilter === "all" && styles.filterTabTextActive]}
          >
            Discover
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.filterTab, activeFilter === "my-programs" && styles.filterTabActive]}
          onPress={() => setActiveFilter("my-programs")}
        >
          <Text
            style={[
              styles.filterTabText,
              activeFilter === "my-programs" && styles.filterTabTextActive,
            ]}
          >
            My Programs ({myPrograms.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Programs List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* My Programs Section */}
        {activeFilter === "all" && myPrograms.length > 0 && (
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
        {activeFilter === "all" && discoverPrograms.length > 0 && (
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

        {/* My Programs Filter View */}
        {activeFilter === "my-programs" && (
          <View style={styles.section}>
            {myPrograms.length > 0 ? (
              myPrograms.map((program) => (
                <ProgramCard
                  key={program.id}
                  program={program}
                  onPress={() => router.push(`/program/${program.id}`)}
                />
              ))
            ) : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No Active Programs</Text>
                <Text style={styles.emptyStateText}>
                  Start a program from the Discover tab to begin your training journey.
                </Text>
              </View>
            )}
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

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
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
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.secondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: colors.foreground,
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 12,
    marginBottom: 16,
  },
  filterTab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: colors.secondary,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.mutedForeground,
  },
  filterTabTextActive: {
    color: colors.primaryForeground,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
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
});
