/**
 * Cleanup script: Delete all workout data for Project Mass instances
 * (preserves exercises and program template, just removes instance data)
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const userId = process.env.BRIAN_USER_ID;
async function cleanup() {
    console.log('🧹 Cleaning up Project Mass workout data...\n');
    // Find all program instances for this user
    const { data: instances, error: instErr } = await supabase
        .from('program_instances')
        .select('id, instance_name')
        .eq('user_id', userId);
    if (instErr) {
        console.error('Failed to fetch instances:', instErr.message);
        return;
    }
    if (!instances || instances.length === 0) {
        console.log('No instances found. Nothing to clean.');
        return;
    }
    console.log(`Found ${instances.length} program instances:`);
    for (const inst of instances) {
        console.log(`  - ${inst.instance_name} (${inst.id})`);
    }
    const instanceIds = instances.map(i => i.id);
    // Delete workout instances (cascades to exercise_instances → set_instances)
    const { count: wiCount, error: wiErr } = await supabase
        .from('workout_instances')
        .delete({ count: 'exact' })
        .in('program_instance_id', instanceIds);
    if (wiErr) {
        console.error('Failed to delete workout instances:', wiErr.message);
        return;
    }
    console.log(`\n✅ Deleted ${wiCount} workout instances (+ cascaded exercise/set instances)`);
    // Delete the program instances themselves
    const { count: piCount, error: piErr } = await supabase
        .from('program_instances')
        .delete({ count: 'exact' })
        .in('id', instanceIds);
    if (piErr) {
        console.error('Failed to delete program instances:', piErr.message);
        return;
    }
    console.log(`✅ Deleted ${piCount} program instances`);
    console.log('\n🧹 Cleanup complete. Ready for re-import.');
}
cleanup().catch(console.error);
//# sourceMappingURL=cleanup.js.map