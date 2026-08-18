import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Trash2, Timer, Moon, Play, Square, Check, Clock, ClockPlus } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { styles } from "./styles";
import { getDifficultyColor } from "./helpers";
import { SetEntry } from "./types";
import { DifficultyPicker } from "./DifficultyPicker";
import { formatSetDuration } from "@/src/lib/setTiming";
import { TickingDuration } from "./TickingDuration";

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
  /** When the active set's timer started, or null when it isn't running. */
  timerStartedAt: number | null;
  /** Live runs the timer; backfill replaces it with a time you type in. */
  recordMode: "live" | "backfill";
  /** The chip's label in backfill mode — a span, a duration, or an invitation. */
  timeChipLabel: string;
  /** True once this set carries a time, so the chip stops looking empty. */
  hasTime: boolean;
  onPressTime: () => void;
}

export function SetEntryRow({
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
  timerStartedAt,
  recordMode,
  timeChipLabel,
  hasTime,
  onPressTime,
}: SetEntryRowProps) {
  const [localWeight, setLocalWeight] = useState(set.weight_lbs?.toString() || '');
  const [localReps, setLocalReps] = useState(set.actual_reps?.toString() || '');

  useEffect(() => {
    if (set.weight_lbs !== null) setLocalWeight(set.weight_lbs.toString());
    if (set.actual_reps !== null) setLocalReps(set.actual_reps.toString());
  }, [set.weight_lbs, set.actual_reps]);

  /** A recorded duration, or a dash when there is nothing to show. Hours get
   *  their own field — "539:14" is not a thing anyone can read. */
  const durationOrDash = (seconds: number | null) =>
    seconds === null || seconds === 0 ? '--' : formatSetDuration(seconds);

  const handleComplete = () => {
    const weight = parseFloat(localWeight) || 0;
    const reps = parseInt(localReps) || 0;
    const now = Date.now();
    // In backfill the set's times came from you, and completed_at IS the end
    // you gave it. Stamping "now" over that produced a duration measured from
    // this morning to this evening — nine hours for one set of swings.
    const timing =
      recordMode === 'backfill'
        ? {}
        : {
            completed_at: now,
            // The timer ran, so this was measured rather than remembered.
            // Without a start there is nothing to claim.
            ...(set.started_at !== null
              ? {
                  duration_seconds: Math.max(
                    0,
                    Math.round((now - set.started_at) / 1000),
                  ),
                  timing_source: 'measured' as const,
                }
              : {}),
          };
    onUpdate({
      weight_lbs: weight,
      actual_reps: reps,
      completed: true,
      ...timing,
    });
    onComplete();
  };

  // Completed set - new design with tap-to-edit and swipe-to-delete
  if (set.completed) {
    const setDuration = set.duration_seconds !== null
      ? set.duration_seconds
      : set.started_at && set.completed_at
        ? Math.floor((set.completed_at - set.started_at) / 1000)
        : null;

    const renderRightActions = () => (
      <TouchableOpacity
        style={styles.deleteSwipeAction}
        onPress={onDelete}
      >
        <Trash2 size={20} color="#fff" />
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
                <Timer size={12} color={colors.mutedForeground} />
                <Text style={styles.setDurationText}>{durationOrDash(setDuration)}</Text>
              </View>
            </View>
            {/* Rest indicator */}
            {set.rest_seconds !== null && set.rest_seconds > 0 && (
              <View style={styles.restIndicator}>
                <Moon size={12} color="#6b7280" />
                <Text style={styles.restIndicatorText}>
                  {durationOrDash(set.rest_seconds)} rest
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
        {/* Live times itself; backfill takes the time from you. */}
        {recordMode === "backfill" ? (
          <TouchableOpacity
            style={[styles.setTimeChip, hasTime && styles.setTimeChipFilled]}
            onPress={onPressTime}
            accessibilityRole="button"
            accessibilityLabel={
              hasTime ? `Set time ${timeChipLabel}. Change it.` : "Set the time for this set"
            }
          >
            {hasTime ? (
              <Clock size={13} color="#F59E0B" />
            ) : (
              <ClockPlus size={13} color="#9ca3af" />
            )}
            <Text style={[styles.setTimeChipText, hasTime && styles.setTimeChipTextFilled]}>
              {timeChipLabel}
            </Text>
          </TouchableOpacity>
        ) : !isTimerRunning ? (
          <TouchableOpacity style={styles.timerStartButton} onPress={onStartTimer}>
            <Play size={14} color="#4ade80" />
            <Text style={styles.timerStartText}>Start</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.timerRunning}>
            <Timer size={14} color="#fbbf24" />
            <TickingDuration
              since={timerStartedAt ?? Date.now()}
              style={styles.timerRunningText}
            />
            <TouchableOpacity onPress={onStopTimer}>
              <Square size={14} color="#ef4444" />
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
        <Check size={18} color="#fff" />
        <Text style={styles.logSetButtonText}>Log Set</Text>
      </TouchableOpacity>
    </View>
  );
}
