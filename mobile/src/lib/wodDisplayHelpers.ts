import type { WODWithDetails, WODMovementWithDetails, ScalingLevel } from '@/src/types/crossfit';

/**
 * WOD Display Helpers
 * Functions to format WOD information for card display
 */

interface WODCardDisplay {
  formatLine: string;
  structureLine: string | null;
  movementsLine: string;
  movementsList: string[];
}

/**
 * Main function to get all display lines for a WOD card
 */
export function getWODCardDisplay(
  wod: WODWithDetails,
  scalingLevel: ScalingLevel = 'Rx'
): WODCardDisplay {
  const formatLine = buildFormatLine(wod);
  const structureLine = buildStructureLine(wod);
  const movementsLine = buildMovementsLine(wod, scalingLevel);
  const movementsList = buildMovementsList(wod, scalingLevel);

  return {
    formatLine,
    structureLine,
    movementsLine,
    movementsList,
  };
}

/**
 * Build Line 2: Format + Time Domain
 * Examples:
 * - "Reps For Time • 12 min"
 * - "5 Rounds For Time"
 * - "20 min AMRAP"
 * - "12 min EMOM"
 */
function buildFormatLine(wod: WODWithDetails): string {
  const format = wod.format?.name || 'For Time';
  const timeCap = wod.time_cap_minutes;

  // Special handling for "Rounds For Time" format
  if (format === 'Rounds For Time') {
    // Extract round count from rep_scheme if available
    const roundMatch = wod.rep_scheme?.match(/^(\d+)/);
    if (roundMatch) {
      const roundCount = roundMatch[1];
      let line = `${roundCount} Rounds For Time`;
      if (timeCap) {
        line += ` • ${timeCap} min`;
      }
      return line;
    }
    // If no round count found, just show format
    let line = format;
    if (timeCap) {
      line += ` • ${timeCap} min`;
    }
    return line;
  }

  // Determine if we need to prepend scoring type info for "For Time"
  let prefix = '';

  if (format === 'For Time' && wod.rep_scheme_type) {
    if (wod.rep_scheme_type === 'descending' || wod.rep_scheme_type === 'ascending') {
      prefix = 'Reps ';
    } else if (wod.rep_scheme_type === 'fixed_rounds') {
      // Extract round count from rep_scheme if available
      // Try various formats: "5 rounds", "5", just a number
      const roundMatch = wod.rep_scheme?.match(/^(\d+)/);
      if (roundMatch) {
        const roundCount = roundMatch[1];
        prefix = `${roundCount} Rounds `;
      } else {
        prefix = 'Rounds ';
      }
    }
  }

  // Build the format line
  let line = `${prefix}${format}`;

  // Add time cap if it exists
  if (timeCap) {
    line += ` • ${timeCap} min`;
  }

  return line;
}

/**
 * Build Line 3: Structure/Rep Scheme (conditional)
 * Only shown for certain WOD types
 * Examples:
 * - "21-18-15-12-9-6-3 reps"
 * - "7 movements → Single pass"
 * - null (omitted for fixed rounds, AMRAP, etc.)
 */
function buildStructureLine(wod: WODWithDetails): string | null {
  const repSchemeType = wod.rep_scheme_type;
  const repScheme = wod.rep_scheme;

  if (!repSchemeType || !repScheme) {
    return null;
  }

  switch (repSchemeType) {
    case 'descending':
    case 'ascending':
      // Show the rep scheme
      return `${repScheme} reps`;

    case 'chipper':
      // Show movement count
      const movementCount = wod.movements?.length || 0;
      return `${movementCount} movements → Single pass`;

    case 'custom':
      // Show custom scheme if it's short enough (< 40 chars)
      if (repScheme.length <= 40) {
        return repScheme;
      }
      return null;

    // For Load rep schemes
    case '1rm':
    case '3rm':
    case '5rm':
    case '10rm':
    case '5x5':
    case '3x3':
    case 'descending_volume':
    case 'complex':
      // Show the rep scheme for For Load workouts
      return repScheme;

    case 'fixed_rounds':
    case 'distance':
    default:
      // Omit structure line for these types
      return null;
  }
}

/**
 * Build Line 4: Movement Summary
 * Examples:
 * - "TTB • WB (20/14)"
 * - "Run 400m • 20 HS Walk"
 * - "5 Pull-up • 10 Push-up • 15 Squat"
 * - "7 movements" (if too many to list)
 */
function buildMovementsLine(
  wod: WODWithDetails,
  scalingLevel: ScalingLevel
): string {
  const movements = wod.movements || [];

  if (movements.length === 0) {
    return 'No movements configured';
  }

  // For Chippers with 4+ movements, just show count
  if (wod.rep_scheme_type === 'chipper' && movements.length > 3) {
    return `${movements.length} movements`;
  }

  // Otherwise, list up to 3 movements
  const movementsToShow = movements.slice(0, 3);
  const movementStrings = movementsToShow.map(movement =>
    formatMovementForCard(movement, scalingLevel, wod.rep_scheme_type)
  );

  let result = movementStrings.join(' • ');

  // Add "..." if there are more movements
  if (movements.length > 3) {
    result += ` • +${movements.length - 3} more`;
  }

  return result;
}

/**
 * Build movements list as an array (for rendering each on its own line)
 */
function buildMovementsList(
  wod: WODWithDetails,
  scalingLevel: ScalingLevel
): string[] {
  const movements = wod.movements || [];

  if (movements.length === 0) {
    return ['No movements configured'];
  }

  // Map all movements to their display strings
  const movementStrings = movements.map(movement =>
    formatMovementForCard(movement, scalingLevel, wod.rep_scheme_type)
  );

  return movementStrings;
}

/**
 * Format a single movement for display
 * Examples:
 * - "TTB" (bodyweight)
 * - "WB (20/14)" (with weight)
 * - "Run 400m" (with distance)
 * - "5 Pull-up" (with rep count for AMRAP/EMOM)
 */
function formatMovementForCard(
  movement: WODMovementWithDetails,
  scalingLevel: ScalingLevel,
  repSchemeType?: string | null
): string {
  const exercise = movement.exercise;
  if (!exercise) {
    return 'Unknown';
  }

  // Get movement name (prefer short_name, fallback to abbreviated name)
  const movementName = getMovementDisplayName(exercise.name, exercise.short_name);

  // Get scaling-specific values
  const reps = getScaledValue(movement, scalingLevel, 'reps');
  const weightMen = getScaledValue(movement, scalingLevel, 'weight_men_lbs');
  const weightWomen = getScaledValue(movement, scalingLevel, 'weight_women_lbs');
  const distanceValue = getScaledValue(movement, scalingLevel, 'distance_value');
  const distanceUnit = getScaledValue(movement, scalingLevel, 'distance_unit');

  // Build the display string
  let display = '';

  // Add reps prefix for AMRAP, EMOM, or fixed rounds (not for descending/ascending)
  if (reps && (repSchemeType === 'fixed_rounds' || !repSchemeType)) {
    display += `${reps} `;
  }

  // Add movement name
  display += movementName;

  // Add weight suffix (Men/Women format)
  if (weightMen || weightWomen) {
    if (weightMen === weightWomen) {
      display += ` (${weightMen})`;
    } else if (weightMen && weightWomen) {
      display += ` (${weightMen}/${weightWomen})`;
    } else if (weightMen) {
      display += ` (${weightMen})`;
    } else if (weightWomen) {
      display += ` (${weightWomen})`;
    }
  }

  // Add distance suffix
  if (distanceValue && distanceUnit) {
    const abbreviatedUnit = abbreviateDistanceUnit(String(distanceUnit));
    display += ` ${distanceValue} ${abbreviatedUnit}`;
  }

  return display;
}

/**
 * Get movement display name
 * Priority: short_name > abbreviated name > full name
 */
function getMovementDisplayName(
  fullName: string,
  shortName?: string | null
): string {
  // Use short_name if available
  if (shortName && shortName.trim()) {
    return shortName;
  }

  // If full name is short enough, use it
  if (fullName.length <= 15) {
    return fullName;
  }

  // Try to abbreviate multi-word names
  const words = fullName.split(' ');
  if (words.length >= 2) {
    // Take first letters of first word(s) + last word
    // Examples:
    // "Handstand Walk" → "HS Walk"
    // "Toes to Bar" → "TTB"
    // "Wall Ball" → "WB"
    if (words.length === 2) {
      const firstInitial = words[0].charAt(0).toUpperCase();
      const secondInitial = words[1].charAt(0).toUpperCase();
      return `${firstInitial}${secondInitial}`;
    } else {
      // For 3+ words, take initials
      return words.map(w => w.charAt(0).toUpperCase()).join('');
    }
  }

  // Fallback: truncate with ellipsis
  return fullName.substring(0, 12) + '...';
}

/**
 * Abbreviate distance units for compact display
 */
function abbreviateDistanceUnit(unit: string): string {
  const unitLower = unit.toLowerCase();

  // Common distance unit abbreviations
  const abbreviations: Record<string, string> = {
    'feet': 'ft',
    'foot': 'ft',
    'meters': 'm',
    'meter': 'm',
    'miles': 'mi',
    'mile': 'mi',
    'kilometers': 'km',
    'kilometer': 'km',
    'yards': 'yd',
    'yard': 'yd',
    'inches': 'in',
    'inch': 'in',
  };

  return abbreviations[unitLower] || unit;
}

/**
 * Get a scaled value from a movement
 */
function getScaledValue(
  movement: WODMovementWithDetails,
  scalingLevel: ScalingLevel,
  field: 'reps' | 'weight_men_lbs' | 'weight_women_lbs' | 'distance_value' | 'distance_unit'
): number | string | null {
  const prefix = scalingLevel.toLowerCase();
  const key = `${prefix}_${field}` as keyof WODMovementWithDetails;
  return (movement[key] as number | string | null) || null;
}

/**
 * Get scoring type description for display
 * Examples: "Rounds + Reps", "Time", "Reps", "Rounds"
 */
export function getScoringTypeDescription(wod: WODWithDetails): string {
  const scoreTypes: string[] = [];

  if (wod.score_type_rounds) scoreTypes.push('Rounds');
  if (wod.score_type_reps) scoreTypes.push('Reps');
  if (wod.score_type_time) scoreTypes.push('Time');
  if (wod.score_type_load) scoreTypes.push('Load');
  if (wod.score_type_distance) scoreTypes.push('Distance');
  if (wod.score_type_calories) scoreTypes.push('Calories');

  if (scoreTypes.length === 0) {
    return 'Complete';
  }

  if (scoreTypes.length === 1) {
    return scoreTypes[0];
  }

  // For multiple score types, join with " + "
  return scoreTypes.join(' + ');
}
