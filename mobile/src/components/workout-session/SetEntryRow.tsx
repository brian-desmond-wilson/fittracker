import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, TextInput } from "react-native";
import { Swipeable } from "react-native-gesture-handler";
import { Trash2, Timer, Moon, Play, Square, Check } from "lucide-react-native";
import { colors } from "@/src/lib/colors";
import { styles } from "./styles";
import { getDifficultyColor } from "./helpers";
import { SetEntry } from "./types";
import { DifficultyPicker } from "./DifficultyPicker";

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
                <Text style={styles.setDurationText}>{formatDuration(setDuration)}</Text>
              </View>
            </View>
            {/* Rest indicator */}
            {set.rest_seconds !== null && set.rest_seconds > 0 && (
              <View style={styles.restIndicator}>
                <Moon size={12} color="#6b7280" />
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
            <Play size={14} color="#4ade80" />
            <Text style={styles.timerStartText}>Start</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.timerRunning}>
            <Timer size={14} color="#fbbf24" />
            <Text style={styles.timerRunningText}>{formatDuration(timerSeconds)}</Text>
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
