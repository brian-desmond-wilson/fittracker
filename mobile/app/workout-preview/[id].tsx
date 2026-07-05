/**
 * Workout Preview Page
 * 
 * Shows detailed workout info before starting a workout.
 * Displays exercises, sets/reps targets, and last performance data.
 * 
 * Route: /workout-preview/[id]
 * Param: id = program_workout.id (workout template ID)
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Clock, AlertCircle, ChevronLeft, CheckCircle2, Zap } from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { supabase } from '@/src/lib/supabase';

// ============================================================
// Types
// ============================================================

interface Exercise {
  id: string;
  name: string;
  description: string | null;
}

interface ProgramWorkoutExercise {
  id: string;
  exercise_order: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number | null;
  exercises: Exercise;
}

interface WorkoutTemplate {
  id: string;
  name: string;
  day_number: number;
  week_number: number;
  program_workout_exercises: ProgramWorkoutExercise[];
}

interface LastPerformance {
  exercise_id: string;
  weight_lbs: number;
  reps: number;
  performed_at: string;
}

// ============================================================
// Data Fetching
// ============================================================

async function fetchWorkoutPreview(workoutTemplateId: string, userId: string) {
  // Fetch workout template with exercises
  const { data: workout, error: workoutError } = await supabase
    .from('program_workouts')
    .select(`
      id,
      name,
      day_number,
      week_number,
      program_workout_exercises (
        id,
        exercise_order,
        target_sets,
        target_reps_min,
        target_reps_max,
        exercises (
          id,
          name,
          description
        )
      )
    `)
    .eq('id', workoutTemplateId)
    .single();

  if (workoutError) {
    throw new Error(`Failed to load workout: ${workoutError.message}`);
  }

  // Sort exercises by order
  const sortedExercises = [...(workout.program_workout_exercises || [])]
    .sort((a, b) => a.exercise_order - b.exercise_order);

  // Fetch last performance for each exercise
  const exerciseIds = sortedExercises.map(e => (e.exercises as any)?.id).filter(Boolean);
  
  // Get the most recent set for each exercise where this user performed it
  const { data: lastSets } = await supabase
    .from('set_instances')
    .select(`
      weight_lbs,
      actual_reps,
      created_at,
      exercise_instances!inner (
        exercise_id,
        workout_instances!inner (
          user_id
        )
      )
    `)
    .in('exercise_instances.exercise_id', exerciseIds)
    .eq('exercise_instances.workout_instances.user_id', userId)
    .eq('is_warmup', false)
    .order('created_at', { ascending: false });

  // Build a map of exercise_id -> last performance
  const lastPerformanceMap: Record<string, LastPerformance> = {};
  
  if (lastSets) {
    for (const set of lastSets) {
      const exerciseId = (set.exercise_instances as any)?.exercise_id;
      if (exerciseId && !lastPerformanceMap[exerciseId] && set.weight_lbs && set.actual_reps) {
        lastPerformanceMap[exerciseId] = {
          exercise_id: exerciseId,
          weight_lbs: set.weight_lbs,
          reps: set.actual_reps,
          performed_at: set.created_at,
        };
      }
    }
  }

  // Check if user has done this workout before
  const { data: lastWorkoutInstance } = await supabase
    .from('workout_instances')
    .select('completed_at, scheduled_date')
    .eq('program_workout_id', workoutTemplateId)
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();

  return {
    workout: {
      ...workout,
      program_workout_exercises: sortedExercises,
    } as unknown as WorkoutTemplate,
    lastPerformanceMap,
    lastCompleted: lastWorkoutInstance?.completed_at || null,
  };
}

// ============================================================
// Hook
// ============================================================

interface WorkoutPreviewData {
  workout: WorkoutTemplate;
  lastPerformanceMap: Record<string, LastPerformance>;
  lastCompleted: string | null;
}

function useWorkoutPreview(workoutTemplateId: string, userId: string | undefined) {
  const [data, setData] = useState<WorkoutPreviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!workoutTemplateId || !userId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    fetchWorkoutPreview(workoutTemplateId, userId)
      .then(result => {
        setData(result);
      })
      .catch(err => {
        setError(err instanceof Error ? err : new Error('Failed to load'));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [workoutTemplateId, userId]);

  return { data, isLoading, error };
}

// ============================================================
// Components
// ============================================================

interface ExerciseCardProps {
  exercise: ProgramWorkoutExercise;
  lastPerformance?: LastPerformance;
  index: number;
}

function ExerciseCard({ exercise, lastPerformance, index }: ExerciseCardProps) {
  const { exercises, target_sets, target_reps_min, target_reps_max } = exercise;
  
  // Format reps display
  const repsDisplay = target_reps_max && target_reps_max !== target_reps_min
    ? `${target_reps_min}-${target_reps_max}`
    : `${target_reps_min}`;

  return (
    <View style={styles.exerciseCard}>
      {/* Exercise number badge */}
      <View style={styles.exerciseNumber}>
        <Text style={styles.exerciseNumberText}>{index + 1}</Text>
      </View>
      
      <View style={styles.exerciseContent}>
        {/* Header row: name */}
        <View style={styles.exerciseHeader}>
          <Text style={styles.exerciseName}>{exercises.name}</Text>
        </View>
        
        {/* Sets x Reps */}
        <Text style={styles.setsReps}>
          {target_sets} sets × {repsDisplay} reps
        </Text>
        
        {/* Last performance */}
        {lastPerformance && (
          <View style={styles.lastPerformance}>
            <Clock size={14} color={colors.mutedForeground} />
            <Text style={styles.lastPerformanceText}>
              Last: {lastPerformance.weight_lbs} lbs × {lastPerformance.reps}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ============================================================
// Main Page Component
// ============================================================

export default function WorkoutPreviewPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, programInstanceId } = useLocalSearchParams<{ id: string; programInstanceId?: string }>();
  const [userId, setUserId] = useState<string | undefined>(undefined);
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id);
    });
  }, []);
  
  const { data, isLoading, error } = useWorkoutPreview(id, userId);

  const handleStartWorkout = () => {
    if (!data?.workout) return;
    
    // Navigate to workout logging with program instance ID
    router.push({
      pathname: '/workout/[id]',
      params: { 
        id: data.workout.id,
        ...(programInstanceId && { programInstanceId }),
      },
    });
  };

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading workout...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error || !data) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.errorContainer}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorTitle}>Unable to load workout</Text>
          <Text style={styles.errorMessage}>
            {error?.message || 'Something went wrong'}
          </Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { workout, lastPerformanceMap, lastCompleted } = data;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Stack.Screen options={{ headerShown: false }} />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.headerBackButton} 
          onPress={() => router.back()}
        >
          <ChevronLeft size={24} color={colors.foreground} />
        </TouchableOpacity>
        
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {workout.name}
          </Text>
          <Text style={styles.headerSubtitle}>
            Day {workout.day_number} • Cycle {workout.week_number}
          </Text>
        </View>
        
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Last completed info */}
      {lastCompleted && (
        <View style={styles.lastCompletedBanner}>
          <CheckCircle2 size={16} color="#4ade80" />
          <Text style={styles.lastCompletedText}>
            Last completed: {new Date(lastCompleted).toLocaleDateString()}
          </Text>
        </View>
      )}

      {/* Exercise List */}
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.exerciseListHeader}>
          <Text style={styles.exerciseListTitle}>
            {workout.program_workout_exercises.length} Exercises
          </Text>
        </View>

        {workout.program_workout_exercises.map((exercise, index) => (
          <ExerciseCard
            key={exercise.id}
            exercise={exercise}
            lastPerformance={lastPerformanceMap[(exercise.exercises as any)?.id]}
            index={index}
          />
        ))}
        
        {/* Spacer for bottom button */}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Start Workout Button */}
      <View style={styles.bottomContainer}>
        <TouchableOpacity 
          style={styles.startButton} 
          onPress={handleStartWorkout}
          activeOpacity={0.8}
        >
          <Zap size={20} color={colors.primaryForeground} />
          <Text style={styles.startButtonText}>Start Workout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  
  // Loading state
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    color: colors.mutedForeground,
    fontSize: 16,
  },
  
  // Error state
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  errorTitle: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: '600',
    marginTop: 8,
  },
  errorMessage: {
    color: colors.mutedForeground,
    fontSize: 14,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: colors.card,
    borderRadius: 8,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '500',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBackButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: -8,
  },
  headerTitles: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.foreground,
    fontSize: 18,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: colors.mutedForeground,
    fontSize: 13,
    marginTop: 2,
  },
  headerPlaceholder: {
    width: 40,
  },
  
  // Last completed banner
  lastCompletedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    gap: 6,
  },
  lastCompletedText: {
    color: '#4ade80',
    fontSize: 13,
  },
  
  // Scroll view
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  
  // Exercise list header
  exerciseListHeader: {
    marginBottom: 12,
  },
  exerciseListTitle: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600',
  },
  
  // Exercise card
  exerciseCard: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 12,
  },
  exerciseNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  exerciseNumberText: {
    color: '#e5e7eb',
    fontSize: 13,
    fontWeight: '600',
  },
  exerciseContent: {
    flex: 1,
  },
  exerciseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exerciseName: {
    color: colors.foreground,
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  setsReps: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '500',
    marginTop: 4,
  },
  
  // Last performance
  lastPerformance: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    gap: 6,
  },
  lastPerformanceText: {
    color: colors.mutedForeground,
    fontSize: 13,
  },
  
  // Bottom section
  bottomSpacer: {
    height: 100,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 32,
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  startButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  startButtonText: {
    color: colors.foreground,
    fontSize: 17,
    fontWeight: '700',
  },
});
