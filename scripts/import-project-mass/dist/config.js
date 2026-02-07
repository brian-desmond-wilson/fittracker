export const SPREADSHEET_ID = '1gBNQ4_NBQ0I3hT3bZNo9LZHLfhSkXTQ92Ns7-tXMRkU';
export const SHEET_CONFIGS = [
    { gid: 484725860, dayNumber: 1, focus: 'Lower Strength' },
    { gid: 1288547180, dayNumber: 2, focus: 'Upper Push Strength' },
    { gid: 954466183, dayNumber: 3, focus: 'Upper Pull Strength' },
    { gid: 1309240948, dayNumber: 5, focus: 'Lower Hypertrophy' },
    { gid: 2074668672, dayNumber: 6, focus: 'Upper Push Hypertrophy' },
    { gid: 1273628631, dayNumber: 7, focus: 'Upper Pull Hypertrophy' },
];
/** Known instances with their date ranges and cycle counts */
export const KNOWN_INSTANCES = [
    { number: 1, name: 'Project Mass - Feb 2016', startDate: '2/3/16', endDate: '3/7/16', cycles: [1] },
    { number: 2, name: 'Project Mass - Apr 2017', startDate: '4/3/17', endDate: '5/25/17', cycles: [1] },
    { number: 3, name: 'Project Mass - Mar 2018', startDate: '3/19/18', endDate: '9/5/18', cycles: [1, 2, 3] },
    { number: 4, name: 'Project Mass - Feb 2019', startDate: '2/19/19', endDate: '6/13/19', cycles: [1, 2] },
    { number: 5, name: 'Project Mass - Oct 2019', startDate: '10/21/19', endDate: '3/9/20', cycles: [1, 2, 3] },
    { number: 6, name: 'Project Mass - Mar 2021', startDate: '3/2/21', endDate: '6/11/21', cycles: [1, 2] },
    { number: 7, name: 'Project Mass - Oct 2021', startDate: '10/11/21', endDate: '12/27/21', cycles: [1] },
    { number: 8, name: 'Project Mass - Jan 2022', startDate: '1/31/22', endDate: '3/21/22', cycles: [1, 2] },
    { number: 9, name: 'Project Mass - Jun 2022', startDate: '6/28/22', endDate: '9/14/22', cycles: [1] },
    { number: 10, name: 'Project Mass - Dec 2023', startDate: '12/2/23', endDate: '2/27/24', cycles: [1, 2] },
    { number: 11, name: 'Project Mass - Oct 2024', startDate: '10/14/24', endDate: '12/28/24', cycles: [1] },
    { number: 12, name: 'Project Mass - Jan 2026', startDate: '1/26/26', endDate: 'ongoing', cycles: [1] },
];
/** Day number to workout type mapping */
export const DAY_TYPE = {
    1: 'Strength',
    2: 'Strength',
    3: 'Strength',
    5: 'Hypertrophy',
    6: 'Hypertrophy',
    7: 'Hypertrophy',
};
/** Day number to workout name mapping */
export const DAY_NAMES = {
    1: 'Lower Strength',
    2: 'Upper Push Strength',
    3: 'Upper Pull Strength',
    5: 'Lower Hypertrophy',
    6: 'Upper Push Hypertrophy',
    7: 'Upper Pull Hypertrophy',
};
/**
 * Periodization rep/set scheme per micro-session
 * Key: micro number (1-4), Value: { reps, sets }
 * Used ONLY for program_workout_exercises template targets — actual data is parsed from CSV.
 */
export const STRENGTH_SCHEME = {
    1: { reps: 3, sets: 4 },
    2: { reps: 4, sets: 5 },
    3: { reps: 5, sets: 4 },
    4: { reps: 3, sets: 2 },
};
export const HYPERTROPHY_SCHEME = {
    1: { reps: 10, sets: 4 },
    2: { reps: 10, sets: 5 },
    3: { reps: 12, sets: 4 },
    4: { reps: 8, sets: 2 },
};
/**
 * Cycle 2 exercise name remapping.
 * CSV headers always show Cycle 1 exercise names. In Cycle 2, different exercises
 * are logged in the same columns. This map provides the correct exercise name.
 * Key: dayNumber → Map<cycle1HeaderName, cycle2ExerciseName>
 *
 * Cycle 3 returns to Cycle 1 exercises (no remapping needed).
 * null value = exercise stays the same in Cycle 2.
 */
export const CYCLE_2_EXERCISE_MAP = {
    // Day 1 — Lower Strength
    1: {
        'Barbell Squat': 'Wide Stance Squat',
        'Barbell Deadlift': 'Sumo Deadlift',
        'Leg Press': 'High Stance Leg Press',
        'Romanian Deadlift': 'Wide Stance Snatch Grip Deadlift',
    },
    // Day 2 — Upper Push Strength
    2: {
        'Barbell Bench Press (Medium Grip)': 'Wide Grip Bench Press',
        'Barbell Incline Bench Press (Medium-Grip)': 'Decline Bench Press',
        'Standing Military Press': 'Push Press',
        'Close-Grip Barbell Bench Press': 'Weighted Dips',
    },
    // Day 3 — Upper Pull Strength
    3: {
        'Bent Over Barbell Row': null, // same
        'Pull Ups': 'T-Bar Row',
        'Barbell Curl': 'Upright Row',
        'Barbell Shrug': 'EZ-Bar Curl',
    },
    // Day 5 — Lower Hypertrophy
    5: {
        'Barbell Squat': 'Front Squat',
        'Dumbbell Walking Lunge': null, // same
        'Leg Extensions': null, // same (supersetted)
        'Lying Leg Curls': 'Seated Leg Curls',
        'Hyperextensions': 'Sissy Squat',
        'Stiff-Legged Dumbbell Deadlift (Dumbbell Romanian Deadlift)': null, // same
        'Leg Press': 'Single-Leg Press',
        'Seated Calf Raise': 'Donkey Calf Raise',
        'Calf Press on the Leg Press Machine': null, // same
        'Standing Calf Raises': null, // same
    },
    // Day 6 — Upper Push Hypertrophy
    6: {
        'Dumbbell Bench Press': 'Incline Dumbbell Press',
        'Barbell Incline Bench Press (Medium-Grip)': 'Machine Bench Press',
        'Flat Bench Cable Flyes': null, // same
        'Seated Dumbbell Press': 'Dumbbell Shoulder Press',
        'Side Lateral Raise': 'Front Incline Raise',
        'Reverse Machine Flyes': null, // same
        'EZ Bar Skullcrusher': null, // same
        'Cable Rope Overhead Triceps Extension': null, // same (supersetted)
        'Tricep Pushdown - Rope Attachment': 'Reverse Grip Pushdown',
        'Tricep Dumbbell Kickback': null, // same
        'Dips - Tricep Version': null, // same
    },
    // Day 7 — Upper Pull Hypertrophy
    7: {
        'Pullups': 'V-Bar Pullup',
        'Seated Cable Rows': 'Seal Row',
        'Wide Grip Lat Pulldown': 'Underhand Lat Pulldown',
        'One-Arm Dumbbell Row': 'Bent Over Two-Dumbbell Row',
        'Smith Machine Bent Over Row': null, // same
        'Bicep Curl': 'EZ-Bar Curl',
        'Standing Bicep Cable Curls': 'High Cable Curls',
        'Incline Dumbbell Curl': null, // same
    },
};
/**
 * Get the correct exercise name for a given cycle.
 * Cycle 1 & 3: use the header name as-is.
 * Cycle 2: look up the remapping, fall back to header name if not mapped.
 */
export function getExerciseNameForCycle(headerName, dayNumber, cycleNumber) {
    if (cycleNumber !== 2)
        return headerName; // Cycle 1 and 3 use header names
    const dayMap = CYCLE_2_EXERCISE_MAP[dayNumber];
    if (!dayMap)
        return headerName;
    const mapped = dayMap[headerName];
    if (mapped === undefined)
        return headerName; // not in map → keep original
    if (mapped === null)
        return headerName; // explicitly same → keep original
    return mapped;
}
/** Values in cells that should be treated as no data */
export const SKIP_VALUES = new Set([
    'n/a', 'dnf', 'no time', 'not complete', '--', '---', '',
    'no machine', 'no time ', // with trailing space
]);
/** Date gap threshold (in days) to detect new instances */
export const DATE_GAP_THRESHOLD = 14;
//# sourceMappingURL=config.js.map