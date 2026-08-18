// Client half of workout tags and the usage ledger. Network only — every
// judgment lives in the pure modules (workoutTagValidate, dailyCoverage).
import { supabase } from "../supabase";
import { validateWorkoutTags } from "../workoutTagValidate";
import { daysBetween } from "../dailyCoverage";
import type { CapturedWorkoutEntry } from "../../types/capture";
import type {
  BlockRole,
  TaggedWorkout,
  UsageRow,
  WorkoutMuscle,
  WorkoutTags,
} from "../../types/dailyBlocks";

export async function fetchMuscleRegionNames(): Promise<string[]> {
  const { data, error } = await supabase
    .from("muscle_regions")
    .select("name")
    .order("display_order", { ascending: true });
  if (error) {
    console.error("fetchMuscleRegionNames failed:", error);
    return [];
  }
  return (data ?? []).map((r) => r.name);
}

/** Every reviewed catalog workout with its tags and ledger recency —
 *  the block recommender's whole world. `today` is the caller's one clock
 *  sample. */
export async function fetchTaggedWorkouts(
  userId: string,
  today: string,
): Promise<TaggedWorkout[]> {
  const [workoutsRes, usageRes] = await Promise.all([
    supabase
      .from("captured_workouts")
      .select(`
        id, name, rounds, block_roles, est_minutes, intensity, skill_level,
        classified_at,
        source:captured_sources!inner(extraction_status),
        wmuscles:captured_workout_muscles(is_primary, muscle_region:muscle_regions(name))
      `)
      .eq("user_id", userId),
    // Newest first, and only rows that still name a workout: a deleted
    // workout's row can never date-stamp anything, so letting it through
    // would only spend the row budget below. That budget is what bounds this
    // read — at five blocks a day it covers roughly three months, and a
    // workout last done before then simply reads as never done, which errs
    // toward offering it.
    supabase
      .from("captured_workout_usage")
      .select("captured_workout_id, performed_date")
      .eq("user_id", userId)
      .not("captured_workout_id", "is", null)
      .order("performed_date", { ascending: false })
      .limit(500),
  ]);
  if (workoutsRes.error) {
    console.error("fetchTaggedWorkouts failed:", workoutsRes.error);
    return [];
  }
  // Recency is a nice-to-have, not the read: without it every workout reads
  // as never performed and the variety weighting flattens. Say so and carry
  // on rather than returning an empty catalog.
  if (usageRes.error) {
    console.error("fetchTaggedWorkouts usage read failed:", usageRes.error);
  }

  const lastPerformed = new Map<string, number>();
  for (const row of usageRes.data ?? []) {
    // The query excludes these; the guard stays because a deleted workout
    // leaves its ledger row with a null id — the training still counts for
    // coverage, but there is nothing left to date-stamp.
    if (!row.captured_workout_id) continue;
    // Rows arrive newest first, so the first one seen for a workout carries
    // its latest date. Rows sharing a date may come in any order, which
    // cannot matter: the date is the only thing read out of them.
    if (lastPerformed.has(row.captured_workout_id)) continue;
    lastPerformed.set(
      row.captured_workout_id,
      Math.max(0, daysBetween(row.performed_date, today)),
    );
  }

  return (workoutsRes.data ?? [])
    .filter((row: any) => row.source?.extraction_status === "reviewed")
    .map((row: any): TaggedWorkout => ({
      workoutId: row.id,
      name: row.name,
      rounds: row.rounds ?? null,
      lastPerformedDaysAgo: lastPerformed.get(row.id) ?? null,
      tags: {
        blockRoles: (row.block_roles ?? []) as BlockRole[],
        muscles: (row.wmuscles ?? [])
          .map((m: any): WorkoutMuscle => ({
            name: m.muscle_region?.name ?? "",
            isPrimary: !!m.is_primary,
          }))
          .filter((m: WorkoutMuscle) => m.name !== ""),
        estMinutes: row.est_minutes ?? null,
        intensity: row.intensity ?? null,
        skillLevel: row.skill_level ?? null,
        classifiedAt: row.classified_at ?? null,
      },
    }));
}

/** Write tags: the row's columns plus a replace of the muscle junction.
 *
 *  Order is the whole design here, because these are three statements and not
 *  a transaction. `classified_at` is what makes a workout visible to the
 *  recommender, and a workout visible with no muscles is one the soreness
 *  gate can never exclude — a chest workout offered on a chest-sore day,
 *  forever. So the muscles land first and the stamp goes last, and the
 *  junction is replaced by upserting the new rows and pruning the rest
 *  rather than by emptying it first: a failure partway leaves too many
 *  muscles, which merely over-excludes, never none.
 *
 *  This is the ONLY place `classified_at` is stamped. The validator always
 *  returns it null — null is exactly what the recommender reads as "untagged,
 *  ignore this workout" — so tags that were validated but never saved through
 *  here are invisible by design rather than by accident. */
export async function saveWorkoutTags(
  workoutId: string,
  // Omit the stamp: this function IS the stamp. Taking a `classifiedAt` it
  // silently discards would read like a second stamping site.
  tags: Omit<WorkoutTags, "classifiedAt">,
): Promise<boolean> {
  try {
    // Refused rather than written: see above — stamping a workout with no
    // muscles is the one outcome this function must never produce, and the
    // validator never asks for it.
    if (tags.muscles.length === 0) {
      console.error("saveWorkoutTags failed: no muscles to attach");
      return false;
    }

    const names = [...new Set(tags.muscles.map((m) => m.name))];
    const { data: regions, error: regError } = await supabase
      .from("muscle_regions")
      .select("id, name")
      .in("name", names);
    if (regError) throw regError;
    const idByName = new Map((regions ?? []).map((r) => [r.name as string, r.id as string]));

    // Keyed by region id, so a name the caller listed twice can't become two
    // rows for one conflict target in a single upsert.
    const byRegion = new Map<
      string,
      { captured_workout_id: string; muscle_region_id: string; is_primary: boolean }
    >();
    for (const m of tags.muscles) {
      const regionId = idByName.get(m.name);
      if (!regionId || byRegion.has(regionId)) continue;
      byRegion.set(regionId, {
        captured_workout_id: workoutId,
        muscle_region_id: regionId,
        is_primary: m.isPrimary,
      });
    }
    if (byRegion.size === 0) throw new Error("no muscle name matched a region");

    const { error: upError } = await supabase
      .from("captured_workout_muscles")
      .upsert([...byRegion.values()], {
        onConflict: "captured_workout_id,muscle_region_id",
      });
    if (upError) throw upError;

    // Drop whatever an earlier tagging left that this one doesn't claim.
    const { error: pruneError } = await supabase
      .from("captured_workout_muscles")
      .delete()
      .eq("captured_workout_id", workoutId)
      .not("muscle_region_id", "in", `(${[...byRegion.keys()].join(",")})`);
    if (pruneError) throw pruneError;

    const { error } = await supabase
      .from("captured_workouts")
      .update({
        block_roles: tags.blockRoles,
        est_minutes: tags.estMinutes,
        intensity: tags.intensity,
        skill_level: tags.skillLevel,
        classified_at: new Date().toISOString(),
      })
      .eq("id", workoutId);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error("saveWorkoutTags failed:", e);
    return false;
  }
}

/** Ask the model for tags, validate, save. Returns the saved tags, or null —
 *  a failed classification leaves the workout untagged and out of play,
 *  never half-tagged. */
export async function classifyWorkout(
  workout: CapturedWorkoutEntry,
  allowedMuscles: string[],
): Promise<WorkoutTags | null> {
  try {
    // The model has nothing to name a primary muscle from without the
    // vocabulary, and the validator rejects an answer with none. The edge
    // function refuses the call for the same reason; refusing it here too
    // means a backfill that lost the muscle list spends no network at all.
    if (allowedMuscles.length === 0) throw new Error("no muscle vocabulary");

    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: {
        action: "classify",
        name: workout.name,
        rounds: workout.rounds,
        caption: workout.source?.captionText ?? "",
        rawProtocol: workout.rawProtocol ?? "",
        muscles: allowedMuscles,
        items: workout.items.map((i) => ({
          name: i.name, sets: i.sets, reps: i.reps, duration: i.duration,
        })),
      },
    });
    if (error) throw error;
    const tags = validateWorkoutTags(data?.tags, new Set(allowedMuscles));
    if (!tags) return null;
    const saved = await saveWorkoutTags(workout.workoutId, tags);
    return saved ? tags : null;
  } catch (e) {
    // FunctionsHttpError says only "non-2xx"; the status it carries is the
    // upstream's own, so a 429 during the one-time backfill is legible as a
    // rate limit rather than as eleven identical mystery failures.
    const status = (e as { context?: { status?: number } })?.context?.status;
    console.error("classifyWorkout failed:", status ? `HTTP ${status}` : "", e);
    return null;
  }
}

/** The coverage window's ledger rows. */
export async function fetchUsage(
  userId: string,
  sinceDate: string,
): Promise<UsageRow[]> {
  const { data, error } = await supabase
    .from("captured_workout_usage")
    .select("captured_workout_id, performed_date, block, muscles")
    .eq("user_id", userId)
    .gte("performed_date", sinceDate);
  if (error) {
    console.error("fetchUsage failed:", error);
    return [];
  }
  return (data ?? []).map((r: any) => ({
    capturedWorkoutId: r.captured_workout_id,
    performedDate: r.performed_date,
    block: r.block,
    // JSONB arrives parsed, so the column's shape is whatever was written
    // rather than whatever this type promises. Coverage arithmetic keys on
    // `name` and weights on `isPrimary`, and an entry missing either would
    // accumulate load under "undefined" for the rest of the week.
    muscles: (Array.isArray(r.muscles) ? r.muscles : [])
      .filter((m: any) => m && typeof m.name === "string" && m.name !== "")
      .map((m: any): WorkoutMuscle => ({ name: m.name, isPrimary: !!m.isPrimary })),
  }));
}

export interface RecordUsageInput {
  userId: string;
  sessionId: string | null;
  performedDate: string;
  entries: { capturedWorkoutId: string; block: BlockRole; muscles: WorkoutMuscle[] }[];
}

/** Upsert, not insert: a retried completion must not double-count a
 *  workout's muscles in the coverage weighting. */
export async function recordUsage(input: RecordUsageInput): Promise<void> {
  if (input.entries.length === 0) return;
  const { error } = await supabase.from("captured_workout_usage").upsert(
    input.entries.map((e) => ({
      user_id: input.userId,
      captured_workout_id: e.capturedWorkoutId,
      performed_date: input.performedDate,
      block: e.block,
      muscles: e.muscles,
      session_id: input.sessionId,
    })),
    // Exactly captured_workout_usage_unique_performance. Every row written
    // here names a live workout, so the constraint's NULL-distinctness — which
    // exists for rows orphaned by a later delete — never applies to this
    // writer.
    { onConflict: "user_id,captured_workout_id,performed_date,block" },
  );
  if (error) console.error("recordUsage failed:", error);
}
