/**
 * Today's Workout Card Component
 * 
 * Shows the next workout in the user's program with:
 * - Workout name and day number
 * - Exercise list with set targets
 * - "Continue" badge for partial workouts
 * - Loading and empty states
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/src/lib/supabase';
import { useTodaysWorkout } from '@/src/hooks/useTodaysWorkout';

// Format seconds to HH:MM:SS or MM:SS
function formatElapsedTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface ExerciseRowProps {
  name: string;
  targetSets: number;
  completedSets: number;
  isComplete: boolean;
}

function ExerciseRow({ name, targetSets, completedSets, isComplete }: ExerciseRowProps) {
  return (
    <View style={styles.exerciseRow}>
      <View style={styles.exerciseInfo}>
        {isComplete ? (
          <Ionicons name="checkmark-circle" size={16} color="#4ade80" style={styles.checkIcon} />
        ) : (
          <View style={styles.bulletPoint} />
        )}
        <Text style={[styles.exerciseName, isComplete && styles.exerciseComplete]}>
          {name}
        </Text>
      </View>
      <Text style={[styles.exerciseSets, isComplete && styles.exerciseComplete]}>
        {completedSets > 0 ? `${completedSets}/` : ''}{targetSets} sets
      </Text>
    </View>
  );
}

export function TodaysWorkoutCard() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);
  
  const { data, isLoading, error, refetch } = useTodaysWorkout(userId ?? undefined);

  // Live timer for in-progress workouts (not paused)
  useEffect(() => {
    if (!data || 'error' in data) {
      setElapsedSeconds(0);
      return;
    }
    
    // For paused sessions, show the saved duration (static)
    if (data.status === 'paused' && data.sessionDurationSeconds) {
      setElapsedSeconds(data.sessionDurationSeconds);
      return;
    }
    
    // For active sessions, show live timer
    if (!data.startedAt) {
      setElapsedSeconds(0);
      return;
    }

    const startTime = new Date(data.startedAt).getTime();
    
    // Update immediately
    setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    
    // Update every second
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [data]);

  // Loading state
  if (isLoading) {
    return (
      <View style={styles.card}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#a78bfa" />
          <Text style={styles.loadingText}>Loading workout...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyContainer}>
          <Ionicons name="alert-circle-outline" size={32} color="#6b7280" />
          <Text style={styles.emptyTitle}>Unable to load workout</Text>
          <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
            <Text style={styles.retryText}>Tap to retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // No active program state
  if (!data || 'error' in data) {
    return (
      <View style={styles.card}>
        <View style={styles.emptyContainer}>
          <Ionicons name="barbell-outline" size={32} color="#6b7280" />
          <Text style={styles.emptyTitle}>No Active Program</Text>
          <Text style={styles.emptySubtitle}>
            Start a program to get personalized workouts
          </Text>
          <TouchableOpacity 
            style={styles.startButton}
            onPress={() => router.push('/programs')}
          >
            <Text style={styles.startButtonText}>Browse Programs</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Success state - show workout
  const { workoutTemplate, programInstance, cycleNumber, status, exercises, remainingExerciseCount } = data;
  const isContinue = status === 'continue';
  const isPaused = status === 'paused';

  const handlePreviewPress = () => {
    // Navigate to workout preview screen to see full exercise details
    router.push({
      pathname: '/workout-preview/[id]',
      params: {
        id: workoutTemplate.id,
        programInstanceId: programInstance.id,
      },
    });
  };

  const handleStartPress = () => {
    // Navigate directly to workout logging
    // Pass the template ID, program instance ID, and existing workout instance ID if continuing
    router.push({
      pathname: '/workout/[id]',
      params: {
        id: workoutTemplate.id,
        programInstanceId: programInstance.id,
        ...(data.existingWorkoutInstanceId && { instanceId: data.existingWorkoutInstanceId }),
      },
    });
  };

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.dayBadge}>
            <Text style={styles.dayBadgeText}>Day {workoutTemplate.day_number}</Text>
          </View>
          {isContinue && (
            <View style={styles.continueBadge}>
              <Ionicons name="play-circle" size={14} color="#fbbf24" />
              <Text style={styles.continueBadgeText}>In Progress</Text>
            </View>
          )}
          {isPaused && (
            <View style={styles.pausedBadge}>
              <Ionicons name="pause-circle" size={14} color="#6366f1" />
              <Text style={styles.pausedBadgeText}>Paused</Text>
            </View>
          )}
          {(isContinue || isPaused) && elapsedSeconds > 0 && (
            <View style={[styles.timerBadge, isPaused && styles.timerBadgePaused]}>
              <Ionicons name="timer-outline" size={14} color={isPaused ? "#9ca3af" : "#22c55e"} />
              <Text style={[styles.timerBadgeText, isPaused && styles.timerBadgeTextPaused]}>
                {formatElapsedTime(elapsedSeconds)}
              </Text>
            </View>
          )}
        </View>
        {/* Preview button - navigates to workout preview page */}
        <TouchableOpacity 
          onPress={handlePreviewPress} 
          style={styles.previewButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </TouchableOpacity>
      </View>

      {/* Workout name */}
      <Text style={styles.workoutName}>{workoutTemplate.name}</Text>
      
      {/* Program info */}
      <Text style={styles.programInfo}>
        {programInstance.name} • Cycle {cycleNumber}
      </Text>

      {/* Remaining exercises badge for partial workouts */}
      {isContinue && remainingExerciseCount > 0 && (
        <View style={styles.remainingBadge}>
          <Ionicons name="time-outline" size={14} color="#f97316" />
          <Text style={styles.remainingText}>
            {remainingExerciseCount} exercise{remainingExerciseCount !== 1 ? 's' : ''} remaining
          </Text>
        </View>
      )}

      {/* Divider */}
      <View style={styles.divider} />

      {/* Exercise list */}
      <View style={styles.exerciseList}>
        {exercises.map((exercise) => (
          <ExerciseRow
            key={exercise.id}
            name={exercise.name}
            targetSets={exercise.targetSets}
            completedSets={exercise.completedSets}
            isComplete={exercise.isComplete}
          />
        ))}
      </View>

      {/* Start/Continue/Resume button */}
      <TouchableOpacity 
        style={[styles.actionButton, isPaused && styles.actionButtonPaused]} 
        onPress={handleStartPress}
        activeOpacity={0.8}
      >
        <Ionicons 
          name={isPaused ? "play" : isContinue ? "play" : "flash"} 
          size={16} 
          color="#fff" 
        />
        <Text style={styles.actionButtonText}>
          {isPaused ? 'Resume Workout' : isContinue ? 'Continue Workout' : 'Start Workout'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1f2937',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  
  // Loading state
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  loadingText: {
    color: '#9ca3af',
    fontSize: 14,
  },
  
  // Empty state
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyTitle: {
    color: '#e5e7eb',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    marginTop: 4,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  retryText: {
    color: '#a78bfa',
    fontSize: 14,
  },
  startButton: {
    marginTop: 16,
    backgroundColor: '#7c3aed',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  startButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dayBadge: {
    backgroundColor: '#374151',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  dayBadgeText: {
    color: '#e5e7eb',
    fontSize: 12,
    fontWeight: '600',
  },
  continueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  continueBadgeText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  timerBadgePaused: {
    backgroundColor: 'rgba(156, 163, 175, 0.15)',
  },
  timerBadgeText: {
    color: '#22c55e',
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  timerBadgeTextPaused: {
    color: '#9ca3af',
  },
  pausedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 4,
  },
  pausedBadgeText: {
    color: '#6366f1',
    fontSize: 12,
    fontWeight: '600',
  },
  previewButton: {
    padding: 4,
  },
  
  // Content
  workoutName: {
    color: '#f9fafb',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  programInfo: {
    color: '#9ca3af',
    fontSize: 13,
  },
  
  // Remaining badge
  remainingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
    gap: 6,
  },
  remainingText: {
    color: '#f97316',
    fontSize: 13,
    fontWeight: '500',
  },
  
  // Divider
  divider: {
    height: 1,
    backgroundColor: '#374151',
    marginVertical: 14,
  },
  
  // Exercise list
  exerciseList: {
    gap: 10,
  },
  exerciseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  exerciseInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  bulletPoint: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6b7280',
    marginRight: 10,
  },
  checkIcon: {
    marginRight: 8,
  },
  exerciseName: {
    color: '#d1d5db',
    fontSize: 14,
    flex: 1,
  },
  exerciseSets: {
    color: '#9ca3af',
    fontSize: 13,
  },
  exerciseComplete: {
    color: '#6b7280',
    textDecorationLine: 'line-through',
  },
  
  // Action button
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
    gap: 8,
  },
  actionButtonPaused: {
    backgroundColor: '#6366f1',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default TodaysWorkoutCard;
