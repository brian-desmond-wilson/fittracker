/**
 * Workout Session Screen
 * 
 * Main workout logging interface. Displays exercises one at a time,
 * allows logging sets with weight/reps/difficulty.
 * 
 * Route: /workout/[id]
 * Params:
 *   - id: program_workout.id (template ID)
 *   - instanceId?: existing workout_instance.id (for continuing)
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import { supabase } from '@/src/lib/supabase';

// ============================================================
// Constants
// ============================================================

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

// Get local date string (YYYY-MM-DD) - avoids UTC timezone issues
function getLocalDateString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Difficulty color scale: green (easy) → red (very hard)
const DIFFICULTY_COLORS: Record<string, string> = {
  'e': '#22c55e',    // green
  'em': '#a3e635',   // lime-green
  'm': '#facc15',    // yellow
  'mh': '#fb923c',   // orange
  'h': '#f87171',    // light red
  'vh': '#b91c1c',   // dark red
};

const getDifficultyColor = (difficulty: string | null): string => {
  if (!difficulty) return '#6b7280'; // gray default
  return DIFFICULTY_COLORS[difficulty] || '#6b7280';
};

// ============================================================
// Types
// ============================================================

interface Exercise {
  id: string;
  name: string;
  image_url: string | null;
}

interface ProgramWorkoutExercise {
  id: string;
  exercise_id: string;
  exercise_order: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number | null;
  superset_group: number | null;
  exercises: Exercise | Exercise[]; // Supabase returns array for nested select
}

interface WorkoutTemplate {
  id: string;
  name: string;
  day_number: number;
  week_number: number;
  program_workout_exercises: ProgramWorkoutExercise[];
}

interface SetEntry {
  id?: string;
  set_number: number;
  weight_lbs: number | null;
  actual_reps: number | null;
  is_warmup: boolean;
  difficulty: string | null;
  increase_weight_next: boolean;
  notes: string | null;
  completed: boolean;
  // Timing
  started_at: number | null;  // timestamp when timer started
  completed_at: number | null; // timestamp when set was logged
  rest_seconds: number | null; // rest time before this set
}

interface ExerciseState {
  exercise: ProgramWorkoutExercise;
  exercise_instance_id?: string;
  sets: SetEntry[];
  notes: string;
  difficulty: string | null;
  increase_weight_next: boolean;
  completed: boolean;
  last_weight?: number;
  last_reps?: number;
}

// Helper to get exercise from nested relation (Supabase may return array or object)
function getExercise(pwe: ProgramWorkoutExercise): Exercise {
  if (Array.isArray(pwe.exercises)) {
    return pwe.exercises[0] || { id: '', name: 'Unknown', image_url: null };
  }
  return pwe.exercises;
}

// Generate exercise image via Edge Function
async function generateExerciseImage(exerciseId: string, userId: string): Promise<string | null> {
  try {
    // Get session for auth token
    const { data: { session } } = await supabase.auth.getSession();
    
    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-exercise-image`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ exerciseId, userId }),
      }
    );
    
    const data = await response.json();
    console.log('Image generation response:', data);
    
    if (data.success && data.imageUrl) {
      return data.imageUrl;
    }
    console.error('Image generation failed:', data.error || data);
    return null;
  } catch (err) {
    console.error('Image generation error:', err);
    return null;
  }
}

// ============================================================
// Difficulty Picker Component
// ============================================================

const DIFFICULTY_OPTIONS = ['e', 'em', 'm', 'mh', 'h', 'vh'];
const DIFFICULTY_LABELS: Record<string, string> = {
  'e': 'Easy',
  'em': 'Easy-Med',
  'm': 'Medium',
  'mh': 'Med-Hard',
  'h': 'Hard',
  'vh': 'V.Hard',
};

interface DifficultyPickerProps {
  value: string | null;
  onChange: (value: string | null) => void;
  increaseWeight: boolean;
  onIncreaseWeightChange: (value: boolean) => void;
  compact?: boolean;
}

function DifficultyPicker({ value, onChange, increaseWeight, onIncreaseWeightChange, compact }: DifficultyPickerProps) {
  return (
    <View style={styles.difficultyContainer}>
      <View style={styles.difficultyRow}>
        {DIFFICULTY_OPTIONS.map(opt => {
          const isSelected = value === opt;
          const color = getDifficultyColor(opt);
          return (
            <TouchableOpacity
              key={opt}
              style={[
                styles.difficultyButton,
                isSelected && { backgroundColor: `${color}30`, borderColor: color },
                compact && styles.difficultyButtonCompact,
              ]}
              onPress={() => onChange(value === opt ? null : opt)}
            >
              <Text style={[
                styles.difficultyButtonText,
                isSelected && { color },
                compact && styles.difficultyButtonTextCompact,
              ]}>
                {opt}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity
        style={styles.increaseWeightRow}
        onPress={() => onIncreaseWeightChange(!increaseWeight)}
      >
        <Ionicons
          name={increaseWeight ? 'checkbox' : 'square-outline'}
          size={20}
          color={increaseWeight ? '#a78bfa' : '#6b7280'}
        />
        <Text style={styles.increaseWeightText}>Add weight next time (^)</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================
// Set Entry Row Component
// ============================================================

interface SetEntryRowProps {
  set: SetEntry;
  setIndex: number;
  targetReps: string;
  onUpdate: (updates: Partial<SetEntry>) => void;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isActive: boolean;
  suggestedWeight?: number;
  isTimerRunning: boolean;
  onStartTimer: () => void;
  onStopTimer: () => void;
  timerSeconds: number;
}

function SetEntryRow({ 
  set, 
  setIndex,
  targetReps, 
  onUpdate, 
  onComplete,
  onEdit,
  onDelete,
  isActive, 
  suggestedWeight,
  isTimerRunning,
  onStartTimer,
  onStopTimer,
  timerSeconds,
}: SetEntryRowProps) {
  const [localWeight, setLocalWeight] = useState(set.weight_lbs?.toString() || '');
  const [localReps, setLocalReps] = useState(set.actual_reps?.toString() || '');

  useEffect(() => {
    if (set.weight_lbs !== null) setLocalWeight(set.weight_lbs.toString());
    if (set.actual_reps !== null) setLocalReps(set.actual_reps.toString());
  }, [set.weight_lbs, set.actual_reps]);

  const formatDuration = (seconds: number | null) => {
    if (seconds === null || seconds === 0) return '--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : `0:${secs.toString().padStart(2, '0')}`;
  };

  const handleComplete = () => {
    const weight = parseFloat(localWeight) || 0;
    const reps = parseInt(localReps) || 0;
    onUpdate({ 
      weight_lbs: weight, 
      actual_reps: reps, 
      completed: true,
      completed_at: Date.now(),
    });
    onComplete();
  };

  // Completed set - new design with tap-to-edit and swipe-to-delete
  if (set.completed) {
    const setDuration = set.started_at && set.completed_at 
      ? Math.floor((set.completed_at - set.started_at) / 1000)
      : null;
    
    const renderRightActions = () => (
      <TouchableOpacity 
        style={styles.deleteSwipeAction}
        onPress={onDelete}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.deleteSwipeText}>Delete</Text>
      </TouchableOpacity>
    );
    
    return (
      <Swipeable renderRightActions={renderRightActions}>
        <TouchableOpacity onPress={onEdit} activeOpacity={0.7}>
          <View style={styles.setRowCompletedNew}>
            {/* Main row */}
            <View style={styles.setRowCompletedMain}>
              <View style={styles.setNumberBadge}>
                <Text style={styles.setNumberText}>{set.set_number}</Text>
              </View>
              {set.is_warmup && (
                <View style={styles.warmupBadge}>
                  <Text style={styles.warmupBadgeText}>Warmup</Text>
                </View>
              )}
              <Text style={styles.setWeightReps}>
                {set.actual_reps} × {set.weight_lbs} lbs
              </Text>
              {set.difficulty && (
                <View style={[
                  styles.difficultyBadgeSmall,
                  { backgroundColor: `${getDifficultyColor(set.difficulty)}20` }
                ]}>
                  <Text style={[
                    styles.difficultyBadgeText,
                    { color: getDifficultyColor(set.difficulty) }
                  ]}>
                    {set.difficulty}{set.increase_weight_next ? '^' : ''}
                  </Text>
                </View>
              )}
              <View style={styles.setDurationBadge}>
                <Ionicons name="timer-outline" size={12} color="#9ca3af" />
                <Text style={styles.setDurationText}>{formatDuration(setDuration)}</Text>
              </View>
            </View>
            {/* Rest indicator */}
            {set.rest_seconds !== null && set.rest_seconds > 0 && (
              <View style={styles.restIndicator}>
                <Ionicons name="moon-outline" size={12} color="#6b7280" />
                <Text style={styles.restIndicatorText}>
                  {formatDuration(set.rest_seconds)} rest
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  }

  // Pending set
  if (!isActive) {
    return (
      <View style={styles.setRowPending}>
        <View style={styles.setRowLeft}>
          <View style={styles.setNumberBadgePending}>
            <Text style={styles.setNumberTextPending}>{set.set_number}</Text>
          </View>
          {set.is_warmup && (
            <View style={styles.warmupBadgePending}>
              <Text style={styles.warmupBadgeTextPending}>Warmup</Text>
            </View>
          )}
        </View>
        <Text style={styles.setPendingText}>{targetReps} reps</Text>
      </View>
    );
  }

  // Active set
  return (
    <View style={styles.setRowActive}>
      <View style={styles.setRowHeader}>
        <View style={styles.setRowHeaderLeft}>
          <View style={styles.setNumberBadgeActive}>
            <Text style={styles.setNumberTextActive}>{set.set_number}</Text>
          </View>
          {set.is_warmup && (
            <View style={styles.warmupBadgeActive}>
              <Text style={styles.warmupBadgeTextActive}>Warmup</Text>
            </View>
          )}
        </View>
        {/* Timer control */}
        {!isTimerRunning ? (
          <TouchableOpacity style={styles.timerStartButton} onPress={onStartTimer}>
            <Ionicons name="play" size={14} color="#4ade80" />
            <Text style={styles.timerStartText}>Start</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.timerRunning}>
            <Ionicons name="timer" size={14} color="#fbbf24" />
            <Text style={styles.timerRunningText}>{formatDuration(timerSeconds)}</Text>
            <TouchableOpacity onPress={onStopTimer}>
              <Ionicons name="stop" size={14} color="#ef4444" />
            </TouchableOpacity>
          </View>
        )}
      </View>
      
      {suggestedWeight && !localWeight && (
        <TouchableOpacity 
          style={styles.suggestionRow}
          onPress={() => setLocalWeight(suggestedWeight.toString())}
        >
          <Text style={styles.suggestionText}>💡 Suggested: {suggestedWeight} lbs</Text>
        </TouchableOpacity>
      )}
      
      <View style={styles.inputRow}>
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            value={localReps}
            onChangeText={setLocalReps}
            keyboardType="number-pad"
            placeholder={targetReps}
            placeholderTextColor="#6b7280"
          />
          <Text style={styles.inputLabel}>reps</Text>
        </View>
        <Text style={styles.inputSeparator}>×</Text>
        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            value={localWeight}
            onChangeText={setLocalWeight}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor="#6b7280"
          />
          <Text style={styles.inputLabel}>lbs</Text>
        </View>
      </View>

      <DifficultyPicker
        value={set.difficulty}
        onChange={(d) => onUpdate({ difficulty: d })}
        increaseWeight={set.increase_weight_next}
        onIncreaseWeightChange={(v) => onUpdate({ increase_weight_next: v })}
        compact
      />

      <TouchableOpacity style={styles.logSetButton} onPress={handleComplete}>
        <Ionicons name="checkmark" size={18} color="#fff" />
        <Text style={styles.logSetButtonText}>Log Set</Text>
      </TouchableOpacity>
    </View>
  );
}

// ============================================================
// Main Workout Session Component
// ============================================================

export default function WorkoutSessionPage() {
  const router = useRouter();
  const { id, instanceId, programInstanceId } = useLocalSearchParams<{ id: string; instanceId?: string; programInstanceId?: string }>();
  
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  const [workoutInstanceId, setWorkoutInstanceId] = useState<string | null>(instanceId || null);
  const workoutInstanceIdRef = React.useRef<string | null>(instanceId || null);
  const creatingWorkoutInstance = React.useRef(false);
  
  // Workout session tracking (for split workouts)
  const [workoutSessionId, setWorkoutSessionId] = useState<string | null>(null);
  const workoutSessionIdRef = React.useRef<string | null>(null);
  const creatingWorkoutSession = React.useRef(false);
  
  // Track exercise instance IDs by exercise index to prevent race conditions
  const exerciseInstanceIdsRef = React.useRef<Record<number, string>>({});
  const creatingExerciseInstance = React.useRef<Record<number, boolean>>({});
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restSeconds, setRestSeconds] = useState(0);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [exerciseImages, setExerciseImages] = useState<Record<string, string>>({});
  
  // Set timer state
  const [activeSetTimer, setActiveSetTimer] = useState<number | null>(null); // timestamp when started
  const [setTimerSeconds, setSetTimerSeconds] = useState(0);
  const [lastSetCompletedAt, setLastSetCompletedAt] = useState<number | null>(null);
  
  // Summary view state (index === exerciseStates.length means we're on summary)
  const [showSummary, setShowSummary] = useState(false);
  
  // ScrollView ref for scrolling to top on exercise change
  const scrollViewRef = React.useRef<ScrollView>(null);
  
  // Swipe gesture handling
  const swipeAnim = React.useRef(new Animated.Value(0)).current;
  
  // Refs to track current values for panResponder (avoids stale closure)
  const currentExerciseIndexRef = React.useRef(0);
  const exerciseStatesLengthRef = React.useRef(0);
  const showSummaryRef = React.useRef(false);
  
  // Keep refs in sync with state
  React.useEffect(() => {
    currentExerciseIndexRef.current = currentExerciseIndex;
  }, [currentExerciseIndex]);
  
  React.useEffect(() => {
    exerciseStatesLengthRef.current = exerciseStates.length;
  }, [exerciseStates.length]);
  
  React.useEffect(() => {
    showSummaryRef.current = showSummary;
  }, [showSummary]);
  
  const panResponder = React.useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        swipeAnim.setValue(gestureState.dx);
      },
      onPanResponderRelease: (_, gestureState) => {
        const SWIPE_THRESHOLD = 80;
        const currentIdx = currentExerciseIndexRef.current;
        const totalExercises = exerciseStatesLengthRef.current;
        const onSummary = showSummaryRef.current;
        
        if (onSummary) {
          // On summary view, can only swipe right to go back to last exercise
          if (gestureState.dx > SWIPE_THRESHOLD) {
            Animated.timing(swipeAnim, {
              toValue: SCREEN_WIDTH,
              duration: 200,
              useNativeDriver: true,
            }).start(() => {
              swipeAnim.setValue(-SCREEN_WIDTH);
              scrollViewRef.current?.scrollTo({ y: 0, animated: false });
              requestAnimationFrame(() => {
                setShowSummary(false);
                Animated.spring(swipeAnim, {
                  toValue: 0,
                  useNativeDriver: true,
                  tension: 50,
                  friction: 9,
                }).start();
              });
            });
          } else {
            Animated.spring(swipeAnim, {
              toValue: 0,
              useNativeDriver: true,
            }).start();
          }
          return;
        }
        
        if (gestureState.dx < -SWIPE_THRESHOLD) {
          // Swipe left → next exercise or summary
          const isLastExercise = currentIdx >= totalExercises - 1;
          
          Animated.timing(swipeAnim, {
            toValue: -SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            swipeAnim.setValue(SCREEN_WIDTH);
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
            requestAnimationFrame(() => {
              if (isLastExercise) {
                setShowSummary(true);
              } else {
                setCurrentExerciseIndex(currentIdx + 1);
              }
              Animated.spring(swipeAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 50,
                friction: 9,
              }).start();
            });
          });
        } else if (gestureState.dx > SWIPE_THRESHOLD && currentIdx > 0) {
          // Swipe right → previous exercise (carousel animation)
          Animated.timing(swipeAnim, {
            toValue: SCREEN_WIDTH,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            swipeAnim.setValue(-SCREEN_WIDTH);
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
            requestAnimationFrame(() => {
              setCurrentExerciseIndex(currentIdx - 1);
              Animated.spring(swipeAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 50,
                friction: 9,
              }).start();
            });
          });
        } else {
          // Not enough swipe, spring back
          Animated.spring(swipeAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  // Get current user
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUserId(user?.id || null);
    });
  }, []);

  // Load workout template
  useEffect(() => {
    if (!id || !userId) return;
    loadWorkout();
  }, [id, userId]);

  // Elapsed time ticker
  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  // Rest timer ticker (global rest modal)
  useEffect(() => {
    if (!showRestTimer) return;
    const interval = setInterval(() => {
      setRestSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [showRestTimer]);

  // Set timer ticker
  useEffect(() => {
    if (!activeSetTimer) return;
    const interval = setInterval(() => {
      setSetTimerSeconds(Math.floor((Date.now() - activeSetTimer) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSetTimer]);

  const handleStartSetTimer = () => {
    const now = Date.now();
    // Calculate rest time (from last set completed to now)
    const restTime = lastSetCompletedAt ? Math.floor((now - lastSetCompletedAt) / 1000) : 0;
    
    // Update the current set with rest_seconds and started_at
    const activeIdx = currentExercise?.sets.findIndex(s => !s.completed) ?? -1;
    if (activeIdx >= 0) {
      updateSet(currentExerciseIndex, activeIdx, { 
        started_at: now,
        rest_seconds: restTime,
      });
    }
    
    setActiveSetTimer(now);
    setSetTimerSeconds(0);
  };

  const handleStopSetTimer = () => {
    setActiveSetTimer(null);
  };

  const handleSetComplete = () => {
    const now = Date.now();
    setLastSetCompletedAt(now);
    setActiveSetTimer(null);
    setSetTimerSeconds(0);
  };

  const loadWorkout = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch template with exercises
      const { data: workoutData, error: workoutError } = await supabase
        .from('program_workouts')
        .select(`
          id,
          name,
          day_number,
          week_number,
          program_workout_exercises (
            id,
            exercise_id,
            exercise_order,
            target_sets,
            target_reps_min,
            target_reps_max,
            superset_group,
            exercises (
              id,
              name,
              image_url
            )
          )
        `)
        .eq('id', id)
        .single();

      if (workoutError) throw workoutError;

      // Sort exercises by order
      const sortedExercises = [...(workoutData.program_workout_exercises || [])]
        .sort((a, b) => a.exercise_order - b.exercise_order);

      setTemplate({
        ...workoutData,
        program_workout_exercises: sortedExercises,
      } as unknown as WorkoutTemplate);

      // Prefetch all exercise images for smooth transitions
      const imageUrls = sortedExercises
        .map(ex => (ex.exercises as any)?.image_url || ex.exercises?.[0]?.image_url)
        .filter((url): url is string => !!url);
      
      imageUrls.forEach(url => {
        Image.prefetch(url).catch(() => {}); // Silently ignore failures
      });

      // Fetch last performance for suggestions
      const exerciseIds = sortedExercises.map(e => e.exercise_id);
      const { data: lastSets } = await supabase
        .from('set_instances')
        .select(`
          weight_lbs,
          actual_reps,
          exercise_instances!inner (
            exercise_id,
            workout_instances!inner (user_id)
          )
        `)
        .in('exercise_instances.exercise_id', exerciseIds)
        .eq('exercise_instances.workout_instances.user_id', userId)
        .eq('is_warmup', false)
        .order('created_at', { ascending: false });

      // Build last performance map
      const lastPerf: Record<string, { weight: number; reps: number }> = {};
      if (lastSets) {
        for (const s of lastSets) {
          const exId = (s.exercise_instances as any)?.exercise_id;
          if (exId && !lastPerf[exId] && s.weight_lbs) {
            lastPerf[exId] = { weight: s.weight_lbs, reps: s.actual_reps || 0 };
          }
        }
      }

      // If resuming an existing workout, load saved exercise/set data
      let existingExerciseData: Record<string, { 
        exercise_instance_id: string;
        status: string;
        sets: Array<{
          id: string;
          set_number: number;
          actual_weight_lbs: number | null;
          actual_reps: number | null;
          is_warmup: boolean;
          difficulty: string | null;
          increase_weight_next: boolean;
        }>;
      }> = {};

      // Track started_at and duration from existing workout instance
      let workoutStartedAt: Date | null = null;
      let savedDurationSeconds: number = 0;

      if (instanceId) {
        // Fetch workout instance to get started_at and duration_seconds
        const { data: workoutInstance } = await supabase
          .from('workout_instances')
          .select('started_at, duration_seconds')
          .eq('id', instanceId)
          .single();
        
        if (workoutInstance?.started_at) {
          workoutStartedAt = new Date(workoutInstance.started_at);
        }
        if (workoutInstance?.duration_seconds) {
          savedDurationSeconds = workoutInstance.duration_seconds;
        }
        
        // Find or create session for today
        const today = getLocalDateString();
        const { data: existingSession } = await supabase
          .from('workout_sessions')
          .select('id, duration_seconds')
          .eq('workout_instance_id', instanceId)
          .eq('session_date', today)
          .single();
        
        if (existingSession) {
          // Resume today's session
          workoutSessionIdRef.current = existingSession.id;
          setWorkoutSessionId(existingSession.id);
          // Use this session's duration for the timer
          if (existingSession.duration_seconds) {
            savedDurationSeconds = existingSession.duration_seconds;
          }
        } else {
          // Will create a new session when first exercise is logged
          // (handled by createOrGetWorkoutSession)
        }

        const { data: existingExercises } = await supabase
          .from('exercise_instances')
          .select(`
            id,
            exercise_id,
            status,
            exercise_order,
            set_instances (
              id,
              set_number,
              actual_weight_lbs,
              actual_reps,
              is_warmup,
              difficulty,
              increase_weight_next
            )
          `)
          .eq('workout_instance_id', instanceId)
          .order('exercise_order');

        if (existingExercises) {
          for (const ex of existingExercises) {
            existingExerciseData[ex.exercise_id] = {
              exercise_instance_id: ex.id,
              status: ex.status,
              sets: (ex.set_instances || []).sort((a: any, b: any) => a.set_number - b.set_number),
            };
            // Also populate the ref for race condition safety
            const exIdx = sortedExercises.findIndex(e => e.exercise_id === ex.exercise_id);
            if (exIdx >= 0) {
              exerciseInstanceIdsRef.current[exIdx] = ex.id;
            }
          }
        }
      }

      // Initialize exercise states (with existing data if resuming)
      const states: ExerciseState[] = sortedExercises.map((ex, exIdx) => {
        const existing = existingExerciseData[ex.exercise_id];
        const existingSets = existing?.sets || [];
        
        // Build sets: include existing warmups + working sets
        const warmupSets = existingSets.filter(s => s.is_warmup).map(s => ({
          id: s.id,
          set_number: s.set_number,
          weight_lbs: s.actual_weight_lbs,
          actual_reps: s.actual_reps,
          is_warmup: true,
          difficulty: s.difficulty,
          increase_weight_next: s.increase_weight_next || false,
          notes: null,
          completed: true,
          started_at: null,
          completed_at: null,
          rest_seconds: null,
        }));
        
        const workingSets = existingSets.filter(s => !s.is_warmup);
        const targetWorkingSets = ex.target_sets;
        
        // Build working sets: fill with existing + empty for remaining
        const workingSetEntries = Array.from({ length: targetWorkingSets }, (_, i) => {
          const existingSet = workingSets.find(s => s.set_number === warmupSets.length + i + 1) || workingSets[i];
          if (existingSet) {
            return {
              id: existingSet.id,
              set_number: i + 1,
              weight_lbs: existingSet.actual_weight_lbs,
              actual_reps: existingSet.actual_reps,
              is_warmup: false,
              difficulty: existingSet.difficulty,
              increase_weight_next: existingSet.increase_weight_next || false,
              notes: null,
              completed: true,
              started_at: null,
              completed_at: null,
              rest_seconds: null,
            };
          }
          return {
            set_number: i + 1,
            weight_lbs: null,
            actual_reps: null,
            is_warmup: false,
            difficulty: null,
            increase_weight_next: false,
            notes: null,
            completed: false,
            started_at: null,
            completed_at: null,
            rest_seconds: null,
          };
        });

        const allSets = [...warmupSets, ...workingSetEntries];
        const isExerciseComplete = existing?.status === 'completed';

        return {
          exercise: ex,
          exercise_instance_id: existing?.exercise_instance_id,
          sets: allSets,
          notes: '',
          difficulty: null,
          increase_weight_next: false,
          completed: isExerciseComplete,
          last_weight: lastPerf[ex.exercise_id]?.weight,
          last_reps: lastPerf[ex.exercise_id]?.reps,
        };
      });

      setExerciseStates(states);
      
      // If resuming, find first incomplete exercise to start from
      if (instanceId) {
        const firstIncompleteIdx = states.findIndex(s => !s.completed);
        if (firstIncompleteIdx > 0) {
          setCurrentExerciseIndex(firstIncompleteIdx);
        }
      }
      
      // For resuming with saved duration: set startedAt so elapsed calculation works correctly
      // If we have saved duration, fake the startedAt to be (now - duration) so ticker continues from saved time
      if (savedDurationSeconds > 0) {
        setStartedAt(new Date(Date.now() - savedDurationSeconds * 1000));
      } else {
        // Use existing started_at if resuming, otherwise new Date
        setStartedAt(workoutStartedAt || new Date());
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentExercise = exerciseStates[currentExerciseIndex];
  const activeSetIndex = currentExercise?.sets.findIndex(s => !s.completed) ?? -1;

  const handleGenerateImage = async () => {
    if (!userId || !currentExercise) return;
    
    const exercise = getExercise(currentExercise.exercise);
    setGeneratingImage(true);
    
    try {
      const imageUrl = await generateExerciseImage(exercise.id, userId);
      if (imageUrl) {
        setExerciseImages(prev => ({ ...prev, [exercise.id]: imageUrl }));
        Alert.alert('Success', 'Exercise image generated!');
      } else {
        Alert.alert('Error', 'Failed to generate image. Please try again.');
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to generate image.');
    } finally {
      setGeneratingImage(false);
    }
  };

  // Get current exercise image (from state override or original)
  const getCurrentExerciseImage = () => {
    if (!currentExercise) return null;
    const exercise = getExercise(currentExercise.exercise);
    return exerciseImages[exercise.id] || exercise.image_url;
  };

  // Save a single set to database immediately
  const saveSetToDatabase = async (exerciseIdx: number, setIdx: number, setData: SetEntry) => {
    try {
      // 1. Ensure workout_instance exists (use ref for immediate access)
      let wiId = workoutInstanceIdRef.current || workoutInstanceId;
      if (!wiId) {
        wiId = await createWorkoutInstance();
        if (!wiId) {
          console.error('Failed to create workout instance');
          Alert.alert('Save Error', 'Could not save set. Please try again.');
          return;
        }
      }

      // 2. Ensure exercise_instance exists (use ref to prevent race conditions)
      const state = exerciseStates[exerciseIdx];
      let exInstanceId = exerciseInstanceIdsRef.current[exerciseIdx] || state.exercise_instance_id;
      
      if (!exInstanceId) {
        // Check mutex to prevent concurrent creation
        if (creatingExerciseInstance.current[exerciseIdx]) {
          // Another call is creating this exercise instance, wait and retry
          await new Promise(resolve => setTimeout(resolve, 100));
          exInstanceId = exerciseInstanceIdsRef.current[exerciseIdx];
          if (!exInstanceId) {
            console.error('Exercise instance creation in progress but not completed');
            return;
          }
        } else {
          // Mark as creating
          creatingExerciseInstance.current[exerciseIdx] = true;
          
          // Ensure we have a session for today
          const sessionId = await createOrGetWorkoutSession(wiId);
          
          const { data: exInstance, error: exError } = await supabase
            .from('exercise_instances')
            .insert({
              workout_instance_id: wiId,
              workout_session_id: sessionId,
              exercise_id: state.exercise.exercise_id,
              program_workout_exercise_id: state.exercise.id,
              exercise_order: exerciseIdx + 1,
              user_id: userId,
              status: 'in_progress',
              performed_date: getLocalDateString(),
              notes: state.notes || null,
              difficulty: state.difficulty,
              increase_weight_next: state.increase_weight_next,
            })
            .select('id')
            .single();

          creatingExerciseInstance.current[exerciseIdx] = false;

          if (exError || !exInstance) {
            console.error('Failed to create exercise instance:', exError);
            Alert.alert('Save Error', `Could not save exercise: ${exError?.message || 'Unknown error'}`);
            return;
          }
          
          exInstanceId = exInstance.id;
          // Store in ref immediately (sync)
          exerciseInstanceIdsRef.current[exerciseIdx] = exInstanceId!;
          
          // Also update state (async, for UI)
          setExerciseStates(prev => {
            const newStates = [...prev];
            newStates[exerciseIdx] = {
              ...newStates[exerciseIdx],
              exercise_instance_id: exInstanceId,
            };
            return newStates;
          });
        }
      }

      // 3. Insert or update set_instance
      if (setData.id) {
        // Update existing set
        const { error } = await supabase
          .from('set_instances')
          .update({
            actual_weight_lbs: setData.weight_lbs,
            actual_reps: setData.actual_reps,
            difficulty: setData.difficulty,
            increase_weight_next: setData.increase_weight_next,
            notes: setData.notes,
          })
          .eq('id', setData.id);
        
        if (error) console.error('Failed to update set:', error);
      } else {
        // Insert new set
        // Use setIdx+1 for DB set_number (sequential across warmups AND working sets)
        // Local setData.set_number is separate per type, but DB needs unique per exercise
        const dbSetNumber = setIdx + 1;
        // Use upsert to handle re-logging sets (updates if exists, inserts if not)
        const { data: newSet, error } = await supabase
          .from('set_instances')
          .upsert({
            exercise_instance_id: exInstanceId,
            user_id: userId,
            set_number: dbSetNumber,
            actual_weight_lbs: setData.weight_lbs,
            actual_reps: setData.actual_reps,
            target_reps: state.exercise.target_reps_min,
            is_warmup: setData.is_warmup,
            is_failure: false,
            difficulty: setData.difficulty,
            increase_weight_next: setData.increase_weight_next,
            notes: setData.notes,
          }, { onConflict: 'exercise_instance_id,set_number' })
          .select('id')
          .single();

        if (error) {
          console.error('Failed to insert set:', error);
        } else if (newSet) {
          // Store the set_instance_id for future updates
          setExerciseStates(prev => {
            const newStates = [...prev];
            newStates[exerciseIdx] = {
              ...newStates[exerciseIdx],
              sets: newStates[exerciseIdx].sets.map((s, i) =>
                i === setIdx ? { ...s, id: newSet.id } : s
              ),
            };
            return newStates;
          });
        }
      }
    } catch (err) {
      console.error('Error saving set:', err);
    }
  };

  const updateSet = (exerciseIdx: number, setIdx: number, updates: Partial<SetEntry>) => {
    setExerciseStates(prev => {
      const newStates = [...prev];
      const currentSet = newStates[exerciseIdx].sets[setIdx];
      const updatedSet = { ...currentSet, ...updates };
      
      newStates[exerciseIdx] = {
        ...newStates[exerciseIdx],
        sets: newStates[exerciseIdx].sets.map((s, i) =>
          i === setIdx ? updatedSet : s
        ),
      };
      
      // If set is being marked complete, save to database immediately
      if (updates.completed === true) {
        // Use setTimeout to ensure state update completes first
        setTimeout(() => saveSetToDatabase(exerciseIdx, setIdx, updatedSet), 0);
      }
      
      return newStates;
    });
  };

  const editSet = (exerciseIdx: number, setIdx: number) => {
    // Mark set as incomplete to allow re-editing
    updateSet(exerciseIdx, setIdx, { 
      completed: false,
      completed_at: null,
    });
  };

  const deleteSet = (exerciseIdx: number, setIdx: number, isWarmup: boolean) => {
    const setToDelete = exerciseStates[exerciseIdx]?.sets[setIdx];
    
    Alert.alert(
      'Delete Set',
      'Are you sure you want to delete this set?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            // Delete from database if it was persisted
            if (setToDelete?.id) {
              const { error } = await supabase
                .from('set_instances')
                .delete()
                .eq('id', setToDelete.id);
              if (error) console.error('Failed to delete set from database:', error);
            }
            
            setExerciseStates(prev => {
              const newStates = [...prev];
              const currentSets = newStates[exerciseIdx].sets;
              
              // Remove the set
              const updatedSets = currentSets.filter((_, i) => i !== setIdx);
              
              // Renumber sets of the same type
              let warmupNum = 1;
              let workingNum = 1;
              const renumberedSets = updatedSets.map(s => ({
                ...s,
                set_number: s.is_warmup ? warmupNum++ : workingNum++,
              }));
              
              newStates[exerciseIdx] = {
                ...newStates[exerciseIdx],
                sets: renumberedSets,
              };
              return newStates;
            });
          },
        },
      ]
    );
  };

  const addWarmupSet = () => {
    setExerciseStates(prev => {
      const newStates = [...prev];
      const currentSets = newStates[currentExerciseIndex].sets;
      const warmupSets = currentSets.filter(s => s.is_warmup);
      const workingSets = currentSets.filter(s => !s.is_warmup);
      
      const newWarmupSet = {
        set_number: warmupSets.length + 1,
        weight_lbs: null,
        actual_reps: null,
        is_warmup: true,
        difficulty: null,
        increase_weight_next: false,
        notes: null,
        completed: false,
        started_at: null,
        completed_at: null,
        rest_seconds: null,
      };
      
      // Append warmup set to end of warmups, then working sets
      newStates[currentExerciseIndex] = {
        ...newStates[currentExerciseIndex],
        sets: [...warmupSets, newWarmupSet, ...workingSets],
      };
      return newStates;
    });
  };

  const toggleExerciseComplete = async () => {
    const currentState = exerciseStates[currentExerciseIndex];
    
    if (currentState.completed) {
      // Un-complete: update database and local state
      const exInstanceId = exerciseInstanceIdsRef.current[currentExerciseIndex] || currentState.exercise_instance_id;
      
      if (exInstanceId) {
        await supabase
          .from('exercise_instances')
          .update({ status: 'in_progress' })
          .eq('id', exInstanceId);
      }
      
      setExerciseStates(prev => {
        const newStates = [...prev];
        newStates[currentExerciseIndex].completed = false;
        return newStates;
      });
    } else {
      // Complete: save to database and toggle state
      if (!workoutInstanceId) {
        await createWorkoutInstance();
      }
      
      await saveExerciseInstance(currentExerciseIndex);
      
      setExerciseStates(prev => {
        const newStates = [...prev];
        newStates[currentExerciseIndex].completed = true;
        return newStates;
      });
    }
  };

  // Legacy function kept for compatibility (no longer auto-navigates)
  const completeExercise = async () => {
    await toggleExerciseComplete();
  };
  
  // Navigate to summary view
  const goToSummary = () => {
    setShowSummary(true);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };
  
  // Navigate from summary back to exercise
  const goToExercise = (index: number) => {
    setShowSummary(false);
    setCurrentExerciseIndex(index);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };

  const createWorkoutInstance = async (): Promise<string | null> => {
    // Return existing instance if already created
    if (workoutInstanceIdRef.current) {
      return workoutInstanceIdRef.current;
    }
    
    // Prevent duplicate creation attempts
    if (creatingWorkoutInstance.current) {
      // Wait for the other creation to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      return workoutInstanceIdRef.current;
    }
    
    if (!userId) {
      console.error('Cannot create workout instance: userId not available');
      Alert.alert('Error', 'User not logged in. Please restart the app.');
      return null;
    }
    if (!template) {
      console.error('Cannot create workout instance: template not loaded');
      Alert.alert('Error', 'Workout template not loaded. Please go back and try again.');
      return null;
    }
    if (!programInstanceId) {
      console.error('Cannot create workout instance: programInstanceId not available');
      Alert.alert('Error', 'Program instance not found. Please start from the home screen.');
      return null;
    }

    creatingWorkoutInstance.current = true;
    
    try {
      const { data, error } = await supabase
        .from('workout_instances')
        .insert({
          user_id: userId,
          program_instance_id: programInstanceId,
          program_workout_id: template.id,
          week_number: template.week_number,
          day_number: template.day_number,
          status: 'in_progress',
          scheduled_date: getLocalDateString(),
          started_at: startedAt?.toISOString(),
        })
        .select('id')
        .single();

      if (error) {
        console.error('Supabase error creating workout instance:', error);
        Alert.alert('Database Error', `Could not start workout: ${error.message}`);
        return null;
      }
      
      if (data) {
        workoutInstanceIdRef.current = data.id;
        setWorkoutInstanceId(data.id);
        return data.id;
      }
      
      return null;
    } finally {
      creatingWorkoutInstance.current = false;
    }
  };

  // Create or get today's workout session
  const createOrGetWorkoutSession = async (wiId: string): Promise<string | null> => {
    // Return existing session if already created
    if (workoutSessionIdRef.current) {
      return workoutSessionIdRef.current;
    }
    
    // Prevent duplicate creation attempts
    if (creatingWorkoutSession.current) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return workoutSessionIdRef.current;
    }
    
    if (!userId) return null;
    
    creatingWorkoutSession.current = true;
    
    try {
      const today = getLocalDateString();
      
      // Check if a session already exists for today
      const { data: existingSession } = await supabase
        .from('workout_sessions')
        .select('id, duration_seconds')
        .eq('workout_instance_id', wiId)
        .eq('session_date', today)
        .single();
      
      if (existingSession) {
        workoutSessionIdRef.current = existingSession.id;
        setWorkoutSessionId(existingSession.id);
        return existingSession.id;
      }
      
      // Get next session number
      const { data: sessions } = await supabase
        .from('workout_sessions')
        .select('session_number')
        .eq('workout_instance_id', wiId)
        .order('session_number', { ascending: false })
        .limit(1);
      
      const nextSessionNumber = (sessions?.[0]?.session_number || 0) + 1;
      
      // Create new session for today
      const { data: newSession, error } = await supabase
        .from('workout_sessions')
        .insert({
          workout_instance_id: wiId,
          user_id: userId,
          session_number: nextSessionNumber,
          session_date: today,
          started_at: new Date().toISOString(),
          duration_seconds: 0,
        })
        .select('id')
        .single();
      
      if (error || !newSession) {
        console.error('Failed to create workout session:', error);
        return null;
      }
      
      workoutSessionIdRef.current = newSession.id;
      setWorkoutSessionId(newSession.id);
      return newSession.id;
    } finally {
      creatingWorkoutSession.current = false;
    }
  };

  const saveExerciseInstance = async (exerciseIdx: number) => {
    const state = exerciseStates[exerciseIdx];
    const wiId = workoutInstanceId || await createWorkoutInstance();
    if (!wiId) return;

    // Reuse existing exercise_instance or create new one (check ref first for race condition safety)
    let exInstanceId = exerciseInstanceIdsRef.current[exerciseIdx] || state.exercise_instance_id;
    
    if (!exInstanceId) {
      // Ensure we have a session for today
      const sessionId = await createOrGetWorkoutSession(wiId);
      
      const { data: exInstance, error: exError } = await supabase
        .from('exercise_instances')
        .insert({
          workout_instance_id: wiId,
          workout_session_id: sessionId,
          exercise_id: state.exercise.exercise_id,
          program_workout_exercise_id: state.exercise.id,
          exercise_order: exerciseIdx + 1,
          user_id: userId,
          status: 'completed',
          performed_date: getLocalDateString(),
          notes: state.notes || null,
          difficulty: state.difficulty,
          increase_weight_next: state.increase_weight_next,
        })
        .select('id')
        .single();

      if (exError || !exInstance) {
        console.error('Failed to create exercise instance:', exError);
        return;
      }
      exInstanceId = exInstance.id;
      // Store in ref for consistency
      exerciseInstanceIdsRef.current[exerciseIdx] = exInstanceId!;
    } else {
      // Update existing exercise instance with final notes/difficulty
      await supabase
        .from('exercise_instances')
        .update({
          status: 'completed',
          notes: state.notes || null,
          difficulty: state.difficulty,
          increase_weight_next: state.increase_weight_next,
        })
        .eq('id', exInstanceId);
    }

    // Only save sets that weren't already saved per-set (no id)
    // Use array index + 1 for DB set_number (sequential across all sets)
    for (let i = 0; i < state.sets.length; i++) {
      const set = state.sets[i];
      if (!set.completed || set.id) continue; // Skip if not completed or already saved
      
      const dbSetNumber = i + 1;
      // Use upsert to handle edge cases where set might already exist
      await supabase.from('set_instances').upsert({
        exercise_instance_id: exInstanceId,
        user_id: userId,
        set_number: dbSetNumber,
        actual_weight_lbs: set.weight_lbs,
        actual_reps: set.actual_reps,
        target_reps: state.exercise.target_reps_min,
        is_warmup: set.is_warmup,
        is_failure: false,
        difficulty: set.difficulty,
        increase_weight_next: set.increase_weight_next,
        notes: set.notes,
      }, { onConflict: 'exercise_instance_id,set_number' });
    }
  };

  // Done for Today - saves progress but keeps workout in_progress for resuming later
  const doneForToday = async () => {
    setIsSaving(true);
    try {
      // Save any unsaved exercises that have at least one completed set
      for (let i = 0; i < exerciseStates.length; i++) {
        const state = exerciseStates[i];
        if (state.sets.some(s => s.completed)) {
          await saveExerciseInstance(i);
        }
      }

      // Save session duration and end time
      if (workoutSessionIdRef.current) {
        await supabase
          .from('workout_sessions')
          .update({
            ended_at: new Date().toISOString(),
            duration_seconds: elapsedSeconds,
          })
          .eq('id', workoutSessionIdRef.current);
      }

      // Keep workout in_progress (don't mark as completed)
      // Also update total duration on workout_instances for backward compatibility
      if (workoutInstanceId) {
        const completedCount = exerciseStates.filter(e => e.completed).length;
        await supabase
          .from('workout_instances')
          .update({
            status: 'in_progress',
            completion_status: completedCount === exerciseStates.length ? 'full' : 'partial',
            duration_seconds: elapsedSeconds,
          })
          .eq('id', workoutInstanceId);
      }

      const completedCount = exerciseStates.filter(e => e.completed).length;
      Alert.alert(
        '💪 Progress Saved!',
        `${completedCount}/${exerciseStates.length} exercises completed.\nDuration: ${formatTime(elapsedSeconds)}\nYou can continue this workout later.`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (err) {
      console.error('Error saving workout:', err);
      Alert.alert('Error', 'Failed to save progress');
    } finally {
      setIsSaving(false);
    }
  };

  const finishWorkout = async () => {
    setIsSaving(true);
    try {
      // Save any unsaved exercises
      for (let i = 0; i < exerciseStates.length; i++) {
        const state = exerciseStates[i];
        if (!state.completed && state.sets.some(s => s.completed)) {
          await saveExerciseInstance(i);
        }
      }

      // Save session duration and end time
      if (workoutSessionIdRef.current) {
        await supabase
          .from('workout_sessions')
          .update({
            ended_at: new Date().toISOString(),
            duration_seconds: elapsedSeconds,
          })
          .eq('id', workoutSessionIdRef.current);
      }

      // Update workout instance
      if (workoutInstanceId) {
        const allComplete = exerciseStates.every(e => e.completed);
        
        // Calculate total duration from all sessions
        const { data: sessions } = await supabase
          .from('workout_sessions')
          .select('duration_seconds')
          .eq('workout_instance_id', workoutInstanceId);
        
        const totalDuration = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || elapsedSeconds;
        
        await supabase
          .from('workout_instances')
          .update({
            status: 'completed',
            completion_status: allComplete ? 'full' : 'partial',
            completed_at: new Date().toISOString(),
            duration_seconds: totalDuration,
          })
          .eq('id', workoutInstanceId);
      }

      Alert.alert(
        '🎉 Workout Complete!',
        `Duration: ${formatTime(elapsedSeconds)}\nExercises: ${exerciseStates.filter(e => e.completed).length}/${exerciseStates.length}`,
        [{ text: 'Done', onPress: () => router.back() }]
      );
    } catch (err) {
      console.error('Error finishing workout:', err);
      Alert.alert('Error', 'Failed to save workout');
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#a78bfa" />
          <Text style={styles.loadingText}>Loading workout...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || !template || !currentExercise) {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContainer}>
          <Ionicons name="alert-circle-outline" size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error || 'Failed to load workout'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const targetRepsDisplay = currentExercise.exercise.target_reps_max && 
    currentExercise.exercise.target_reps_max !== currentExercise.exercise.target_reps_min
    ? `${currentExercise.exercise.target_reps_min}-${currentExercise.exercise.target_reps_max}`
    : `${currentExercise.exercise.target_reps_min}`;

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.headerButton}
          onPress={() => {
            Alert.alert(
              'Exit Workout?',
              'Your progress is automatically saved. You can continue this workout later.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Exit', onPress: () => router.back() },
              ]
            );
          }}
        >
          <Ionicons name="close" size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{template.name}</Text>
          <Text style={styles.headerSubtitle}>{formatTime(elapsedSeconds)}</Text>
        </View>
        
        <TouchableOpacity style={styles.headerButton} onPress={goToSummary}>
          <Ionicons name="grid-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Progress */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${(showSummary ? 100 : ((currentExerciseIndex + 1) / (exerciseStates.length + 1)) * 100)}%` },
            ]}
          />
        </View>
        {/* Exercise dots - tap or swipe to navigate */}
        <View style={styles.exerciseDots}>
          {exerciseStates.map((ex, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={() => {
                setShowSummary(false);
                setCurrentExerciseIndex(idx);
                scrollViewRef.current?.scrollTo({ y: 0, animated: true });
              }}
              style={[
                styles.exerciseDot,
                !showSummary && idx === currentExerciseIndex && styles.exerciseDotActive,
                ex.completed && styles.exerciseDotCompleted,
              ]}
            />
          ))}
          {/* Summary dot */}
          <TouchableOpacity
            onPress={goToSummary}
            style={[
              styles.exerciseDot,
              styles.exerciseDotSummary,
              showSummary && styles.exerciseDotActive,
            ]}
          >
            <Ionicons name="flag" size={6} color={showSummary ? '#fff' : '#6b7280'} />
          </TouchableOpacity>
        </View>
        <Text style={styles.progressText}>
          {showSummary ? 'Summary' : `${currentExerciseIndex + 1} / ${exerciseStates.length} exercises`} • Swipe to navigate
        </Text>
      </View>

      <Animated.View
        style={[styles.content, { transform: [{ translateX: swipeAnim }] }]}
        {...panResponder.panHandlers}
      >
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.contentContainer}>
        
        {/* Summary View */}
        {showSummary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Workout Summary</Text>
            <Text style={styles.summarySubtitle}>
              {exerciseStates.filter(e => e.completed).length} of {exerciseStates.length} exercises completed
            </Text>
            
            <View style={styles.summaryList}>
              {exerciseStates.map((state, idx) => {
                const exercise = getExercise(state.exercise);
                const completedSets = state.sets.filter(s => s.completed).length;
                const totalSets = state.sets.length;
                
                // Determine status
                let statusIcon: string;
                let statusColor: string;
                if (state.completed) {
                  statusIcon = 'checkmark-circle';
                  statusColor = '#4ade80';
                } else if (completedSets > 0) {
                  statusIcon = 'ellipse-outline';
                  statusColor = '#fbbf24';
                } else {
                  statusIcon = 'ellipse-outline';
                  statusColor = '#6b7280';
                }
                
                return (
                  <TouchableOpacity
                    key={idx}
                    style={styles.summaryRow}
                    onPress={() => goToExercise(idx)}
                  >
                    <Ionicons name={statusIcon as any} size={20} color={statusColor} />
                    <View style={styles.summaryRowContent}>
                      <Text style={styles.summaryExerciseName} numberOfLines={1}>
                        {exercise.name}
                      </Text>
                      <Text style={styles.summarySetCount}>
                        {completedSets}/{totalSets} sets
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="#6b7280" />
                  </TouchableOpacity>
                );
              })}
            </View>
            
            {/* Summary Action Buttons */}
            <View style={styles.summaryButtons}>
              {/* Done for Today - keeps workout in_progress for resuming later */}
              <TouchableOpacity
                style={[styles.actionButton, styles.doneForTodayButton]}
                onPress={doneForToday}
                disabled={isSaving}
              >
                <Ionicons name="pause-circle" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Done for Today</Text>
              </TouchableOpacity>
              
              {/* Finish Workout - marks workout as completed */}
              <TouchableOpacity
                style={[styles.actionButton, styles.finishButton]}
                onPress={finishWorkout}
                disabled={isSaving}
              >
                {isSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Finish Workout</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : (
        
        /* Exercise Card */
        <View style={styles.exerciseCard}>
          {/* Exercise Image/Icon - Stack all images, show current with opacity */}
          <View style={styles.exerciseImageContainer}>
            {exerciseStates.map((state, idx) => {
              const exercise = getExercise(state.exercise);
              const imageUrl = exerciseImages[exercise.id] || exercise.image_url;
              const isCurrent = idx === currentExerciseIndex;
              
              if (imageUrl) {
                return (
                  <Image
                    key={`img-${exercise.id}`}
                    source={{ uri: imageUrl }}
                    style={[
                      styles.exerciseImageReal,
                      { 
                        position: idx === 0 ? 'relative' : 'absolute',
                        top: 0,
                        left: 0,
                        opacity: isCurrent ? 1 : 0,
                      }
                    ]}
                    resizeMode="cover"
                    fadeDuration={0}
                  />
                );
              } else if (isCurrent) {
                return (
                  <TouchableOpacity
                    key={`placeholder-${exercise.id}`}
                    style={styles.exerciseImagePlaceholder}
                    onPress={handleGenerateImage}
                    disabled={generatingImage}
                  >
                    {generatingImage ? (
                      <>
                        <ActivityIndicator size="small" color="#a78bfa" />
                        <Text style={styles.generateImageText}>Generating...</Text>
                      </>
                    ) : (
                      <>
                        <Ionicons name="image-outline" size={32} color="#6b7280" />
                        <Text style={styles.generateImageText}>Generate Image</Text>
                      </>
                    )}
                  </TouchableOpacity>
                );
              }
              return null;
            })}
          </View>

          {/* Exercise Info */}
          <Text style={styles.exerciseName}>{getExercise(currentExercise.exercise).name}</Text>
          <Text style={styles.exerciseTarget}>
            {currentExercise.exercise.target_sets} sets × {targetRepsDisplay} reps
          </Text>
          {currentExercise.last_weight && (
            <Text style={styles.lastPerformance}>
              Last: {currentExercise.last_reps} × {currentExercise.last_weight} lbs
            </Text>
          )}

          {/* Warmup Section */}
          <View style={styles.setsSection}>
            <View style={styles.setsSectionHeader}>
              <Text style={styles.setsSectionTitle}>Warmup Sets</Text>
              <TouchableOpacity onPress={addWarmupSet}>
                <Text style={styles.addWarmupText}>+ Add</Text>
              </TouchableOpacity>
            </View>
            {currentExercise.sets.filter(s => s.is_warmup).map((set, idx) => {
              const actualIdx = currentExercise.sets.findIndex(s => s.is_warmup && s.set_number === set.set_number);
              const isActiveSet = !set.completed && activeSetIndex === actualIdx;
              return (
                <SetEntryRow
                  key={`warmup-${idx}`}
                  set={set}
                  setIndex={actualIdx}
                  targetReps={targetRepsDisplay}
                  onUpdate={(updates) => updateSet(currentExerciseIndex, actualIdx, updates)}
                  onComplete={handleSetComplete}
                  onEdit={() => editSet(currentExerciseIndex, actualIdx)}
                  onDelete={() => deleteSet(currentExerciseIndex, actualIdx, true)}
                  isActive={isActiveSet}
                  suggestedWeight={currentExercise.last_weight ? Math.round(currentExercise.last_weight * 0.5) : undefined}
                  isTimerRunning={isActiveSet && activeSetTimer !== null}
                  onStartTimer={handleStartSetTimer}
                  onStopTimer={handleStopSetTimer}
                  timerSeconds={isActiveSet ? setTimerSeconds : 0}
                />
              );
            })}
            {currentExercise.sets.filter(s => s.is_warmup).length === 0 && (
              <Text style={styles.noWarmupsText}>No warmup sets added</Text>
            )}
          </View>

          {/* Working Sets Section */}
          <View style={styles.setsSection}>
            <Text style={styles.setsSectionTitle}>Working Sets</Text>
            {currentExercise.sets.filter(s => !s.is_warmup).map((set, idx) => {
              const actualIdx = currentExercise.sets.findIndex(
                s => !s.is_warmup && s.set_number === set.set_number
              );
              const isActiveSet = !set.completed && activeSetIndex === actualIdx;
              return (
                <SetEntryRow
                  key={`set-${set.set_number}`}
                  set={set}
                  setIndex={actualIdx}
                  targetReps={targetRepsDisplay}
                  onUpdate={(updates) => updateSet(currentExerciseIndex, actualIdx, updates)}
                  onComplete={handleSetComplete}
                  onEdit={() => editSet(currentExerciseIndex, actualIdx)}
                  onDelete={() => deleteSet(currentExerciseIndex, actualIdx, false)}
                  isActive={isActiveSet}
                  suggestedWeight={currentExercise.last_weight}
                  isTimerRunning={isActiveSet && activeSetTimer !== null}
                  onStartTimer={handleStartSetTimer}
                  onStopTimer={handleStopSetTimer}
                  timerSeconds={isActiveSet ? setTimerSeconds : 0}
                />
              );
            })}
          </View>

          {/* Exercise Notes */}
          <View style={styles.notesSection}>
            <Text style={styles.notesSectionTitle}>Exercise Notes</Text>
            <TextInput
              style={styles.notesInput}
              value={currentExercise.notes}
              onChangeText={(text) => {
                setExerciseStates(prev => {
                  const newStates = [...prev];
                  newStates[currentExerciseIndex].notes = text;
                  return newStates;
                });
              }}
              placeholder="Add notes..."
              placeholderTextColor="#6b7280"
              multiline
            />
          </View>

          {/* Exercise Difficulty */}
          <View style={styles.exerciseDifficultySection}>
            <Text style={styles.notesSectionTitle}>Exercise Difficulty</Text>
            <DifficultyPicker
              value={currentExercise.difficulty}
              onChange={(d) => {
                setExerciseStates(prev => {
                  const newStates = [...prev];
                  newStates[currentExerciseIndex].difficulty = d;
                  return newStates;
                });
              }}
              increaseWeight={currentExercise.increase_weight_next}
              onIncreaseWeightChange={(v) => {
                setExerciseStates(prev => {
                  const newStates = [...prev];
                  newStates[currentExerciseIndex].increase_weight_next = v;
                  return newStates;
                });
              }}
            />
          </View>
        </View>
        )}
        </ScrollView>
      </Animated.View>

      {/* Bottom Actions - only show when not on summary */}
      {!showSummary && (
        <View style={styles.bottomActions}>
          <TouchableOpacity
            style={[
              styles.actionButton,
              currentExercise?.completed ? styles.completedButton : styles.nextButton
            ]}
            onPress={toggleExerciseComplete}
          >
            {currentExercise?.completed ? (
              <>
                <Ionicons name="checkmark-circle" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Completed</Text>
              </>
            ) : (
              <Text style={styles.actionButtonText}>Mark as Completed</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Rest Timer Modal */}
      <Modal visible={showRestTimer} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.restTimerModal}>
            <Text style={styles.restTimerTitle}>REST TIME</Text>
            <Text style={styles.restTimerTime}>{formatTime(restSeconds)}</Text>
            <TouchableOpacity
              style={styles.restTimerButton}
              onPress={() => {
                setShowRestTimer(false);
                setRestSeconds(0);
              }}
            >
              <Text style={styles.restTimerButtonText}>Done Resting</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

// ============================================================
// Styles
// ============================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0F1E',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  loadingText: {
    color: '#9ca3af',
    marginTop: 12,
    fontSize: 16,
  },
  errorText: {
    color: '#ef4444',
    marginTop: 12,
    fontSize: 16,
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#1f2937',
    borderRadius: 8,
  },
  backButtonText: {
    color: '#a78bfa',
    fontSize: 16,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#9ca3af',
    fontSize: 13,
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#1f2937',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#a78bfa',
  },
  progressText: {
    color: '#6b7280',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  exerciseDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  exerciseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#374151',
  },
  exerciseDotActive: {
    backgroundColor: '#a78bfa',
    width: 24,
  },
  exerciseDotCompleted: {
    backgroundColor: '#4ade80',
  },
  exerciseDotSummary: {
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },

  // Exercise Card
  exerciseCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  exerciseImageContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  exerciseImage: {
    width: 80,
    height: 80,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
  },
  exerciseImageReal: {
    width: '100%',
    height: 160,
    borderRadius: 12,
  },
  exerciseImagePlaceholder: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    backgroundColor: '#1f2937',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#374151',
    borderStyle: 'dashed',
  },
  generateImageText: {
    color: '#6b7280',
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  exerciseName: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
  },
  exerciseTarget: {
    color: '#a78bfa',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 4,
  },
  lastPerformance: {
    color: '#6b7280',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },

  // Sets Section
  setsSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  setsSectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  setsSectionTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addWarmupText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '500',
  },
  noWarmupsText: {
    color: '#6b7280',
    fontSize: 14,
    fontStyle: 'italic',
  },

  // Set Rows - Completed (new design)
  setRowCompletedNew: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 10,
    marginBottom: 8,
    overflow: 'hidden',
  },
  deleteSwipeAction: {
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    width: 80,
    borderRadius: 10,
    marginBottom: 8,
  },
  deleteSwipeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
  },
  setRowCompletedMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  setNumberBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4ade80',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberText: {
    color: '#0A0F1E',
    fontSize: 12,
    fontWeight: '700',
  },
  warmupBadge: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warmupBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  setWeightReps: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  difficultyBadgeSmall: {
    backgroundColor: '#374151',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  difficultyBadgeText: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '600',
  },
  setDurationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  setDurationText: {
    color: '#9ca3af',
    fontSize: 11,
  },
  restIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(107, 114, 128, 0.2)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(107, 114, 128, 0.3)',
  },
  restIndicatorText: {
    color: '#6b7280',
    fontSize: 11,
  },
  // Legacy completed row (keeping for compatibility)
  setRowCompleted: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 8,
    marginBottom: 8,
  },
  setRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setLabel: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '500',
  },
  setCompletedText: {
    color: '#4ade80',
    fontSize: 14,
  },
  setRowPending: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1f2937',
    borderRadius: 8,
    marginBottom: 8,
  },
  pendingCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#4b5563',
  },
  setNumberBadgePending: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#374151',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberTextPending: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  warmupBadgePending: {
    backgroundColor: '#4b5563',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  warmupBadgeTextPending: {
    color: '#9ca3af',
    fontSize: 10,
    fontWeight: '600',
  },
  setLabelPending: {
    color: '#6b7280',
    fontSize: 14,
  },
  setPendingText: {
    color: '#6b7280',
    fontSize: 14,
  },
  setRowActive: {
    backgroundColor: '#1e1b4b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#a78bfa',
  },
  setRowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  setRowHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setNumberBadgeActive: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#a78bfa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  setNumberTextActive: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  warmupBadgeActive: {
    backgroundColor: '#7c3aed',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 4,
  },
  warmupBadgeTextActive: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  timerStartButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  timerStartText: {
    color: '#4ade80',
    fontSize: 12,
    fontWeight: '600',
  },
  timerRunning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  timerRunningText: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  setLabelActive: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  suggestionRow: {
    marginBottom: 12,
  },
  suggestionText: {
    color: '#fbbf24',
    fontSize: 13,
  },

  // Inputs
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  inputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    width: 80,
    height: 48,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#374151',
  },
  inputLabel: {
    color: '#9ca3af',
    fontSize: 14,
  },
  inputSeparator: {
    color: '#6b7280',
    fontSize: 20,
  },

  // Difficulty
  difficultyContainer: {
    marginBottom: 12,
  },
  difficultyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 8,
  },
  difficultyButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#1f2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  difficultyButtonCompact: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  difficultyButtonActive: {
    backgroundColor: '#7c3aed',
    borderColor: '#a78bfa',
  },
  difficultyButtonText: {
    color: '#9ca3af',
    fontSize: 12,
    fontWeight: '600',
  },
  difficultyButtonTextCompact: {
    fontSize: 11,
  },
  difficultyButtonTextActive: {
    color: '#fff',
  },
  increaseWeightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  increaseWeightText: {
    color: '#9ca3af',
    fontSize: 13,
  },

  // Log Set Button
  logSetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#7c3aed',
    paddingVertical: 12,
    borderRadius: 8,
  },
  logSetButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },

  // Notes
  notesSection: {
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  notesSectionTitle: {
    color: '#e5e7eb',
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  notesInput: {
    backgroundColor: '#1f2937',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 60,
    textAlignVertical: 'top',
  },

  // Exercise Difficulty
  exerciseDifficultySection: {
    marginTop: 16,
  },

  // Bottom Actions
  bottomActions: {
    padding: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: '#1f2937',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 12,
  },
  nextButton: {
    backgroundColor: '#7c3aed',
  },
  completedButton: {
    backgroundColor: '#059669',
  },
  finishButton: {
    backgroundColor: '#059669',
  },
  
  // Summary View Styles
  summaryCard: {
    backgroundColor: '#111827',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#1f2937',
  },
  summaryTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 4,
  },
  summarySubtitle: {
    color: '#9ca3af',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  summaryList: {
    gap: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f2937',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  summaryRowContent: {
    flex: 1,
  },
  summaryExerciseName: {
    color: '#e5e7eb',
    fontSize: 15,
    fontWeight: '500',
  },
  summarySetCount: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 2,
  },
  summaryButtons: {
    marginTop: 24,
    gap: 12,
  },
  doneForTodayButton: {
    backgroundColor: '#6366f1',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
  },

  // Rest Timer Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  restTimerModal: {
    backgroundColor: '#1f2937',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    minWidth: 280,
  },
  restTimerTitle: {
    color: '#9ca3af',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 2,
    marginBottom: 16,
  },
  restTimerTime: {
    color: '#fff',
    fontSize: 64,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  restTimerButton: {
    marginTop: 32,
    paddingVertical: 14,
    paddingHorizontal: 32,
    backgroundColor: '#7c3aed',
    borderRadius: 10,
  },
  restTimerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
