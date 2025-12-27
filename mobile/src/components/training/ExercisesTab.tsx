import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal, RefreshControl } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { ExerciseWithVariations } from '@/src/types/crossfit';
import { fetchAllExercises, searchAllExercises, computeMovementTier } from '@/src/lib/supabase/crossfit';
import { AddExerciseWizard } from './crossfit/AddExerciseWizard';
import { SwipeableMovementCard } from './crossfit/SwipeableMovementCard';

// Exercise with computed tier for display
interface ExerciseWithTier extends ExerciseWithVariations {
  tier?: number;
}

type ExerciseCategory = 'All' | 'Lifting' | 'Gymnastics' | 'Cardio' | 'Core';

interface ExercisesTabProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onCountUpdate: (count: number) => void;
}

export default function ExercisesTab({ searchQuery, onSearchChange, onCountUpdate }: ExercisesTabProps) {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<ExerciseCategory>('All');
  const [exercises, setExercises] = useState<ExerciseWithTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const categories: ExerciseCategory[] = ['All', 'Lifting', 'Gymnastics', 'Cardio', 'Core'];

  const loadExercises = async () => {
    try {
      setLoading(true);
      const data = await fetchAllExercises();

      // Compute tier for each exercise
      const exercisesWithTiers = await Promise.all(
        data.map(async (exercise) => {
          const tier = await computeMovementTier(exercise.id);
          return { ...exercise, tier };
        })
      );

      setExercises(exercisesWithTiers);
      onCountUpdate(exercisesWithTiers.length);
    } catch (error) {
      console.error('Error loading exercises:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadExercises();
      return;
    }

    try {
      setSearching(true);
      const results = await searchAllExercises(searchQuery.trim());

      // Compute tier for each exercise
      const resultsWithTiers = await Promise.all(
        results.map(async (exercise) => {
          const tier = await computeMovementTier(exercise.id);
          return { ...exercise, tier };
        })
      );

      setExercises(resultsWithTiers);
      onCountUpdate(resultsWithTiers.length);
    } catch (error) {
      console.error('Error searching exercises:', error);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      handleSearch();
    } else {
      loadExercises();
    }
  }, [searchQuery, selectedCategory]);

  const refreshExercises = async () => {
    if (searchQuery.trim()) {
      await handleSearch();
    } else {
      await loadExercises();
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshExercises();
    setRefreshing(false);
  };

  // Filter exercises by category
  const getFilteredExercises = () => {
    if (selectedCategory === 'All') {
      return exercises;
    }

    return exercises.filter((exercise) => {
      const exerciseName = exercise.name.toLowerCase();
      const goalTypeName = exercise.goal_type?.name.toLowerCase() || '';

      switch (selectedCategory) {
        case 'Lifting':
          // Lifting exercises: Olympic lifts, squats, deadlifts, presses
          return goalTypeName === 'strength' ||
                 exerciseName.includes('snatch') ||
                 exerciseName.includes('clean') ||
                 exerciseName.includes('jerk') ||
                 exerciseName.includes('squat') ||
                 exerciseName.includes('deadlift') ||
                 exerciseName.includes('press');
        case 'Gymnastics':
          // Gymnastics: Skill-based exercises
          return goalTypeName === 'skill' ||
                 exerciseName.includes('pull-up') ||
                 exerciseName.includes('push-up') ||
                 exerciseName.includes('muscle-up') ||
                 exerciseName.includes('handstand') ||
                 exerciseName.includes('dip');
        case 'Cardio':
          // Cardio: MetCon exercises
          return goalTypeName === 'metcon' ||
                 exerciseName.includes('row') ||
                 exerciseName.includes('run') ||
                 exerciseName.includes('bike') ||
                 exerciseName.includes('ski');
        case 'Core':
          // Core exercises: Foundational exercises with is_core = true
          return exercise.is_core === true;
        default:
          return true;
      }
    });
  };

  // Get icon for exercise based on category
  const getExerciseIcon = (exercise: ExerciseWithVariations): string => {
    const name = exercise.name.toLowerCase();

    if (name.includes('snatch') || name.includes('clean') || name.includes('jerk')) {
      return '🏋️';
    } else if (name.includes('pull-up') || name.includes('muscle-up') || name.includes('handstand')) {
      return '🤸';
    } else if (name.includes('row') || name.includes('run') || name.includes('bike')) {
      return '🏃';
    } else if (name.includes('squat')) {
      return '💪';
    } else if (name.includes('press')) {
      return '🦾';
    } else {
      return '⚡';
    }
  };

  const filteredExercises = getFilteredExercises();

  return (
    <GestureHandlerRootView style={styles.container}>
      {/* Category Filter Pills */}
      <View style={styles.categoryWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryContainer}
        >
        {categories.map((category) => (
          <TouchableOpacity
            key={category}
            style={[
              styles.categoryPill,
              selectedCategory === category && styles.categoryPillActive,
            ]}
            onPress={() => setSelectedCategory(category)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive,
              ]}
            >
              {category}
            </Text>
          </TouchableOpacity>
        ))}
        </ScrollView>
      </View>

      {/* Exercises List */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading exercises...</Text>
          </View>
        ) : filteredExercises.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>No exercises found</Text>
            <Text style={styles.emptyStateText}>
              {searchQuery
                ? `No results for "${searchQuery}"`
                : `No exercises in ${selectedCategory} category`}
            </Text>
          </View>
        ) : (
          filteredExercises.map((exercise) => (
            <View key={exercise.id} style={styles.exerciseItem}>
              <SwipeableMovementCard
                movement={exercise}
                onPress={() => router.push(`/(tabs)/training/exercise/${exercise.id}`)}
                onDelete={refreshExercises}
                getMovementIcon={getExerciseIcon}
                detailRoute="exercise"
              />
            </View>
          ))
        )}
      </ScrollView>

      {/* FAB - Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setAddModalVisible(true)}
        activeOpacity={0.8}
      >
        <Plus size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Add Exercise Modal */}
      <Modal
        visible={addModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <AddExerciseWizard
          onClose={() => setAddModalVisible(false)}
          onSave={() => {
            setAddModalVisible(false);
            loadExercises();
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
  categoryWrapper: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: 12,
  },
  categoryContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.mutedForeground,
  },
  categoryTextActive: {
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    gap: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.mutedForeground,
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.foreground,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: colors.mutedForeground,
    textAlign: 'center',
    lineHeight: 20,
  },
  exerciseItem: {
    marginBottom: 12,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});
