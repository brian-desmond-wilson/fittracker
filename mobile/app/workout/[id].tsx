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
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  PanResponder,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import {
  Timer,
  Check,
  AlertCircle,
  X,
  LayoutGrid,
  Flag,
  CheckCircle2,
  Circle,
  ChevronRight,
  PauseCircle,
  Play,
  Image as ImageIcon,
} from 'lucide-react-native';
import { colors } from '@/src/lib/colors';
import { colors as tokens } from '@/src/theme/tokens';
import { supabase } from '@/src/lib/supabase';
import { acceptSession, completeSession } from '@/src/lib/supabase/daily';
import { blockDayShape, BLOCK_TITLES } from '@/src/lib/dailyBlockCompose';
import {
  buildChapterSteps,
  chapterBlocks,
  blockProgress,
  crossedBoundary,
} from '@/src/lib/dailyChapters';
import type { ChapterBlockRow } from '@/src/lib/dailyChapters';
import { builtinByKey } from '@/src/lib/dailyBuiltins';
import type { BlockRole } from '@/src/types/dailyBlocks';
import type { SessionSection } from '@/src/types/daily';
import { fetchCapturedWorkout } from '@/src/lib/supabase/capture';
import { formatWorkoutItem } from '@/src/lib/workoutFormat';
import { assignInstancesToOccurrences } from '@/src/lib/workoutResume';
import { formatSetTimeChip, resolveSession, setKey } from '@/src/lib/setTiming';
import type { SetTimeInput } from '@/src/lib/setTiming';
import { SetTimeSheet } from '@/src/components/workout-session/SetTimeSheet';
import type { CapturedWorkoutEntry } from '@/src/types/capture';

import {
  SCREEN_WIDTH,
  getLocalDateString,
  getExercise,
  generateExerciseImage,
} from '@/src/components/workout-session/helpers';
import * as WebBrowser from 'expo-web-browser';
import {
  Exercise,
  WorkoutTemplate,
  SetEntry,
  ExerciseState,
  ExerciseSourceLink,
} from '@/src/components/workout-session/types';
import { styles } from '@/src/components/workout-session/styles';
import { DifficultyPicker } from '@/src/components/workout-session/DifficultyPicker';
import { SetEntryRow } from '@/src/components/workout-session/SetEntryRow';
import { elapsedSecondsSince, formatDuration } from '@/src/lib/timeFormat';
import { TickingDuration } from '@/src/components/workout-session/TickingDuration';

// ============================================================
// Main Workout Session Component
// ============================================================

export default function WorkoutSessionPage() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, instanceId, programInstanceId, mode, recordMode: recordModeParam, startedAtMs } =
    useLocalSearchParams<{
      id: string; instanceId?: string; programInstanceId?: string; mode?: string;
      recordMode?: string; startedAtMs?: string;
    }>();
  // Daily mode: `id` is a generated_sessions.id, parentage is NULL, and the
  // template shape is built from generated_session_items instead of a program.
  const isDaily = mode === 'daily';
  
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [template, setTemplate] = useState<WorkoutTemplate | null>(null);
  // Set when this session is a captured workout served whole. Its prescription
  // is SHOWN, never parsed into the logger's numbers: "21-15-9" and "AMRAP"
  // are real answers that a rep field would silently turn into something else.
  const [servedWorkout, setServedWorkout] = useState<CapturedWorkoutEntry | null>(null);
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
  // Live runs the per-set timer; backfill replaces it with times you type in.
  // Held in state, not read from the param each render, so the header can flip
  // it when you answered the question on the way in wrongly.
  const [recordMode, setRecordMode] = useState<'live' | 'backfill'>(
    recordModeParam === 'backfill' ? 'backfill' : 'live',
  );
  const [timingSetIndex, setTimingSetIndex] = useState<number | null>(null);
  
  const [exerciseStates, setExerciseStates] = useState<ExerciseState[]>([]);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);

  // ---- Chapter walk (composed days only) ----
  // A composed day is performed one block at a time, so the carousel walks
  // STEPS rather than exercises: every exercise is a step, and a block of
  // built-in movements is a step with nothing to log. For everything else —
  // program workouts, captured workouts served whole, pre-block sessions —
  // `sessionBlocks` stays empty, steps map 1:1 onto exercises, and this whole
  // layer is inert.
  const [sessionBlocks, setSessionBlocks] = useState<ChapterBlockRow[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  // The chapter card between blocks. Shown once per seam, crossing forward.
  const [transition, setTransition] = useState<{ from: BlockRole; to: BlockRole } | null>(null);
  // Built-in movements you've ticked off, keyed `${builtinKey}:${movement}`.
  // Local to the session: a built-in has no exercise rows, so there is nothing
  // to write and nothing to resume.
  const [builtinTicks, setBuiltinTicks] = useState<Record<string, boolean>>({});
  // When each block was entered, for the chapter card's recap. A block the
  // session resumed into mid-way has no honest start time, so it has no entry
  // here and the card simply omits the time.
  const blockEnteredAtRef = React.useRef<Partial<Record<BlockRole, number>>>({});
  // Seams whose chapter card has already been shown. A ref, not state: it must
  // survive re-renders without causing them, and it is deliberately not
  // persisted — swiping back and forth re-shows nothing, a fresh session does.
  const shownSeamsRef = React.useRef<Set<string>>(new Set());
  // ---- Source tap-backs: the video a movement was captured from ----
  // A block's exercises come from its workout, so the workout's source is the
  // exact programming being performed; an exercise that arrived from some
  // other post falls back to its own newest capture. Keyed maps rather than
  // per-item fields because the same exercise can appear under two blocks.
  const [blockSource, setBlockSource] =
    useState<Partial<Record<BlockRole, ExerciseSourceLink>>>({});
  // The creator's per-movement note from the block's workout, keyed
  // `${block}:${exerciseId}` — often the form cue you want mid-set.
  const [blockNotes, setBlockNotes] = useState<Record<string, string>>({});
  const [exerciseSource, setExerciseSource] =
    useState<Record<string, ExerciseSourceLink>>({});
  // The exercise a resumed session should land on, consumed once the steps
  // exist. Null when starting fresh, which lands on step 0.
  const resumeExerciseRef = React.useRef<number | null>(null);
  
  const [showRestTimer, setShowRestTimer] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [exerciseImages, setExerciseImages] = useState<Record<string, string>>({});
  
  // Set timer state
  const [activeSetTimer, setActiveSetTimer] = useState<number | null>(null); // timestamp when started
  const [lastSetCompletedAt, setLastSetCompletedAt] = useState<number | null>(null);
  
  // Summary view state (index === exerciseStates.length means we're on summary)
  const [showSummary, setShowSummary] = useState(false);
  
  // ScrollView ref for scrolling to top on exercise change
  const scrollViewRef = React.useRef<ScrollView>(null);
  
  // Swipe gesture handling
  const swipeAnim = React.useRef(new Animated.Value(0)).current;
  
  // Refs to track current values for panResponder (avoids stale closure).
  // The walk is over STEPS now, so these track the step list; on a session
  // with no blocks a step IS an exercise and the numbers are the same ones
  // this handler always used.
  const stepIndexRef = React.useRef(0);
  const stepsLengthRef = React.useRef(0);
  const showSummaryRef = React.useRef(false);
  // The chapter card is an overlay over the step it arrived on, so a swipe has
  // to know it is up: forward dismisses it, back also steps away.
  const transitionRef = React.useRef(false);
  // goToStep closes over state that changes every render; the handler is built
  // once, so it reaches the current one through here.
  const goToStepRef = React.useRef<(next: number) => void>(() => {});

  // Keep refs in sync with state
  React.useEffect(() => {
    stepIndexRef.current = stepIndex;
  }, [stepIndex]);

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
        const currentIdx = stepIndexRef.current;
        const totalExercises = stepsLengthRef.current;
        const onSummary = showSummaryRef.current;

        // The chapter card sits over the step it announced: swiping forward
        // dismisses it into that step, swiping back leaves the block again.
        if (transitionRef.current) {
          if (gestureState.dx < -SWIPE_THRESHOLD) {
            setTransition(null);
          } else if (gestureState.dx > SWIPE_THRESHOLD) {
            setTransition(null);
            goToStepRef.current(currentIdx - 1);
          }
          Animated.spring(swipeAnim, { toValue: 0, useNativeDriver: true }).start();
          return;
        }

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
                goToStepRef.current(currentIdx + 1);
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
              goToStepRef.current(currentIdx - 1);
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

  // The three timers tick inside `TickingDuration` now, so a running clock
  // re-renders one Text rather than this whole screen. What the screen still
  // owns is the start times, which is all the save paths need.
  //
  // `startedAt` is the workout's start even when resuming — a paused session
  // sets it back by the duration already banked — so elapsed time is always
  // derivable and never needs storing.
  const elapsedSeconds = () => (startedAt ? elapsedSecondsSince(startedAt.getTime()) : 0);

  // The rest modal counts from the moment it opens — finishing a set — rather
  // than from whenever this screen mounted.
  const [restStartedAt, setRestStartedAt] = useState<number>(() => Date.now());
  useEffect(() => {
    if (showRestTimer) setRestStartedAt(Date.now());
  }, [showRestTimer]);

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
    // Starting the next set IS the end of resting — dismissing by hand as
    // well would be a second tap for something already said.
    setShowRestTimer(false);
  };

  const handleStopSetTimer = () => {
    setActiveSetTimer(null);
  };

  const handleSetComplete = () => {
    const now = Date.now();
    setLastSetCompletedAt(now);
    setActiveSetTimer(null);
    // Finishing a set is when rest starts, so that is when the timer appears.
    // It had no opener at all before this — the modal was unreachable.
    setShowRestTimer(true);
  };

  const clockLabel = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  /** What one set carries: a real span, a bare duration, or nothing yet. */
  const setTimeInputOf = (set: SetEntry): SetTimeInput =>
    set.started_at !== null && set.completed_at !== null
      ? { kind: 'span', startMs: set.started_at, endMs: set.completed_at }
      : set.duration_seconds !== null
        ? { kind: 'duration', seconds: set.duration_seconds }
        : { kind: 'none' };

  /**
   * How long the session took, and when it ended.
   *
   * Live measures the wall clock. Backfill cannot: the workout happened this
   * morning and you are logging it this evening, so elapsed time would call a
   * forty-minute session ten hours long. Its length is the span of the sets
   * you entered instead.
   */
  const recordedSpan = (): { durationSeconds: number; endedAtIso: string } => {
    if (recordMode !== 'backfill') {
      return { durationSeconds: elapsedSeconds(), endedAtIso: new Date().toISOString() };
    }
    const { resolvedByKey } = sessionTimes();
    let earliest: number | null = null;
    let latest: number | null = null;
    resolvedByKey.forEach((r) => {
      if (r.startMs !== null) earliest = earliest === null ? r.startMs : Math.min(earliest, r.startMs);
      if (r.endMs !== null) latest = latest === null ? r.endMs : Math.max(latest, r.endMs);
    });
    // No set carries a time yet — the session is the instant you said it
    // started, not the hours since.
    const anchor = startedAt?.getTime() ?? Date.now();
    const start = earliest ?? anchor;
    const end = latest ?? anchor;
    return {
      durationSeconds: Math.max(0, Math.round((end - start) / 1000)),
      endedAtIso: new Date(end).toISOString(),
    };
  };

  // One resolution for the whole session, used to draw the chips AND to write
  // the rows — computing it twice is how the two would drift apart.
  const sessionTimes = () =>
    resolveSession(
      startedAt?.getTime() ?? Date.now(),
      exerciseStates.flatMap((state, exIdx) =>
        state.sets.map((set, setIdx) => ({
          exIdx,
          setIdx,
          input: setTimeInputOf(set),
        })),
      ),
    );

  const loadWorkout = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch template with exercises
      let sortedExercises: any[];
      let templateName = '';
      let sessionRow: { id: string; workout_instance_id: string | null } | null = null;

      if (isDaily) {
        const { data: sessionData, error: sessionError } = await supabase
          .from('generated_sessions')
          .select(`
            id, split_day, workout_instance_id, served_captured_workout_id,
            blocks:generated_session_blocks(
              block, name, minutes, builtin_key, captured_workout_id, dismissed,
              workout:captured_workouts(
                source:captured_sources(platform, source_url, poster_handle, thumbnail_url),
                movements:captured_workout_exercises(exercise_id, notes)
              )
            ),
            items:generated_session_items(
              id, exercise_id, item_order, section, target_sets, target_reps,
              rest_seconds,
              exercises ( id, name, image_url )
            )
          `)
          .eq('id', id)
          .single();
        if (sessionError) throw sessionError;
        sessionRow = { id: sessionData.id, workout_instance_id: sessionData.workout_instance_id };

        const served = sessionData.served_captured_workout_id
          ? await fetchCapturedWorkout(sessionData.served_captured_workout_id)
          : null;
        setServedWorkout(served);
        // A workout served whole carries its own name; a block day is named
        // after its main workout. With no main it is a recovery day or a day
        // the catalog couldn't field one for — `blockDayShape` tells the two
        // apart, and reading either as "Recovery Day" put the wrong reason in
        // the header. Only an exercise-level session is named after a split —
        // a block day stamps none, and reading a NULL split as legs called
        // every one of them a leg day.
        const blocks = (sessionData as any).blocks ?? [];
        const mainBlock = blocks.find((b: any) => b.block === 'main');
        const shape = blockDayShape(blocks);
        templateName = served
          ? served.name
          : mainBlock ? mainBlock.name
            : shape === 'recovery' ? 'Recovery Day'
              : shape === 'thin' ? 'Support Work'
                : sessionData.split_day === 'push' ? 'Push Day'
                  : sessionData.split_day === 'pull' ? 'Pull Day' : 'Leg Day';
        // The block plan drives the chapter walk — see dailyChapters.ts. Rows
        // ride in the order they were stored; buildChapterSteps orders them.
        setSessionBlocks(
          (blocks as any[]).map((b) => ({
            block: b.block,
            name: b.name,
            minutes: b.minutes ?? 0,
            builtinKey: b.builtin_key ?? null,
            workoutId: b.captured_workout_id ?? null,
            dismissed: !!b.dismissed,
          })),
        );
        // Each block's tap-back and the creator's per-movement notes, off the
        // same rows. A block whose workout was deleted simply has neither.
        const perBlockSource: Partial<Record<BlockRole, ExerciseSourceLink>> = {};
        const perBlockNotes: Record<string, string> = {};
        for (const b of blocks as any[]) {
          const src = b.workout?.source;
          if (src?.source_url) {
            perBlockSource[b.block as BlockRole] = {
              url: src.source_url,
              platform: src.platform ?? 'other',
              handle: src.poster_handle ?? null,
              thumbnailUrl: src.thumbnail_url ?? null,
            };
          }
          for (const m of b.workout?.movements ?? []) {
            if (m.notes) perBlockNotes[`${b.block}:${m.exercise_id}`] = m.notes;
          }
        }
        setBlockSource(perBlockSource);
        setBlockNotes(perBlockNotes);
        sortedExercises = [...(sessionData.items || [])]
          .sort((a: any, b: any) => a.item_order - b.item_order)
          .map((item: any) => ({
            id: item.id, // session item id — NEVER written as program_workout_exercise_id
            exercise_id: item.exercise_id,
            exercise_order: item.item_order,
            // ONE set when the creator wrote no set count — a captured
            // routine is performed once per round, and the block's rounds
            // note carries the repeats. The old default of 3 invented sets
            // the creator never prescribed.
            target_sets: item.target_sets ?? 1,
            // Seeds the logger's numeric input only; the header shows
            // raw_reps, the creator's own words.
            target_reps_min: parseInt(item.target_reps ?? '', 10) || 8,
            raw_reps: item.target_reps ?? null,
            target_reps_max: null,
            superset_group: null,
            exercises: item.exercises,
            // Carried so the screen can chapter the walk; the logger itself
            // never reads it.
            section: item.section ?? null,
          }));
        setTemplate({
          id: sessionData.id,
          name: templateName,
          day_number: 0,
          week_number: 0,
          program_workout_exercises: sortedExercises,
        } as unknown as WorkoutTemplate);
      } else {
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
        sortedExercises = [...(workoutData.program_workout_exercises || [])]
          .sort((a, b) => a.exercise_order - b.exercise_order);

        setTemplate({
          ...workoutData,
          program_workout_exercises: sortedExercises,
        } as unknown as WorkoutTemplate);
      }

      // The fallback tap-back: each exercise's own newest reviewed capture,
      // for movements that arrived from a different post than their block's
      // workout — and for program workouts, which have no blocks at all.
      // Client-side filter on owner and status, same pattern as
      // fetchCandidateData: the junction has no user_id of its own.
      {
        const ids = [...new Set(sortedExercises.map((e: any) => e.exercise_id))];
        if (ids.length > 0) {
          const { data: srcRows } = await supabase
            .from('source_exercises')
            .select(`
              exercise_id,
              source:captured_sources!inner(
                user_id, extraction_status, platform, source_url,
                poster_handle, thumbnail_url, captured_at
              )
            `)
            .in('exercise_id', ids);
          const newest: Record<string, { at: string; link: ExerciseSourceLink }> = {};
          for (const row of (srcRows ?? []) as any[]) {
            const s = row.source;
            if (!s || s.user_id !== userId || s.extraction_status !== 'reviewed') continue;
            if (!s.source_url) continue;
            const prior = newest[row.exercise_id];
            if (prior && prior.at >= (s.captured_at ?? '')) continue;
            newest[row.exercise_id] = {
              at: s.captured_at ?? '',
              link: {
                url: s.source_url,
                platform: s.platform ?? 'other',
                handle: s.poster_handle ?? null,
                thumbnailUrl: s.thumbnail_url ?? null,
              },
            };
          }
          setExerciseSource(
            Object.fromEntries(Object.entries(newest).map(([k, v]) => [k, v.link])),
          );
        }
      }

      // A daily session already linked to an instance resumes into it even when
      // the caller passed no instanceId param.
      const effectiveInstanceId = instanceId || sessionRow?.workout_instance_id || null;

      // Prefetch all exercise images for smooth transitions
      const imageUrls = sortedExercises
        .map(ex => (ex.exercises as any)?.image_url || ex.exercises?.[0]?.image_url)
        .filter((url): url is string => !!url);
      
      imageUrls.forEach(url => {
        Image.prefetch(url).catch(() => {}); // Silently ignore failures
      });

      // Fetch last performance for suggestions. Kick it off now but don't block
      // on it — it runs concurrently with the resume-state queries below. Bounded
      // by limit so it doesn't scale with training history (we keep only the
      // most recent working set per exercise).
      const exerciseIds = sortedExercises.map(e => e.exercise_id);
      const lastSetsPromise = supabase
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
        .order('created_at', { ascending: false })
        .limit(Math.max(exerciseIds.length, 1) * 10);

      // If resuming an existing workout, load saved exercise/set data.
      // Keyed by TEMPLATE POSITION, not exercise id — a session can repeat a
      // movement, and id-keying once handed both occurrences the same
      // instance (logging the second overwrote the first's sets).
      let existingExerciseData: Record<number, {
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

      if (effectiveInstanceId) {
        // Fetch workout instance to get started_at and duration_seconds
        const { data: workoutInstance } = await supabase
          .from('workout_instances')
          .select('started_at, duration_seconds')
          .eq('id', effectiveInstanceId)
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
          .eq('workout_instance_id', effectiveInstanceId)
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
          .eq('workout_instance_id', effectiveInstanceId)
          .order('exercise_order');

        if (existingExercises) {
          const assigned = assignInstancesToOccurrences(
            sortedExercises.map((e) => e.exercise_id),
            existingExercises,
          );
          for (const [exIdx, ex] of assigned) {
            existingExerciseData[exIdx] = {
              exercise_instance_id: ex.id,
              status: ex.status,
              sets: ((ex as any).set_instances || []).sort(
                (a: any, b: any) => a.set_number - b.set_number,
              ),
            };
            // Also populate the ref for race condition safety
            exerciseInstanceIdsRef.current[exIdx] = ex.id;
          }
        }
      }

      // Resolve last performance now (it ran concurrently with the queries above)
      const { data: lastSets } = await lastSetsPromise;
      const lastPerf: Record<string, { weight: number; reps: number }> = {};
      if (lastSets) {
        for (const s of lastSets) {
          const exId = (s.exercise_instances as any)?.exercise_id;
          if (exId && !lastPerf[exId] && s.weight_lbs) {
            lastPerf[exId] = { weight: s.weight_lbs, reps: s.actual_reps || 0 };
          }
        }
      }

      // Initialize exercise states (with existing data if resuming)
      const states: ExerciseState[] = sortedExercises.map((ex, exIdx) => {
        const existing = existingExerciseData[exIdx];
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
          duration_seconds: null,
          timing_source: null,
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
              duration_seconds: null,
              timing_source: null,
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
            duration_seconds: null,
            timing_source: null,
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
      
      // If resuming, find first incomplete exercise to start from. The step
      // the walk resumes ON is settled by the effect below, which maps this
      // exercise onto its chapter once the block rows have landed.
      if (effectiveInstanceId) {
        const firstIncompleteIdx = states.findIndex(s => !s.completed);
        if (firstIncompleteIdx > 0) {
          setCurrentExerciseIndex(firstIncompleteIdx);
          resumeExerciseRef.current = firstIncompleteIdx;
        }
      }
      
      // For resuming with saved duration: set startedAt so elapsed calculation works correctly
      // If we have saved duration, fake the startedAt to be (now - duration) so ticker continues from saved time
      if (savedDurationSeconds > 0) {
        setStartedAt(new Date(Date.now() - savedDurationSeconds * 1000));
      } else {
        // Use existing started_at if resuming; otherwise the time you said the
        // workout happened, falling back to now for a live session.
        const givenStart = startedAtMs ? new Date(Number(startedAtMs)) : null;
        setStartedAt(
          workoutStartedAt ||
            (givenStart && !Number.isNaN(givenStart.getTime()) ? givenStart : new Date()),
        );
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const currentExercise = exerciseStates[currentExerciseIndex];
  const activeSetIndex = currentExercise?.sets.findIndex(s => !s.completed) ?? -1;

  // ---- Chapter derivations ----
  const steps = React.useMemo(
    () => buildChapterSteps(
      exerciseStates.map(
        (s) => (s.exercise.section ?? null) as SessionSection | null,
      ),
      sessionBlocks,
    ),
    [exerciseStates, sessionBlocks],
  );
  const chapters = React.useMemo(
    () => chapterBlocks(steps, sessionBlocks),
    [steps, sessionBlocks],
  );
  /** A chaptered day is the only one that changes shape; everything else keeps
   *  the flat carousel it has always had. */
  const chaptered = chapters.length > 0;
  const currentStep = steps[stepIndex] ?? null;
  const progress = blockProgress(steps, stepIndex);
  const currentChapterIdx = chapters.findIndex((c) => c.block === currentStep?.block);
  const builtinRoutine =
    currentStep?.kind === 'builtin' ? builtinByKey(currentStep.builtinKey) : null;

  /** The tap-back for the exercise on screen: its block's workout first (the
   *  exact programming being performed), its own newest capture otherwise.
   *  Null for stock movements that were never captured from anywhere. */
  const currentSource: ExerciseSourceLink | null =
    currentStep?.kind === 'exercise'
      ? (currentStep.block ? blockSource[currentStep.block] : undefined)
          ?? exerciseSource[exerciseStates[currentStep.exerciseIndex]?.exercise.exercise_id]
          ?? null
      : null;
  const currentSourceNote =
    currentStep?.kind === 'exercise' && currentStep.block
      ? blockNotes[
          `${currentStep.block}:${exerciseStates[currentStep.exerciseIndex]?.exercise.exercise_id}`
        ] ?? null
      : null;

  const PLATFORM_LABEL: Record<string, string> = {
    instagram: 'Instagram', tiktok: 'TikTok', other: 'source',
  };
  // The in-app sheet (Safari view) — one swipe down and you are back on your
  // set, timers untouched. Never the raw Linking jump out of the app.
  const openSource = (url: string) => {
    WebBrowser.openBrowserAsync(url).catch((e) => console.warn('openSource failed:', e));
  };

  /** How much of the block the chapter card is about actually got logged.
   *  A built-in step keeps no completion record, so it counts as done. */
  const finishedBlock = React.useMemo(() => {
    if (!transition) return { done: 0, total: 0, allDone: false };
    const mine = steps.filter((s) => s.block === transition.from);
    const done = mine.filter(
      (s) => s.kind === 'builtin' || exerciseStates[s.exerciseIndex]?.completed,
    ).length;
    return { done, total: mine.length, allDone: mine.length > 0 && done === mine.length };
  }, [transition, steps, exerciseStates]);

  // Land a resumed session on the step holding its first unfinished exercise.
  // Consumed once — after that the walk is the user's to move. Seams behind
  // the resume point are marked shown, so resuming into the main block does
  // not replay the warm-up's chapter card on the next swipe back and forth.
  React.useEffect(() => {
    const exerciseIdx = resumeExerciseRef.current;
    if (exerciseIdx === null || steps.length === 0) return;
    resumeExerciseRef.current = null;
    const target = steps.findIndex(
      (s) => s.kind === 'exercise' && s.exerciseIndex === exerciseIdx,
    );
    if (target <= 0) return;
    for (let i = 1; i <= target; i++) {
      const seam = crossedBoundary(steps, i - 1, i);
      if (seam) shownSeamsRef.current.add(`${seam.from}>${seam.to}`);
    }
    setStepIndex(target);
  }, [steps]);

  // The step list is the source of truth for WHERE you are; the exercise index
  // follows it. One effect, so the two can never be set apart by a caller.
  React.useEffect(() => {
    const step = steps[stepIndex];
    if (step?.kind === 'exercise') setCurrentExerciseIndex(step.exerciseIndex);
  }, [stepIndex, steps]);

  // Stamp a block's start the first time you stand in it, for the recap on
  // the chapter card. Only the first entry counts — swiping back into a block
  // does not restart it.
  React.useEffect(() => {
    const block = steps[stepIndex]?.block;
    if (!block) return;
    if (blockEnteredAtRef.current[block] === undefined) {
      blockEnteredAtRef.current[block] = Date.now();
    }
  }, [stepIndex, steps]);

  /**
   * Move the walk, showing the chapter card the first time a seam is stepped
   * over. Every navigation goes through here — swipe, dots, overview — so the
   * card cannot be skipped by one route and shown twice by another.
   *
   * The card is cleared on every move that does not raise a new one. It is an
   * announcement about the step you just left, so carrying it into a step you
   * navigated to afterwards left a stale "Warm-up complete" standing over the
   * warm-up you were trying to get back into, with no way past it.
   */
  const goToStep = React.useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(next, steps.length - 1));
    const seam = crossedBoundary(steps, stepIndex, clamped);
    const key = seam ? `${seam.from}>${seam.to}` : null;
    setTransition(
      key !== null && !shownSeamsRef.current.has(key) ? seam : null,
    );
    if (key !== null) shownSeamsRef.current.add(key);
    setShowSummary(false);
    setStepIndex(clamped);
  }, [steps, stepIndex]);

  React.useEffect(() => {
    goToStepRef.current = goToStep;
  }, [goToStep]);
  React.useEffect(() => {
    stepsLengthRef.current = steps.length;
  }, [steps.length]);
  React.useEffect(() => {
    transitionRef.current = transition !== null;
  }, [transition]);

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

  // Revert a set's optimistic "completed" mark when its save fails, so the
  // user sees it as incomplete and can tap to retry instead of losing the data.
  const revertSetSave = (exerciseIdx: number, setIdx: number) => {
    setExerciseStates(prev => {
      const ex = prev[exerciseIdx];
      if (!ex) return prev;
      const newStates = [...prev];
      newStates[exerciseIdx] = {
        ...ex,
        sets: ex.sets.map((s, i) =>
          i === setIdx ? { ...s, completed: false, completed_at: null } : s
        ),
      };
      return newStates;
    });
    Alert.alert(
      'Set not saved',
      'That set could not be saved — check your connection and tap it again to retry.'
    );
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
              // Daily: state.exercise.id is a generated_session_items id, not a
              // program_workout_exercises id — parentage is NULL by design.
              program_workout_exercise_id: isDaily ? null : state.exercise.id,
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

        if (error) {
          console.error('Failed to update set:', error);
          revertSetSave(exerciseIdx, setIdx);
        }
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
          revertSetSave(exerciseIdx, setIdx);
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
      revertSetSave(exerciseIdx, setIdx);
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
        duration_seconds: null,
        timing_source: null,
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

  // The prescription is a starting point, not a cap: an extra set because it
  // felt good, or a prescribed set split in two because it didn't.
  const addWorkingSet = () => {
    setExerciseStates(prev => {
      const newStates = [...prev];
      const currentSets = newStates[currentExerciseIndex].sets;
      const warmupSets = currentSets.filter(s => s.is_warmup);
      const workingSets = currentSets.filter(s => !s.is_warmup);

      const newWorkingSet = {
        set_number: workingSets.length + 1,
        weight_lbs: null,
        actual_reps: null,
        is_warmup: false,
        difficulty: null,
        increase_weight_next: false,
        notes: null,
        completed: false,
        started_at: null,
        completed_at: null,
        duration_seconds: null,
        timing_source: null,
        rest_seconds: null,
      };

      newStates[currentExerciseIndex] = {
        ...newStates[currentExerciseIndex],
        sets: [...warmupSets, ...workingSets, newWorkingSet],
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
    // Dropped here too, not only in goToStep: the overview can be left by
    // swiping back, which restores the step directly, and a card still
    // standing from before would come back with it.
    setTransition(null);
    setShowSummary(true);
    scrollViewRef.current?.scrollTo({ y: 0, animated: true });
  };
  
  // Navigate from the overview back into the walk. Takes a STEP index, which
  // on an unchaptered session is the exercise index it always was.
  const goToExercise = (index: number) => {
    goToStep(index);
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
    if (!isDaily && !programInstanceId) {
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
          program_instance_id: isDaily ? null : programInstanceId,
          program_workout_id: isDaily ? null : template.id,
          week_number: template.week_number, // 0 for daily
          day_number: template.day_number,   // 0 for daily
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
        if (isDaily) await acceptSession(String(id), data.id);
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
          started_at: (startedAt ?? new Date()).toISOString(),
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
    // Resolved once for the whole session so a duration typed into set 3 lands
    // at the same clock time it was showing on screen.
    const { resolvedByKey } = sessionTimes();
    // Ref first: the state can be a render behind when the instance was just
    // created in this same pass (the finish paths call straight into here).
    const wiId = workoutInstanceIdRef.current || workoutInstanceId || await createWorkoutInstance();
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
          // Daily: state.exercise.id is a generated_session_items id, not a
          // program_workout_exercises id — parentage is NULL by design.
          program_workout_exercise_id: isDaily ? null : state.exercise.id,
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
      const timing = resolvedByKey.get(setKey(exerciseIdx, i));
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
        started_at: timing?.startMs ? new Date(timing.startMs).toISOString() : null,
        ended_at: timing?.endMs ? new Date(timing.endMs).toISOString() : null,
        duration_seconds: timing?.durationSeconds ?? null,
        timing_source: set.timing_source,
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
        const { error } = await supabase
          .from('workout_sessions')
          .update((() => {
            const span = recordedSpan();
            return { ended_at: span.endedAtIso, duration_seconds: span.durationSeconds };
          })())
          .eq('id', workoutSessionIdRef.current);
        if (error) throw error;
      }

      // Keep workout in_progress (don't mark as completed)
      // Also update total duration on workout_instances for backward compatibility
      // Ref, not state: the instance may have been created by the save loop
      // just above, and the state doesn't catch up until the next render.
      const doneWiId = workoutInstanceIdRef.current || workoutInstanceId;
      if (doneWiId) {
        const completedCount = exerciseStates.filter(e => e.completed).length;
        const { error } = await supabase
          .from('workout_instances')
          .update({
            status: 'in_progress',
            completion_status: completedCount === exerciseStates.length ? 'completed' : 'partial',
            duration_seconds: recordedSpan().durationSeconds,
          })
          .eq('id', doneWiId);
        if (error) throw error;
      }

      const completedCount = exerciseStates.filter(e => e.completed).length;
      Alert.alert(
        '💪 Progress Saved!',
        `${completedCount}/${exerciseStates.length} exercises completed.\nDuration: ${formatDuration(recordedSpan().durationSeconds)}\nYou can continue this workout later.`,
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
        const { error } = await supabase
          .from('workout_sessions')
          .update((() => {
            const span = recordedSpan();
            return { ended_at: span.endedAtIso, duration_seconds: span.durationSeconds };
          })())
          .eq('id', workoutSessionIdRef.current);
        if (error) throw error;
      }

      // Update workout instance. Ref, not state: if the save loop above just
      // created the instance, the state is still null this render — skipping
      // this block would leave the instance open AND skip the daily
      // completion backfill while telling the user the workout is complete.
      const finishWiId = workoutInstanceIdRef.current || workoutInstanceId;
      if (finishWiId) {
        const allComplete = exerciseStates.every(e => e.completed);

        // Calculate total duration from all sessions
        const { data: sessions } = await supabase
          .from('workout_sessions')
          .select('duration_seconds')
          .eq('workout_instance_id', finishWiId);

        const totalDuration = sessions?.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) || recordedSpan().durationSeconds;

        const { error } = await supabase
          .from('workout_instances')
          .update({
            status: 'completed',
            completion_status: allComplete ? 'completed' : 'partial',
            completed_at: new Date().toISOString(),
            duration_seconds: totalDuration,
          })
          .eq('id', finishWiId);
        if (error) throw error;

        if (isDaily) {
          const performedIds = exerciseStates
            .filter((e) => e.sets.some((s) => s.completed))
            .map((e) => e.exercise.exercise_id);
          await completeSession(String(id), performedIds);
        }
      }

      Alert.alert(
        '🎉 Workout Complete!',
        `Duration: ${formatDuration(elapsedSeconds())}\nExercises: ${exerciseStates.filter(e => e.completed).length}/${exerciseStates.length}`,
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
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading workout...</Text>
        </View>
      </View>
    );
  }

  // Error state
  if (error || !template || !currentExercise) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <Stack.Screen options={{ headerShown: false }} />
        <View style={styles.centerContainer}>
          <AlertCircle size={48} color="#ef4444" />
          <Text style={styles.errorText}>{error || 'Failed to load workout'}</Text>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { resolvedByKey, chainStartByKey, inputByKey } = sessionTimes();
  const sessionAnchorMs = startedAt?.getTime() ?? Date.now();
  const timeChipFor = (setIdx: number) => {
    const resolved = resolvedByKey.get(setKey(currentExerciseIndex, setIdx))
      ?? { startMs: null, endMs: null, durationSeconds: null };
    return {
      label: formatSetTimeChip(resolved, clockLabel),
      hasTime: resolved.durationSeconds !== null,
    };
  };

  const targetRepsDisplay = currentExercise.exercise.target_reps_max && 
    currentExercise.exercise.target_reps_max !== currentExercise.exercise.target_reps_min
    ? `${currentExercise.exercise.target_reps_min}-${currentExercise.exercise.target_reps_max}`
    : `${currentExercise.exercise.target_reps_min}`;

  // The served workout's items were copied into session items in order, so
  // position lines them up; the id check keeps an edited workout from putting
  // the wrong creator's line under a movement.
  const servedItem = servedWorkout
    ? servedWorkout.items[currentExerciseIndex]?.exerciseId ===
      currentExercise.exercise.exercise_id
      ? servedWorkout.items[currentExerciseIndex]
      : servedWorkout.items.find(
          (i) => i.exerciseId === currentExercise.exercise.exercise_id,
        ) ?? null
    : null;
  // null = not a served workout, show the composed target. '' = served, but
  // the creator prescribed nothing for this movement — show nothing rather
  // than an invented number.
  const servedPrescription = servedWorkout
    ? servedItem
      ? formatWorkoutItem(servedItem)
      : ''
    : null;
  const servedNote = servedItem?.notes ?? null;
  // Only worth the space when the parse gave us nothing per movement.
  const servedProtocolFallback = Boolean(
    servedWorkout?.rawProtocol &&
      servedWorkout.items.every((i) => formatWorkoutItem(i) === ''),
  );

  const timingSet =
    timingSetIndex !== null ? currentExercise.sets[timingSetIndex] ?? null : null;
  const timingKey = setKey(currentExerciseIndex, timingSetIndex ?? 0);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
          <X size={24} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>{template.name}</Text>
          {startedAt && (
            <TickingDuration since={startedAt.getTime()} style={styles.headerSubtitle} />
          )}
        </View>
        
        <TouchableOpacity style={styles.headerButton} onPress={goToSummary}>
          <LayoutGrid size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Progress. A composed day reads as chapters — where you are in the
          block, and where the block sits in the day; everything else keeps
          the flat bar and one dot per exercise. */}
      <View style={styles.progressContainer}>
        {chaptered ? (
          <>
            {/* The day: one segment per block, weighted by its minutes, so
                the strip is the shape of the session and not just a count. */}
            <View style={styles.dayStrip}>
              {chapters.map((c, idx) => {
                // Lit as far as you have got. Under the chapter card that is
                // the block it is congratulating you for, not the one waiting
                // behind it — the walk has moved, the story has not yet.
                const reached = transition
                  ? chapters.findIndex((x) => x.block === transition.from)
                  : currentChapterIdx;
                return (
                  <View
                    key={c.block}
                    style={[
                      styles.dayStripSegment,
                      {
                        flex: Math.max(1, c.minutes),
                        backgroundColor: tokens.blocks[c.block],
                        opacity: idx <= reached || showSummary ? 1 : 0.25,
                      },
                    ]}
                  />
                );
              })}
            </View>
            {/* Silent under the chapter card: the card is announcing the
                block you just finished, and a kicker naming the one you are
                about to start contradicts it on the same screen. */}
            {transition ? null : (
            <View style={styles.chapterKicker}>
              <Text
                style={[
                  styles.chapterKickerTitle,
                  { color: currentStep?.block ? tokens.blocks[currentStep.block] : colors.mutedForeground },
                ]}
                numberOfLines={1}
              >
                {showSummary
                  ? 'SESSION OVERVIEW'
                  : currentStep?.block
                    ? `${BLOCK_TITLES[currentStep.block].toUpperCase()}${
                        currentStep.kind === 'builtin' ? ' · BUILT-IN' : ''
                      }`
                    : 'EXTRA WORK'}
              </Text>
              <Text style={styles.chapterKickerMeta}>
                {showSummary
                  ? `${chapters.length} blocks`
                  : progress && currentStep?.kind === 'exercise'
                    ? `exercise ${progress.index + 1} of ${progress.count}`
                    : chapters[currentChapterIdx]
                      ? `~${chapters[currentChapterIdx].minutes} min`
                      : ''}
              </Text>
            </View>
            )}
            {/* Dots for THIS block only — the day's position is the strip's
                job, and 25 dots said nothing about either. */}
            {transition ? null : (
            <View style={styles.exerciseDots}>
              {steps.map((step, idx) => {
                if (step.block !== currentStep?.block) return null;
                const done = step.kind === 'exercise'
                  ? exerciseStates[step.exerciseIndex]?.completed
                  : false;
                return (
                  <TouchableOpacity
                    key={idx}
                    onPress={() => goToExercise(idx)}
                    style={[
                      styles.exerciseDot,
                      !showSummary && idx === stepIndex && styles.exerciseDotActive,
                      done && styles.exerciseDotCompleted,
                    ]}
                  />
                );
              })}
              <TouchableOpacity
                onPress={goToSummary}
                style={[
                  styles.exerciseDot,
                  styles.exerciseDotSummary,
                  showSummary && styles.exerciseDotActive,
                ]}
              >
                <Flag size={6} color={showSummary ? "#fff" : "#6b7280"} />
              </TouchableOpacity>
            </View>
            )}
            {transition ? null : (
              <Text style={styles.progressText}>
                {showSummary ? 'Tap anything to jump' : 'Swipe to navigate'}
              </Text>
            )}
          </>
        ) : (
          <>
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
                  onPress={() => goToExercise(idx)}
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
                <Flag size={6} color={showSummary ? "#fff" : "#6b7280"} />
              </TouchableOpacity>
            </View>
            <Text style={styles.progressText}>
              {showSummary ? 'Summary' : `${currentExerciseIndex + 1} / ${exerciseStates.length} exercises`} • Swipe to navigate
            </Text>
          </>
        )}
      </View>

      {/* Rounds belong to the workout, not to any one movement, so they sit
          here where they apply to all of it. The raw protocol is the fallback
          when the parse produced no per-movement prescription at all — the
          creator's words are the ground truth we can always fall back to. */}
      {servedWorkout && !showSummary && (servedWorkout.rounds || servedProtocolFallback) && (
        <View style={styles.servedProtocol}>
          {!!servedWorkout.rounds && (
            <Text style={styles.servedRounds}>
              Repeat the whole list {servedWorkout.rounds} times
            </Text>
          )}
          {servedProtocolFallback && (
            <Text style={styles.servedProtocolText}>{servedWorkout.rawProtocol}</Text>
          )}
        </View>
      )}

      <Animated.View
        style={[styles.content, { transform: [{ translateX: swipeAnim }] }]}
        {...panResponder.panHandlers}
      >
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.contentContainer}>
        
        {/* The chapter card: one block finished, the next one previewed.
            Shown once per seam, and it sits OVER the step it announced — so
            dismissing it leaves you exactly where the walk already is. */}
        {transition && !showSummary ? (
          <View style={styles.chapterCard}>
            <View
              style={[
                styles.chapterRing,
                { borderColor: tokens.blocks[transition.from] },
              ]}
            >
              <Check size={40} color={tokens.blocks[transition.from]} />
            </View>
            {/* Only "complete" when it actually is. You can walk off the end
                of a block having logged none of it, and a card congratulating
                you for work you skipped is the app inventing a fact. */}
            <Text style={styles.chapterDoneTitle}>
              {finishedBlock.allDone
                ? `${BLOCK_TITLES[transition.from]} complete`
                : `Leaving the ${BLOCK_TITLES[transition.from].toLowerCase()}`}
            </Text>
            <Text style={styles.chapterDoneSubtitle}>
              {chapters.find((c) => c.block === transition.from)?.name ?? ''}
            </Text>

            <View style={styles.chapterStats}>
              {(() => {
                const finished = chapters.find((c) => c.block === transition.from);
                const enteredAt = blockEnteredAtRef.current[transition.from];
                const doneIdx = chapters.findIndex((c) => c.block === transition.from);
                return (
                  <>
                    {/* Only when we watched the whole block: a session resumed
                        into the middle of one has no honest number here. */}
                    {enteredAt !== undefined && (
                      <View style={styles.chapterStat}>
                        <Text style={styles.chapterStatValue}>
                          {formatDuration(Math.floor((Date.now() - enteredAt) / 1000))}
                        </Text>
                        <Text style={styles.chapterStatLabel}>TIME</Text>
                      </View>
                    )}
                    <View style={styles.chapterStat}>
                      <Text style={styles.chapterStatValue}>
                        {finishedBlock.allDone
                          ? finished?.stepCount ?? 0
                          : `${finishedBlock.done}/${finishedBlock.total}`}
                      </Text>
                      <Text style={styles.chapterStatLabel}>
                        {finished?.builtinKey ? 'ROUTINE' : 'MOVEMENTS'}
                      </Text>
                    </View>
                    <View style={styles.chapterStat}>
                      <Text style={styles.chapterStatValue}>
                        {doneIdx + 1} of {chapters.length}
                      </Text>
                      <Text style={styles.chapterStatLabel}>BLOCKS DONE</Text>
                    </View>
                  </>
                );
              })()}
            </View>

            {(() => {
              const next = chapters.find((c) => c.block === transition.to);
              if (!next) return null;
              const preview = steps
                .slice(next.firstStep, next.firstStep + next.stepCount)
                .flatMap((s) =>
                  s.kind === 'exercise'
                    ? [{
                        name: getExercise(exerciseStates[s.exerciseIndex].exercise).name,
                        // The creator's own words when they exist — "21-15-9",
                        // "30s each side" — same rule the logger already
                        // follows; the computed line is only for program-mode
                        // exercises, which carry no raw prescription.
                        rx: (exerciseStates[s.exerciseIndex].exercise as any).raw_reps
                          ?? `${exerciseStates[s.exerciseIndex].sets.length} × ${
                            exerciseStates[s.exerciseIndex].exercise.target_reps_min
                          }`,
                      }]
                    : (builtinByKey(s.builtinKey)?.movements ?? []).map((m) => ({
                        name: m.name, rx: m.prescription,
                      })),
                )
                .slice(0, 3);
              return (
                <View
                  style={[
                    styles.chapterNext,
                    { borderColor: tokens.blocks[transition.to] },
                  ]}
                >
                  <Text
                    style={[styles.chapterNextKicker, { color: tokens.blocks[transition.to] }]}
                  >
                    UP NEXT — {BLOCK_TITLES[transition.to].toUpperCase()} · ~{next.minutes} MIN
                  </Text>
                  <Text style={styles.chapterNextName}>{next.name}</Text>
                  <View style={styles.chapterNextList}>
                    {preview.map((p, i) => (
                      <View key={`${p.name}-${i}`} style={styles.chapterNextRow}>
                        <Text style={styles.chapterNextRowName} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.chapterNextRowRx}>{p.rx}</Text>
                      </View>
                    ))}
                  </View>
                  {/* Rewatch the whole block's video during the breather. */}
                  {blockSource[transition.to] && (
                    <TouchableOpacity
                      style={styles.chapterWatchRow}
                      onPress={() => openSource(blockSource[transition.to]!.url)}
                      activeOpacity={0.7}
                      accessibilityRole="link"
                      accessibilityLabel="Watch the next block's video"
                    >
                      <Play size={13} color={tokens.blocks[transition.to]} />
                      <Text
                        style={[
                          styles.chapterWatchText,
                          { color: tokens.blocks[transition.to] },
                        ]}
                        numberOfLines={1}
                      >
                        watch the video
                        {blockSource[transition.to]!.handle
                          ? ` · ${blockSource[transition.to]!.handle}`
                          : ''}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })()}

            <TouchableOpacity
              style={styles.chapterStartButton}
              onPress={() => setTransition(null)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={`Start the ${BLOCK_TITLES[transition.to].toLowerCase()}`}
            >
              <Text style={styles.chapterStartText}>
                Start {BLOCK_TITLES[transition.to].toLowerCase()} →
              </Text>
            </TouchableOpacity>
            <Text style={styles.chapterHint}>or swipe — shows once per block</Text>
          </View>
        ) :

        /* Summary View */
        showSummary ? (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Workout Summary</Text>
            <Text style={styles.summarySubtitle}>
              {exerciseStates.filter(e => e.completed).length} of {exerciseStates.length} exercises completed
            </Text>
            
            {/* One row per STEP, grouped under its block on a composed day.
                The rows themselves are unchanged — this only sections them,
                so tapping still jumps you straight back into the walk. */}
            <View style={styles.summaryList}>
              {steps.map((step, idx) => {
                const chapterHere = chaptered
                  ? chapters.find((c) => c.firstStep === idx)
                  : undefined;
                const heading = chapterHere ? (
                  <Text
                    key={`h-${chapterHere.block}`}
                    style={[
                      styles.summaryBlockHeading,
                      { color: tokens.blocks[chapterHere.block] },
                    ]}
                  >
                    {BLOCK_TITLES[chapterHere.block].toUpperCase()}
                    {chapterHere.builtinKey ? ' · BUILT-IN' : ''} · ~{chapterHere.minutes} MIN
                  </Text>
                ) : null;

                if (step.kind === 'builtin') {
                  const routine = builtinByKey(step.builtinKey);
                  return (
                    <React.Fragment key={`s-${idx}`}>
                      {heading}
                      <TouchableOpacity
                        style={styles.summaryRow}
                        onPress={() => goToExercise(idx)}
                      >
                        <Circle size={20} color="#6b7280" />
                        <View style={styles.summaryRowContent}>
                          <Text style={styles.summaryExerciseName} numberOfLines={1}>
                            {chapters.find((c) => c.block === step.block)?.name
                              ?? routine?.name ?? 'Routine'}
                          </Text>
                          <Text style={styles.summarySetCount}>
                            {routine ? `${routine.movements.length} movements` : 'follow along'}
                          </Text>
                        </View>
                        <ChevronRight size={18} color="#6b7280" />
                      </TouchableOpacity>
                    </React.Fragment>
                  );
                }

                const state = exerciseStates[step.exerciseIndex];
                if (!state) return null;
                const exercise = getExercise(state.exercise);
                const completedSets = state.sets.filter(s => s.completed).length;
                const totalSets = state.sets.length;

                // Determine status
                let StatusIcon: React.ComponentType<{ size?: number; color?: string }>;
                let statusColor: string;
                if (state.completed) {
                  StatusIcon = CheckCircle2;
                  statusColor = '#4ade80';
                } else if (completedSets > 0) {
                  StatusIcon = Circle;
                  statusColor = '#fbbf24';
                } else {
                  StatusIcon = Circle;
                  statusColor = '#6b7280';
                }

                return (
                  <React.Fragment key={`s-${idx}`}>
                    {heading}
                    <TouchableOpacity
                      style={[
                        styles.summaryRow,
                        idx === stepIndex && styles.summaryRowCurrent,
                      ]}
                      onPress={() => goToExercise(idx)}
                    >
                      <StatusIcon size={20} color={statusColor} />
                      <View style={styles.summaryRowContent}>
                        <Text style={styles.summaryExerciseName} numberOfLines={1}>
                          {exercise.name}
                        </Text>
                        <Text style={styles.summarySetCount}>
                          {completedSets}/{totalSets} sets
                        </Text>
                      </View>
                      <ChevronRight size={18} color="#6b7280" />
                    </TouchableOpacity>
                  </React.Fragment>
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
                <PauseCircle size={20} color="#fff" />
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
                    <CheckCircle2 size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Finish Workout</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : currentStep?.kind === 'builtin' ? (
          /* A built-in block: shipped movements, no exercise rows, nothing to
             log. It is a follow-along card — ticks are local to the session,
             and finishing it just moves the walk on. */
          <View style={styles.exerciseCard}>
            <Text style={styles.builtinName}>
              {chapters[currentChapterIdx]?.name ?? builtinRoutine?.name ?? 'Routine'}
            </Text>
            <Text
              style={[
                styles.builtinLead,
                { color: tokens.blocks[currentStep.block] },
              ]}
            >
              follow along · tick as you go
            </Text>
            {(builtinRoutine?.movements ?? []).map((m) => {
              const key = `${currentStep.builtinKey}:${m.name}`;
              const ticked = builtinTicks[key] === true;
              return (
                <TouchableOpacity
                  key={m.name}
                  style={styles.builtinRow}
                  activeOpacity={0.7}
                  onPress={() => setBuiltinTicks((t) => ({ ...t, [key]: !ticked }))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ticked }}
                  accessibilityLabel={`${m.name}, ${m.prescription}`}
                >
                  {ticked ? (
                    <CheckCircle2 size={22} color={tokens.blocks[currentStep.block]} />
                  ) : (
                    <Circle size={22} color="#6b7280" />
                  )}
                  <Text
                    style={[styles.builtinRowName, ticked && styles.builtinRowNameDone]}
                    numberOfLines={1}
                  >
                    {m.name}
                  </Text>
                  <Text style={styles.builtinRowRx}>{m.prescription}</Text>
                </TouchableOpacity>
              );
            })}
            {/* A built-in this build no longer ships still has to be
                completable — the block is real even when its movements
                aren't in hand. */}
            {!builtinRoutine && (
              <Text style={styles.builtinMissing}>
                This routine isn't in the app anymore — do your usual{' '}
                {BLOCK_TITLES[currentStep.block].toLowerCase()} and carry on.
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.builtinDoneButton,
                { backgroundColor: tokens.blocks[currentStep.block] },
              ]}
              onPress={() => {
                if (stepIndex >= steps.length - 1) goToSummary();
                else goToExercise(stepIndex + 1);
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={
                stepIndex >= steps.length - 1
                  ? 'Done — go to the session summary'
                  : `Done — continue to the next block`
              }
            >
              <Check size={18} color={tokens.onBrand} />
              <Text style={styles.builtinDoneText}>
                {stepIndex >= steps.length - 1 ? 'Done — finish session' : 'Done — keep going'}
              </Text>
            </TouchableOpacity>
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
                        <ActivityIndicator size="small" color={colors.primary} />
                        <Text style={styles.generateImageText}>Generating...</Text>
                      </>
                    ) : (
                      <>
                        <ImageIcon size={32} color="#6b7280" />
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
          <View style={styles.exerciseNameRow}>
            <Text style={[styles.exerciseName, styles.exerciseNameGrow]}>
              {getExercise(currentExercise.exercise).name}
            </Text>
            {/* Which mode this session is in, and a way out of the wrong one. */}
            <TouchableOpacity
              onPress={() =>
                setRecordMode((m) => (m === 'live' ? 'backfill' : 'live'))
              }
              style={[
                styles.modeBadge,
                recordMode === 'backfill' ? styles.modeBadgeBackfill : styles.modeBadgeLive,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                recordMode === 'backfill'
                  ? 'Backfill mode. Switch to live.'
                  : 'Live mode. Switch to backfill.'
              }
            >
              <Text
                style={[
                  styles.modeBadgeText,
                  recordMode === 'backfill'
                    ? styles.modeBadgeTextBackfill
                    : styles.modeBadgeTextLive,
                ]}
              >
                {recordMode === 'backfill'
                  ? `Backfill · ${startedAt ? clockLabel(startedAt.getTime()) : ''}`
                  : 'Live'}
              </Text>
            </TouchableOpacity>
          </View>
          {servedPrescription !== null ? (
            /* The creator's own words for this movement, shown rather than
               parsed. The logger's fields sit underneath as the starting
               point for what you actually did. */
            servedPrescription !== '' && (
              <Text style={styles.exerciseTarget}>{servedPrescription}</Text>
            )
          ) : currentExercise.exercise.raw_reps != null ? (
            /* A daily item: the creator's prescription, verbatim. Only a
               set count the creator actually wrote multiplies it. */
            <Text style={styles.exerciseTarget}>
              {currentExercise.exercise.target_sets > 1
                ? `${currentExercise.exercise.target_sets} sets × ${currentExercise.exercise.raw_reps}`
                : currentExercise.exercise.raw_reps}
            </Text>
          ) : (
            <Text style={styles.exerciseTarget}>
              {currentExercise.exercise.target_sets} sets × {targetRepsDisplay} reps
            </Text>
          )}
          {servedNote && <Text style={styles.lastPerformance}>{servedNote}</Text>}

          {/* The video this movement came from — tap to rewatch the form
              before doing it. The creator's own note for the movement rides
              underneath when the capture stored one. */}
          {currentSource && (
            <TouchableOpacity
              style={styles.sourceChip}
              onPress={() => openSource(currentSource.url)}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel={`Watch the original video${
                currentSource.handle ? ` by ${currentSource.handle}` : ''
              }`}
            >
              {currentSource.thumbnailUrl ? (
                <Image
                  source={{ uri: currentSource.thumbnailUrl }}
                  style={styles.sourceThumb}
                />
              ) : (
                <View style={[styles.sourceThumb, styles.sourceThumbEmpty]}>
                  <Play size={12} color={tokens.textMuted} />
                </View>
              )}
              <Text style={styles.sourceChipText} numberOfLines={1}>
                {currentSource.handle ? `${currentSource.handle} · ` : ''}
                {PLATFORM_LABEL[currentSource.platform] ?? 'source'}
              </Text>
              <Text style={styles.sourceChipWatch}>watch</Text>
            </TouchableOpacity>
          )}
          {currentSourceNote && (
            <Text style={styles.sourceNote}>“{currentSourceNote}”</Text>
          )}
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
                  timerStartedAt={isActiveSet ? activeSetTimer : null}
                  recordMode={recordMode}
                  timeChipLabel={timeChipFor(actualIdx).label}
                  hasTime={timeChipFor(actualIdx).hasTime}
                  onPressTime={() => setTimingSetIndex(actualIdx)}
                />
              );
            })}
            {currentExercise.sets.filter(s => s.is_warmup).length === 0 && (
              <Text style={styles.noWarmupsText}>No warmup sets added</Text>
            )}
          </View>

          {/* Working Sets Section */}
          <View style={styles.setsSection}>
            <View style={styles.setsSectionHeader}>
              <Text style={styles.setsSectionTitle}>Working Sets</Text>
              <TouchableOpacity onPress={addWorkingSet} accessibilityRole="button">
                <Text style={styles.addWarmupText}>+ Add</Text>
              </TouchableOpacity>
            </View>
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
                  timerStartedAt={isActiveSet ? activeSetTimer : null}
                  recordMode={recordMode}
                  timeChipLabel={timeChipFor(actualIdx).label}
                  hasTime={timeChipFor(actualIdx).hasTime}
                  onPressTime={() => setTimingSetIndex(actualIdx)}
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

      {/* Bottom Actions — for an exercise you are logging, and nothing else.
          The chapter card and a built-in block each carry their own single
          action, and "Mark as Completed" under either one belongs to whatever
          exercise the walk happens to be standing on. */}
      {!showSummary && !transition && currentStep?.kind !== 'builtin' && (
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
                <CheckCircle2 size={20} color="#fff" />
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
            <TickingDuration since={restStartedAt} style={styles.restTimerTime} />
            <TouchableOpacity
              style={styles.restTimerButton}
              onPress={() => {
                setShowRestTimer(false);
              }}
            >
              <Text style={styles.restTimerButtonText}>Done Resting</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Backfill: the time for one set, typed in rather than measured. */}
      {timingSet && timingSetIndex !== null && (
        <SetTimeSheet
          visible
          setNumber={timingSet.set_number}
          exerciseName={getExercise(currentExercise.exercise).name}
          current={inputByKey.get(timingKey) ?? { kind: 'none' }}
          chainStartMs={chainStartByKey.get(timingKey) ?? sessionAnchorMs}
          onSave={(input) => {
            updateSet(
              currentExerciseIndex,
              timingSetIndex,
              input.kind === 'span'
                ? {
                    started_at: input.startMs,
                    completed_at: input.endMs,
                    duration_seconds: Math.max(
                      0,
                      Math.round((input.endMs - input.startMs) / 1000),
                    ),
                    timing_source: 'entered',
                  }
                : input.kind === 'duration'
                  ? {
                      started_at: null,
                      completed_at: null,
                      duration_seconds: input.seconds,
                      timing_source: 'entered',
                    }
                  : {
                      started_at: null,
                      completed_at: null,
                      duration_seconds: null,
                      timing_source: null,
                    },
            );
          }}
          onClose={() => setTimingSetIndex(null)}
        />
      )}
    </View>
  );
}

// ============================================================
// Styles
// ============================================================
