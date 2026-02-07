/**
 * Generate a URL-safe slug from a string.
 * "Barbell Bench Press (Medium Grip)" → "barbell-bench-press-medium-grip"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[()]/g, '')           // Remove parens
    .replace(/[^a-z0-9]+/g, '-')    // Replace non-alphanumeric with dashes
    .replace(/^-+|-+$/g, '')        // Trim leading/trailing dashes
    .replace(/-{2,}/g, '-');        // Collapse multiple dashes
}

/**
 * Normalize exercise names for consistent matching.
 * Handles common variations in spelling/formatting.
 */
export function normalizeExerciseName(name: string): string {
  let normalized = name.trim();
  
  // Remove content in parentheses that's just a description
  // But keep meaningful qualifiers like "(Medium Grip)"
  // For now, keep everything - we'll use the full name
  
  // Common abbreviations
  normalized = normalized.replace(/\bDB\b/gi, 'Dumbbell');
  normalized = normalized.replace(/\bBB\b/gi, 'Barbell');
  normalized = normalized.replace(/\bDL\b/gi, 'Deadlift');
  normalized = normalized.replace(/\bRDL\b/gi, 'Romanian Deadlift');
  normalized = normalized.replace(/\bExt\b/gi, 'Extension');
  normalized = normalized.replace(/\bExt\.\b/gi, 'Extension');
  normalized = normalized.replace(/\bHyperext\b/gi, 'Hyperextension');
  
  return normalized;
}

/**
 * Determine exercise category based on name
 */
export function guessExerciseCategory(name: string): 'Compound' | 'Isolation' | 'Accessory' {
  const lower = name.toLowerCase();
  const compoundPatterns = [
    'squat', 'bench press', 'deadlift', 'overhead press', 'military press',
    'row', 'pull-up', 'pull up', 'pullup', 'dip', 'push press',
    'clean', 'snatch', 'lunge', 'leg press',
  ];
  const isolationPatterns = [
    'curl', 'extension', 'raise', 'fly', 'flye', 'kickback',
    'pushdown', 'pulldown', 'calf', 'shrug', 'hyperextension',
  ];
  
  if (compoundPatterns.some(p => lower.includes(p))) return 'Compound';
  if (isolationPatterns.some(p => lower.includes(p))) return 'Isolation';
  return 'Accessory';
}

/**
 * Determine primary muscle groups based on exercise name
 */
export function guessMuscleGroups(name: string): string[] {
  const lower = name.toLowerCase();
  const groups: string[] = [];

  if (lower.includes('squat') || lower.includes('leg press') || lower.includes('leg extension') || lower.includes('lunge')) {
    groups.push('quadriceps');
    if (lower.includes('squat') || lower.includes('lunge') || lower.includes('leg press')) groups.push('glutes');
  }
  if (lower.includes('deadlift') || lower.includes('rdl') || lower.includes('romanian') || lower.includes('stiff')) {
    groups.push('hamstrings', 'glutes', 'back');
  }
  if (lower.includes('bench') || lower.includes('chest') || lower.includes('fly') || lower.includes('flye')) {
    groups.push('chest', 'triceps');
  }
  if (lower.includes('press') && (lower.includes('overhead') || lower.includes('military') || lower.includes('shoulder') || lower.includes('push press'))) {
    groups.push('shoulders', 'triceps');
  }
  if (lower.includes('row') || lower.includes('pull')) {
    groups.push('back', 'biceps');
  }
  if (lower.includes('curl')) groups.push('biceps');
  if (lower.includes('tricep') || lower.includes('pushdown') || lower.includes('skull') || lower.includes('close-grip') || lower.includes('kickback') || lower.includes('dip')) {
    groups.push('triceps');
  }
  if (lower.includes('lateral') || lower.includes('side') || lower.includes('front raise')) groups.push('shoulders');
  if (lower.includes('calf')) groups.push('calves');
  if (lower.includes('leg curl') || lower.includes('lying curl') || lower.includes('seated curl') || lower.includes('hamstring')) {
    groups.push('hamstrings');
  }
  if (lower.includes('shrug')) groups.push('trapezius');
  if (lower.includes('hyperext') || lower.includes('back ext')) groups.push('lower back', 'glutes');

  // Deduplicate
  return [...new Set(groups)];
}

/**
 * Determine equipment based on exercise name
 */
export function guessEquipment(name: string): string[] {
  const lower = name.toLowerCase();
  const equipment: string[] = [];

  if (lower.includes('barbell') || lower.includes('bench press') || lower.includes('deadlift') || lower.includes('squat') || lower.includes('military press') || lower.includes('row') && !lower.includes('cable') && !lower.includes('dumbbell')) {
    equipment.push('barbell');
  }
  if (lower.includes('dumbbell') || lower.includes('db ')) {
    equipment.push('dumbbells');
  }
  if (lower.includes('cable') || lower.includes('pulldown') || lower.includes('pushdown')) {
    equipment.push('cable machine');
  }
  if (lower.includes('leg press') || lower.includes('leg curl') || lower.includes('leg extension') || lower.includes('calf press') || lower.includes('machine')) {
    equipment.push('machine');
  }
  if (lower.includes('pull-up') || lower.includes('pull up') || lower.includes('pullup') || lower.includes('chin')) {
    equipment.push('pull-up bar');
  }
  if (lower.includes('bench') || lower.includes('incline') || lower.includes('decline')) {
    equipment.push('bench');
  }
  if (lower.includes('ez-bar') || lower.includes('ez bar')) {
    equipment.push('ez-bar');
  }
  if (lower.includes('smith')) equipment.push('smith machine');

  if (equipment.length === 0) equipment.push('bodyweight');
  return [...new Set(equipment)];
}

/**
 * Create an ImportStats object with zero values
 */
export function createEmptyStats() {
  return {
    exercisesCreated: 0,
    exercisesExisting: 0,
    programInstancesCreated: 0,
    workoutInstancesCreated: 0,
    exerciseInstancesCreated: 0,
    setInstancesCreated: 0,
    warmupSetsCreated: 0,
    workingSetsCreated: 0,
    splitWorkoutsDetected: 0,
    rowsSkipped: 0,
    errors: [] as string[],
    warnings: [] as string[],
  };
}
