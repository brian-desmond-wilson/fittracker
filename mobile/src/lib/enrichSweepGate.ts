// The periodic-sweep gate: at most once every seven days per device. Pure;
// the AsyncStorage read and write live in lib/supabase/enrich.ts.
// Spec: docs/superpowers/specs/2026-09-11-catalog-enrichment-pipeline-design.md §4, §7
export const SWEEP_LAST_RUN_KEY = "catalog.enrichSweep.lastRun.v1";
export const SWEEP_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
/** The weekly run's batch cap (§4). */
export const SWEEP_BATCH_LIMIT = 20;

/** True when the last recorded run is missing, unreadable, or ≥ 7 days old. */
export function sweepIsDue(lastRunIso: string | null, now: Date): boolean {
  if (!lastRunIso) return true;
  const last = Date.parse(lastRunIso);
  if (Number.isNaN(last)) return true;
  return now.getTime() - last >= SWEEP_INTERVAL_MS;
}
