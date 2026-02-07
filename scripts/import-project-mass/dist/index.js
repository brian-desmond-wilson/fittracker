import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { SHEET_CONFIGS, KNOWN_INSTANCES } from './config.js';
import { fetchSheetCSV, parseSheetCSV, detectSegments } from './parse-csv.js';
import { correlateInstances, collectAllExerciseNames } from './correlate.js';
import { previewImport } from './dry-run.js';
import { upsertExercises, upsertProgramTemplate, upsertProgramCycles, upsertProgramWorkouts, upsertProgramWorkoutExercises, upsertProgressions, importInstance, } from './database.js';
import { createEmptyStats } from './utils.js';
import { parseDate } from './parse-dates.js';
// ============================================================================
// CLI Flags
// ============================================================================
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const SINGLE_INSTANCE = args.find(a => a.startsWith('--instance='))?.split('=')[1];
const START_FROM = parseInt(args.find(a => a.startsWith('--start='))?.split('=')[1] || '1', 10);
// ============================================================================
// Environment validation
// ============================================================================
function validateEnv() {
    const required = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'BRIAN_USER_ID'];
    const missing = required.filter(k => !process.env[k]);
    if (missing.length > 0 && !DRY_RUN) {
        console.error(`❌ Missing environment variables: ${missing.join(', ')}`);
        console.error(`   Copy .env.example to .env and fill in the values.`);
        process.exit(1);
    }
}
// ============================================================================
// Main
// ============================================================================
async function main() {
    console.log('');
    console.log('🏋️ ═══════════════════════════════════════════════════════════');
    console.log('   PROJECT MASS IMPORT SCRIPT');
    console.log(`   ${DRY_RUN ? '🔍 DRY RUN MODE — no database changes' : '💾 LIVE MODE — writing to database'}`);
    console.log(`   ${VERBOSE ? '📢 Verbose output enabled' : ''}`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('');
    if (!DRY_RUN) {
        validateEnv();
    }
    const userId = process.env.BRIAN_USER_ID || 'bd91dc7e-7eb8-4655-b05a-c9f72db39e9e';
    // ── Phase 0: Fetch and parse all 6 sheets ──────────────────────────
    console.log('📥 Phase 0: Fetching sheets from Google Sheets...');
    const allSheetData = [];
    for (const config of SHEET_CONFIGS) {
        process.stdout.write(`   Fetching Day ${config.dayNumber} (${config.focus})... `);
        try {
            const csvText = await fetchSheetCSV(config.gid);
            const sheetData = parseSheetCSV(csvText, config);
            allSheetData.push(sheetData);
            const dataRows = sheetData.rows.filter(r => r.exercises.length > 0);
            console.log(`✅ ${dataRows.length} data rows, ${sheetData.exerciseNames.length} exercises`);
            if (VERBOSE) {
                console.log(`      Exercises: ${sheetData.exerciseNames.join(', ')}`);
            }
        }
        catch (err) {
            console.log(`❌ ${err.message}`);
            process.exit(1);
        }
    }
    // ── Phase 0.5: Detect instance segments per sheet ──────────────────
    console.log('\n🔍 Detecting instance boundaries...');
    const knownDates = KNOWN_INSTANCES.map(k => ({
        startDate: parseDate(k.startDate),
        endDate: k.endDate === 'ongoing' ? null : parseDate(k.endDate),
    }));
    const allSegments = [];
    for (const sheetData of allSheetData) {
        const segments = detectSegments(sheetData, knownDates);
        allSegments.push(segments);
        console.log(`   Day ${sheetData.dayNumber} (${sheetData.focus}): ${segments.length} instance segments`);
        if (VERBOSE) {
            for (const seg of segments) {
                const dateStr = `${seg.startDate.toLocaleDateString()} → ${seg.endDate.toLocaleDateString()}`;
                const rowCount = seg.rows.filter(r => r.exercises.length > 0).length;
                console.log(`      ${dateStr}: ${rowCount} workout rows, ${seg.cycleMarkers.length} cycle markers`);
            }
        }
    }
    // ── Phase 0.6: Correlate across sheets ─────────────────────────────
    console.log('\n🔗 Correlating instances across sheets...');
    const instances = correlateInstances(allSegments);
    console.log(`   Found ${instances.length} program instances:`);
    for (const inst of instances) {
        const dateStr = inst.isOngoing
            ? `${inst.startDate.toLocaleDateString()} → ongoing`
            : `${inst.startDate.toLocaleDateString()} → ${inst.endDate.toLocaleDateString()}`;
        console.log(`   #${inst.instanceNumber} ${inst.name}: ${dateStr} (${inst.segments.length}/6 sheets, cycles: ${inst.cycles.join(',')})`);
    }
    // Filter to single instance if specified
    let instancesToImport = instances;
    if (SINGLE_INSTANCE) {
        const num = parseInt(SINGLE_INSTANCE);
        instancesToImport = instances.filter(i => i.instanceNumber === num);
        if (instancesToImport.length === 0) {
            console.error(`\n❌ Instance #${SINGLE_INSTANCE} not found`);
            process.exit(1);
        }
        console.log(`\n🎯 Importing only instance #${SINGLE_INSTANCE}`);
    }
    // ── Collect ALL exercise names (Cycle 1 headers + Cycle 2 remapped) ──
    console.log('\n🔍 Collecting exercise names (all cycles)...');
    const allExerciseNames = collectAllExerciseNames(instancesToImport);
    // Also add raw header names for completeness
    for (const sheet of allSheetData) {
        for (const name of sheet.exerciseNames) {
            allExerciseNames.add(name);
        }
    }
    console.log(`   ${allExerciseNames.size} unique exercises across all cycles`);
    // ── DRY RUN MODE ───────────────────────────────────────────────────
    if (DRY_RUN) {
        console.log('\n🔍 DRY RUN — analyzing data...');
        const stats = previewImport(instancesToImport, allSheetData, allExerciseNames, VERBOSE);
        printStats(stats);
        console.log('\n✅ Dry run complete. Run without --dry-run to import.');
        return;
    }
    // ── LIVE MODE ──────────────────────────────────────────────────────
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const stats = createEmptyStats();
    // ── Phase 1A: Upsert exercises ─────────────────────────────────────
    console.log('\n📦 Phase 1A: Upserting exercises...');
    console.log(`   ${allExerciseNames.size} unique exercises to process`);
    const exerciseIdMap = await upsertExercises(supabase, allExerciseNames, stats, VERBOSE);
    console.log(`   ✅ ${stats.exercisesCreated} created, ${stats.exercisesExisting} existing`);
    // ── Phase 1B: Upsert program template ──────────────────────────────
    console.log('\n📦 Phase 1B: Upserting program template...');
    const programId = await upsertProgramTemplate(supabase, userId, VERBOSE);
    // ── Phase 1C: Upsert cycles ────────────────────────────────────────
    console.log('\n📦 Phase 1C: Upserting program cycles...');
    const cycleMap = await upsertProgramCycles(supabase, programId, VERBOSE);
    // ── Phase 1D: Upsert program workouts ──────────────────────────────
    console.log('\n📦 Phase 1D: Upserting program workouts...');
    const workoutMap = await upsertProgramWorkouts(supabase, programId, cycleMap, VERBOSE);
    // ── Phase 1E: Upsert program workout exercises ─────────────────────
    console.log('\n📦 Phase 1E: Upserting program workout exercises...');
    await upsertProgramWorkoutExercises(supabase, programId, workoutMap, exerciseIdMap, instancesToImport, VERBOSE);
    // ── Phase 1F: Upsert progressions ─────────────────────────────────
    console.log('\n📦 Phase 1F: Upserting exercise progressions...');
    await upsertProgressions(supabase, workoutMap, VERBOSE);
    // ── Phase 2: Import instance data ──────────────────────────────────
    console.log('\n📝 Phase 2: Importing instance data...');
    for (const instance of instancesToImport) {
        if (instance.instanceNumber < START_FROM) {
            console.log(`\n   ─── #${instance.instanceNumber} ${instance.name} ─── (skipped, --start=${START_FROM})`);
            continue;
        }
        console.log(`\n   ─── #${instance.instanceNumber} ${instance.name} ───`);
        try {
            await importInstance(supabase, instance, programId, workoutMap, exerciseIdMap, userId, stats, VERBOSE);
        }
        catch (err) {
            stats.errors.push(`Failed to import instance "${instance.name}": ${err.message}`);
            console.error(`   ❌ ${err.message}`);
        }
    }
    // ── Summary ────────────────────────────────────────────────────────
    printStats(stats);
    console.log('\n✅ Import complete!');
}
function printStats(stats) {
    console.log('\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('📊 IMPORT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   Exercises:          ${stats.exercisesCreated} created, ${stats.exercisesExisting} existing`);
    console.log(`   Program Instances:  ${stats.programInstancesCreated}`);
    console.log(`   Workout Instances:  ${stats.workoutInstancesCreated}`);
    console.log(`   Exercise Instances: ${stats.exerciseInstancesCreated}`);
    console.log(`   Set Instances:      ${stats.setInstancesCreated} total`);
    console.log(`     ├─ Working Sets:  ${stats.workingSetsCreated}`);
    console.log(`     └─ Warmup Sets:   ${stats.warmupSetsCreated}`);
    console.log(`   Split Workouts:     ${stats.splitWorkoutsDetected}`);
    if (stats.warnings.length > 0) {
        console.log(`\n⚠️  WARNINGS (${stats.warnings.length}):`);
        const uniqueWarnings = [...new Set(stats.warnings)];
        for (const w of uniqueWarnings.slice(0, 20)) {
            console.log(`   • ${w}`);
        }
        if (uniqueWarnings.length > 20) {
            console.log(`   ... and ${uniqueWarnings.length - 20} more`);
        }
    }
    if (stats.errors.length > 0) {
        console.log(`\n❌ ERRORS (${stats.errors.length}):`);
        const uniqueErrors = [...new Set(stats.errors)];
        for (const e of uniqueErrors.slice(0, 20)) {
            console.log(`   • ${e}`);
        }
        if (uniqueErrors.length > 20) {
            console.log(`   ... and ${uniqueErrors.length - 20} more`);
        }
    }
    console.log('═══════════════════════════════════════════════════════════════');
}
// Run
main().catch(err => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map