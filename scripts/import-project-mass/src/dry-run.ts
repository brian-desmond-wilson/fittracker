import type { ProgramInstanceData, SheetData, ImportStats } from './types.js';
import { buildWorkouts } from './correlate.js';

/**
 * Preview what would be imported without making any database changes
 */
export function previewImport(
  instances: ProgramInstanceData[],
  allSheetData: SheetData[],
  allExerciseNames: Set<string>,
  verbose: boolean,
): ImportStats {
  const stats: ImportStats = {
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
    errors: [],
    warnings: [],
  };

  console.log('\n📋 UNIQUE EXERCISES FOUND (all cycles):');
  const sortedExercises = [...allExerciseNames].sort();
  for (const name of sortedExercises) {
    console.log(`   • ${name}`);
  }
  console.log(`   Total: ${allExerciseNames.size} exercises\n`);
  stats.exercisesCreated = allExerciseNames.size;

  // Preview each instance
  console.log('📋 PROGRAM INSTANCES:');
  stats.programInstancesCreated = instances.length;

  for (const instance of instances) {
    const workouts = buildWorkouts(instance);

    const totalSets = workouts.reduce((sum, w) =>
      sum + w.exercises.reduce((eSum, e) =>
        eSum + e.workingSets.length + e.warmupSets.length, 0
      ), 0
    );

    const workingSets = workouts.reduce((sum, w) =>
      sum + w.exercises.reduce((eSum, e) =>
        eSum + e.workingSets.length, 0
      ), 0
    );

    const warmupSets = workouts.reduce((sum, w) =>
      sum + w.exercises.reduce((eSum, e) =>
        eSum + e.warmupSets.length, 0
      ), 0
    );

    const splitCount = workouts.filter(w => w.endDate !== null).length;

    console.log(`\n   #${instance.instanceNumber} ${instance.name}`);
    console.log(`      📅 ${formatDateShort(instance.startDate)} → ${instance.isOngoing ? 'ongoing' : formatDateShort(instance.endDate)}`);
    console.log(`      🔄 Cycles: ${instance.cycles.join(', ')}`);
    console.log(`      📊 ${workouts.length} workouts, ${totalSets} total sets (${workingSets} working, ${warmupSets} warmup)`);
    console.log(`      📑 ${instance.segments.length}/6 sheets matched`);
    if (splitCount > 0) console.log(`      ✂️  ${splitCount} split workouts`);

    stats.workoutInstancesCreated += workouts.length;
    stats.setInstancesCreated += totalSets;
    stats.warmupSetsCreated += warmupSets;
    stats.workingSetsCreated += workingSets;
    stats.splitWorkoutsDetected += splitCount;

    if (verbose) {
      for (const workout of workouts) {
        const exCount = workout.exercises.length;
        const wSets = workout.exercises.reduce((s, e) => s + e.workingSets.length, 0);
        console.log(`      W${workout.weekNumber}D${workout.dayNumber} C${workout.cycleNumber} (${formatDateShort(workout.scheduledDate)}): ${exCount} exercises, ${wSets} working sets${workout.endDate ? ' [SPLIT]' : ''}`);
        for (const ex of workout.exercises) {
          const sets = ex.workingSets.map(s => {
            let label = `${s.reps}x${s.weight}`;
            if (s.difficulty) label += s.difficulty;
            if (s.increaseWeight) label += '^';
            return label;
          }).join(', ');
          const warmups = ex.warmupSets.map(s => `${s.reps}x${s.weight}${s.difficulty || ''}`).join(', ');
          console.log(`         ${ex.order}. ${ex.exerciseName}: ${sets}${warmups ? ` [warmup: ${warmups}]` : ''}`);
        }
      }
    }

    // Count exercise instances
    stats.exerciseInstancesCreated += workouts.reduce((sum, w) => sum + w.exercises.length, 0);
  }

  return stats;
}

function formatDateShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
}
