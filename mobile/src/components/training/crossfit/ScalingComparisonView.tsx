import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '@/src/lib/colors';
import type { WODWithDetails, WODMovementWithDetails, ScalingLevel } from '@/src/types/crossfit';
import { formatWeight } from '@/src/lib/wodDetailHelpers';

interface ScalingComparisonViewProps {
  wod: WODWithDetails;
}

interface MovementScalingData {
  level: ScalingLevel;
  reps?: string;
  weight?: string;
  variation?: string;
  alternativeExercise?: string;
  distance?: string;
  time?: string;
}

export function ScalingComparisonView({ wod }: ScalingComparisonViewProps) {
  const movements = wod.movements || [];

  const getMovementScaling = (
    movement: WODMovementWithDetails,
    level: ScalingLevel
  ): MovementScalingData => {
    const prefix = level.toLowerCase();
    const data: MovementScalingData = { level };

    // Get reps
    const reps = (movement as any)[`${prefix}_reps`];
    if (reps) {
      data.reps = typeof reps === 'number' ? `${reps} reps` : reps;
    }

    // Get weight
    const weightMen = (movement as any)[`${prefix}_weight_men_lbs`];
    const weightWomen = (movement as any)[`${prefix}_weight_women_lbs`];
    const weightDisplay = formatWeight(weightMen, weightWomen);
    if (weightDisplay) {
      data.weight = weightDisplay.display;
    }

    // Get distance
    const distanceValue = (movement as any)[`${prefix}_distance_value`];
    const distanceUnit = (movement as any)[`${prefix}_distance_unit`];
    if (distanceValue && distanceUnit) {
      data.distance = `${distanceValue} ${distanceUnit}`;
    }

    // Get time
    const time = (movement as any)[`${prefix}_time`];
    if (time) {
      data.time = `${time} sec`;
    }

    // Get variation
    const variation = (movement as any)[`${prefix}_movement_variation`];
    if (variation) {
      data.variation = variation;
    }

    // Get alternative exercise
    const altExerciseName = (movement as any)[`${prefix}_alternative_exercise_name`];
    if (altExerciseName) {
      data.alternativeExercise = altExerciseName;
    }

    return data;
  };

  const renderScalingRow = (
    level: ScalingLevel,
    data: MovementScalingData,
    isLast: boolean
  ) => {
    const levelColors: Record<ScalingLevel, string> = {
      Rx: colors.primary,
      L2: '#F59E0B',
      L1: '#10B981',
    };

    const hasData =
      data.reps ||
      data.weight ||
      data.distance ||
      data.time ||
      data.variation ||
      data.alternativeExercise;

    if (!hasData) {
      return null;
    }

    return (
      <View key={level} style={styles.scalingRow}>
        <View style={styles.scalingRowHeader}>
          <View style={[styles.levelIndicator, !isLast && styles.levelIndicatorConnected]}>
            <View style={[styles.levelDot, { backgroundColor: levelColors[level] }]} />
            {!isLast && <View style={styles.levelLine} />}
          </View>
          <Text style={[styles.levelLabel, { color: levelColors[level] }]}>{level}:</Text>
        </View>

        <View style={styles.scalingDetails}>
          {data.alternativeExercise && (
            <Text style={styles.alternativeText}>→ {data.alternativeExercise}</Text>
          )}

          {(data.reps || data.weight || data.distance || data.time) && (
            <View style={styles.detailsRow}>
              {data.reps && <Text style={styles.detailText}>{data.reps}</Text>}
              {data.weight && <Text style={styles.detailText}>@ {data.weight}</Text>}
              {data.distance && <Text style={styles.detailText}>{data.distance}</Text>}
              {data.time && <Text style={styles.detailText}>⏱️ {data.time}</Text>}
            </View>
          )}

          {data.variation && (
            <Text style={styles.variationText}>• {data.variation}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderMovementComparison = (movement: WODMovementWithDetails, index: number) => {
    const rxData = getMovementScaling(movement, 'Rx');
    const l2Data = getMovementScaling(movement, 'L2');
    const l1Data = getMovementScaling(movement, 'L1');

    // Check if there are any scaling differences
    const hasScalingDifferences =
      rxData.alternativeExercise ||
      l2Data.alternativeExercise ||
      l1Data.alternativeExercise ||
      l2Data.reps ||
      l2Data.weight ||
      l2Data.variation ||
      l1Data.reps ||
      l1Data.weight ||
      l1Data.variation;

    if (!hasScalingDifferences) {
      // No scaling differences, skip this movement
      return null;
    }

    return (
      <View key={movement.id} style={styles.movementComparisonCard}>
        <View style={styles.movementHeader}>
          <Text style={styles.movementNumber}>{index + 1}.</Text>
          <Text style={styles.movementName}>{movement.exercise?.name}</Text>
        </View>

        <View style={styles.scalingTree}>
          {renderScalingRow('Rx', rxData, false)}
          {renderScalingRow('L2', l2Data, false)}
          {renderScalingRow('L1', l1Data, true)}
        </View>
      </View>
    );
  };

  // Filter movements that have scaling differences
  const movementsWithScaling = movements.filter((movement) => {
    const l2Data = getMovementScaling(movement, 'L2');
    const l1Data = getMovementScaling(movement, 'L1');

    return (
      l2Data.alternativeExercise ||
      l2Data.reps ||
      l2Data.weight ||
      l2Data.variation ||
      l1Data.alternativeExercise ||
      l1Data.reps ||
      l1Data.weight ||
      l1Data.variation
    );
  });

  if (movementsWithScaling.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateText}>
          No scaling variations configured for this WOD
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {movements.map((movement, index) => renderMovementComparison(movement, index))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 16,
  },
  movementComparisonCard: {
    padding: 16,
    backgroundColor: '#1A1F2E',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2D3748',
  },
  movementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  movementNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: colors.primary,
  },
  movementName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
  },
  scalingTree: {
    paddingLeft: 8,
  },
  scalingRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  scalingRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: 60,
  },
  levelIndicator: {
    alignItems: 'center',
    width: 24,
    position: 'relative',
  },
  levelIndicatorConnected: {
    // Extended height for connection line
  },
  levelDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    zIndex: 2,
  },
  levelLine: {
    position: 'absolute',
    top: 12,
    width: 2,
    height: 32,
    backgroundColor: colors.border,
  },
  levelLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: -2,
  },
  scalingDetails: {
    flex: 1,
    gap: 4,
  },
  alternativeText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.foreground,
  },
  variationText: {
    fontSize: 14,
    color: colors.mutedForeground,
    fontStyle: 'italic',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: 'center',
  },
});
