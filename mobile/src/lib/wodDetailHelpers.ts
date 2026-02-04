import type {
  WODWithDetails,
  WODMovementWithDetails,
  MovementCategoryName,
  GoalTypeName
} from '@/src/types/crossfit';

/**
 * WOD Detail Display Helpers
 * Functions to format and enhance WOD detail screen information
 */

// ============================================================================
// DISTANCE CONVERSIONS & FORMATTING
// ============================================================================

export interface DistanceDisplay {
  primary: string;        // e.g., "400m"
  secondary: string;      // e.g., "0.25 miles"
  context?: string;       // e.g., "~1 lap around track"
}

/**
 * Convert meters to miles with formatting
 */
export function metersToMiles(meters: number): string {
  const miles = meters / 1609.34;
  if (miles < 0.1) {
    return `${(miles * 100).toFixed(0)}ft`;
  }
  return `${miles.toFixed(2)} mi`;
}

/**
 * Convert meters to kilometers
 */
export function metersToKilometers(meters: number): string {
  const km = meters / 1000;
  return `${km.toFixed(2)} km`;
}

/**
 * Get contextual information for common distances
 */
export function getDistanceContext(meters: number): string | undefined {
  const contexts: Record<number, string> = {
    100: '~100m sprint',
    200: '~200m sprint',
    400: '~1 lap around track',
    800: '~2 laps around track',
    1000: '~1 kilometer',
    1600: '~1 mile / 4 laps',
    5000: '~5K / 3.1 miles',
    10000: '~10K / 6.2 miles',
  };

  return contexts[meters];
}

/**
 * Format distance with primary, secondary, and context
 */
export function formatDistance(value: number, unit: string): DistanceDisplay {
  const normalizedMeters = unit.toLowerCase() === 'm' ? value : value * 1000;

  return {
    primary: `${value} ${unit}`,
    secondary: metersToMiles(normalizedMeters),
    context: getDistanceContext(normalizedMeters),
  };
}

// ============================================================================
// MOVEMENT CATEGORY & GOAL TYPE HELPERS
// ============================================================================

export interface CategoryDisplay {
  icon: string;
  color: string;
  label: string;
}

/**
 * Get icon and color for movement category
 */
export function getCategoryDisplay(category: MovementCategoryName | string | null | undefined): CategoryDisplay {
  switch (category) {
    case 'Gymnastics':
      return {
        icon: '🤸',
        color: '#10B981', // green
        label: 'Gymnastics',
      };
    case 'Weightlifting':
      return {
        icon: '🏋️',
        color: '#8B5CF6', // purple
        label: 'Weightlifting',
      };
    case 'Monostructural':
      return {
        icon: '🏃',
        color: '#3B82F6', // blue
        label: 'Cardio',
      };
    case 'Recovery':
      return {
        icon: '🧘',
        color: '#F59E0B', // amber
        label: 'Recovery',
      };
    default:
      return {
        icon: '💪',
        color: '#6B7280', // gray
        label: 'Other',
      };
  }
}

/**
 * Get icon and color for goal type
 */
export function getGoalTypeDisplay(goalType: GoalTypeName | string | null | undefined): CategoryDisplay {
  switch (goalType) {
    case 'MetCon':
      return {
        icon: '⚡',
        color: '#0EA5E9', // cyan
        label: 'MetCon',
      };
    case 'Strength':
      return {
        icon: '💪',
        color: '#8B5CF6', // purple
        label: 'Strength',
      };
    case 'Skill':
      return {
        icon: '🎯',
        color: '#10B981', // green
        label: 'Skill',
      };
    case 'Mobility':
      return {
        icon: '🤸',
        color: '#3B82F6', // blue
        label: 'Mobility',
      };
    case 'Stretching':
      return {
        icon: '🧘',
        color: '#F59E0B', // amber
        label: 'Stretch',
      };
    case 'Recovery':
      return {
        icon: '🛌',
        color: '#6B7280', // gray
        label: 'Recovery',
      };
    case 'Cool-Down':
      return {
        icon: '❄️',
        color: '#06B6D4', // cyan
        label: 'Cool Down',
      };
    default:
      return {
        icon: '●',
        color: '#6B7280',
        label: 'Exercise',
      };
  }
}

// ============================================================================
// EQUIPMENT HELPERS
// ============================================================================

/**
 * Extract equipment needed from movements
 */
export function getRequiredEquipment(wod: WODWithDetails): string[] {
  const equipmentSet = new Set<string>();

  wod.movements?.forEach((movement) => {
    const exercise = movement.exercise;
    if (!exercise) return;

    // Check if movement requires weight
    if (exercise.requires_weight) {
      // Check equipment_types array
      if (exercise.equipment_types && exercise.equipment_types.length > 0) {
        exercise.equipment_types.forEach((eq) => equipmentSet.add(eq));
      } else {
        // Fallback: generic "weights"
        equipmentSet.add('Weights');
      }
    }

    // Check if movement requires distance (cardio equipment)
    if (exercise.requires_distance) {
      // Infer equipment from exercise name
      const name = exercise.name.toLowerCase();
      if (name.includes('run')) equipmentSet.add('Running');
      else if (name.includes('row')) equipmentSet.add('Rower');
      else if (name.includes('bike')) equipmentSet.add('Assault Bike');
      else if (name.includes('ski')) equipmentSet.add('Ski Erg');
      else if (name.includes('swim')) equipmentSet.add('Pool');
      else equipmentSet.add('Cardio Equipment');
    }

    // Check legacy equipment field
    if (exercise.equipment && exercise.equipment.length > 0) {
      exercise.equipment.forEach((eq) => equipmentSet.add(eq));
    }
  });

  return Array.from(equipmentSet);
}

// ============================================================================
// WOD STATISTICS
// ============================================================================

export interface WODStats {
  movementCount: number;
  dominantCategory: string;
  estimatedDuration: string;
  scoreTypes: string[];
  equipment: string[];
}

/**
 * Calculate WOD statistics for quick stats display
 */
export function getWODStats(wod: WODWithDetails): WODStats {
  const movementCount = wod.movements?.length || 0;

  // Determine dominant category
  const categoryCounts: Record<string, number> = {};
  wod.movements?.forEach((movement) => {
    // Since exercise doesn't have joined relations, we'll use a fallback
    const category = 'Mixed'; // TODO: fetch with proper relations
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  });

  const dominantCategory =
    Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Mixed';

  // Estimate duration
  let estimatedDuration = 'Varies';
  if (wod.time_cap_minutes) {
    const min = Math.floor(wod.time_cap_minutes * 0.6);
    const max = wod.time_cap_minutes;
    estimatedDuration = `${min}-${max} min`;
  } else if (wod.format?.name === 'AMRAP') {
    estimatedDuration = 'Varies';
  }

  // Score types
  const scoreTypes: string[] = [];
  if (wod.score_type_time) scoreTypes.push('Time');
  if (wod.score_type_rounds) scoreTypes.push('Rounds');
  if (wod.score_type_reps) scoreTypes.push('Reps');
  if (wod.score_type_load) scoreTypes.push('Load');
  if (wod.score_type_distance) scoreTypes.push('Distance');
  if (wod.score_type_calories) scoreTypes.push('Calories');

  // Equipment
  const equipment = getRequiredEquipment(wod);

  return {
    movementCount,
    dominantCategory,
    estimatedDuration,
    scoreTypes,
    equipment,
  };
}

// ============================================================================
// REP SCHEME VISUALIZATION DATA
// ============================================================================

export interface RepSchemeVisual {
  type: 'descending' | 'ascending' | 'fixed_rounds' | 'chipper' | 'amrap' | 'custom';
  values: number[];
  label: string;
  description: string;
}

/**
 * Parse rep scheme string into visual data
 */
export function parseRepSchemeVisual(wod: WODWithDetails): RepSchemeVisual | null {
  if (!wod.rep_scheme_type || !wod.rep_scheme) {
    return null;
  }

  const scheme = wod.rep_scheme;

  switch (wod.rep_scheme_type) {
    case 'descending':
    case 'ascending': {
      // Parse "21-18-15-12-9-6-3" into [21, 18, 15, 12, 9, 6, 3]
      const values = scheme.split('-').map((v) => parseInt(v.trim(), 10)).filter((v) => !isNaN(v));
      return {
        type: wod.rep_scheme_type,
        values,
        label: scheme,
        description: `${values.length} rounds with ${wod.rep_scheme_type} reps`,
      };
    }

    case 'fixed_rounds': {
      // Parse "5 rounds" into round count
      const match = scheme.match(/(\d+)\s*rounds?/i);
      const roundCount = match ? parseInt(match[1], 10) : 5;
      return {
        type: 'fixed_rounds',
        values: Array.from({ length: roundCount }, (_, i) => i + 1),
        label: `${roundCount} Rounds`,
        description: `Complete ${roundCount} rounds`,
      };
    }

    case 'chipper': {
      const movementCount = wod.movements?.length || 0;
      return {
        type: 'chipper',
        values: Array.from({ length: movementCount }, (_, i) => i + 1),
        label: 'Chipper',
        description: `Complete all ${movementCount} movements once`,
      };
    }

    case 'custom':
      return {
        type: 'custom',
        values: [],
        label: scheme,
        description: scheme,
      };

    default:
      return null;
  }
}

// ============================================================================
// WEIGHT FORMATTING
// ============================================================================

export interface WeightDisplay {
  display: string;
  men?: number;
  women?: number;
}

/**
 * Format weight with gender split
 */
export function formatWeight(menLbs?: number | null | undefined, womenLbs?: number | null | undefined): WeightDisplay | null {
  if (!menLbs && !womenLbs) {
    return null;
  }

  if (menLbs === womenLbs) {
    return {
      display: `${menLbs} lb`,
      men: menLbs,
      women: womenLbs,
    };
  }

  if (menLbs && womenLbs) {
    return {
      display: `${menLbs}/${womenLbs} lb`,
      men: menLbs,
      women: womenLbs,
    };
  }

  if (menLbs) {
    return {
      display: `${menLbs} lb (M)`,
      men: menLbs,
    };
  }

  if (womenLbs) {
    return {
      display: `${womenLbs} lb (W)`,
      women: womenLbs,
    };
  }

  return null;
}

// ============================================================================
// MOVEMENT CATEGORY & MUSCLE GROUP AGGREGATION
// ============================================================================

/**
 * Aggregate movement categories from all movements in a WOD
 * Returns a formatted string like "Gymnastics & Strength" or "Weightlifting, Gymnastics & Cardio"
 */
export function aggregateMovementCategories(movements: WODMovementWithDetails[]): string {
  if (!movements || movements.length === 0) {
    return 'Mixed';
  }

  // Extract unique categories
  const categories = new Set<string>();
  movements.forEach(movement => {
    const category = (movement.exercise as any)?.movement_category?.name;
    if (category) {
      categories.add(category);
    }
  });

  const categoryArray = Array.from(categories);

  if (categoryArray.length === 0) {
    return 'Mixed';
  }

  if (categoryArray.length === 1) {
    return categoryArray[0];
  }

  if (categoryArray.length === 2) {
    return categoryArray.join(' & ');
  }

  // 3 or more: "Category1, Category2 & Category3"
  const last = categoryArray.pop();
  return `${categoryArray.join(', ')} & ${last}`;
}

/**
 * Format muscle groups from exercise muscle regions
 * Returns primary muscles as a formatted string
 */
export function formatMuscleGroups(muscleRegions: any[]): string {
  if (!muscleRegions || muscleRegions.length === 0) {
    return '';
  }

  // Filter to primary muscles only
  const primaryMuscles = muscleRegions
    .filter(mr => mr.is_primary)
    .map(mr => mr.muscle_region?.name)
    .filter(Boolean);

  if (primaryMuscles.length === 0) {
    // Fall back to all muscles if no primary
    const allMuscles = muscleRegions
      .map(mr => mr.muscle_region?.name)
      .filter(Boolean);
    return allMuscles.slice(0, 3).join(', ');
  }

  return primaryMuscles.slice(0, 3).join(', ');
}

/**
 * Get placeholder image/icon for a movement based on category
 * Returns an emoji that can be used as placeholder
 */
export function getMovementPlaceholderIcon(categoryName?: MovementCategoryName | null): string {
  if (!categoryName) {
    return '⚡';
  }

  switch (categoryName) {
    case 'Gymnastics':
      return '🤸';
    case 'Weightlifting':
      return '🏋️';
    case 'Monostructural':
      return '🏃';
    case 'Recovery':
      return '🧘';
    default:
      return '⚡';
  }
}

/**
 * Format time cap display for integrated stats row
 * Avoids redundancy with header format info
 */
export function formatTimeCap(
  timeCap: number | null,
  formatName: string,
  repScheme?: string | null
): string {
  // For AMRAP, show the duration
  if (formatName === 'AMRAP' && timeCap) {
    return `${timeCap} min AMRAP`;
  }

  // For time capped WODs, show the cap
  if (timeCap) {
    return `${timeCap} min cap`;
  }

  // For uncapped WODs, estimate based on rep scheme
  // This is a simple heuristic - could be enhanced
  if (repScheme) {
    // For descending rep schemes like "21-15-9", estimate higher
    if (repScheme.includes('-')) {
      return '15-25 min';
    }
  }

  // Default estimate for For Time WODs
  if (formatName === 'For Time' || formatName === 'Rounds For Time') {
    return '10-20 min';
  }

  return 'Varies';
}
