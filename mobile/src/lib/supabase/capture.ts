// Client half of capture-post, plus the writes the review sheet commits and
// the catalog read. Save is a SEQUENCE, not a DB transaction (the JS client
// cannot open one): the source row goes first as 'pending', children follow,
// and 'reviewed' is stamped last — so a failure partway leaves a retryable
// pending source, never a half-visible catalog entry.
import { supabase } from "../supabase";
import { decodeCaption } from "../captionText";
import { createExercise, fetchGoalTypes, fetchMovementCategories } from "./crossfit";
import { mapCategory } from "../captureReview";
import { collapseByPost } from "../captureUrl";
import type {
  CapturedWorkoutEntry,
  CaptureSource,
  CatalogEntry,
  ExtractedPost,
  ResolvedPost,
} from "../../types/capture";

export async function resolvePost(url: string): Promise<ResolvedPost | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: { action: "resolve", url },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as ResolvedPost;
  } catch (e) {
    console.error("capture resolve failed:", e);
    return null;
  }
}

/** Raw extraction — sanitize with captureReview.sanitizeExtraction before use. */
export async function extractPost(input: {
  caption: string;
  handle: string | null;
  platform: string;
  library: { id: string; name: string }[];
  muscles: string[];
  equipment: string[];
}): Promise<unknown | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: {
        action: "extract",
        caption: input.caption,
        handle: input.handle ?? "",
        platform: input.platform,
        library: input.library,
        muscles: input.muscles,
        equipment: input.equipment,
      },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data?.extraction ?? null;
  } catch (e) {
    console.error("capture extract failed:", e);
    return null;
  }
}

/**
 * A one-line description for a workout, written from the post's caption.
 *
 * Suggest only: it hands back text for a field the owner still has to accept
 * and save. Captures made before the extraction learned to write a summary
 * have no description at all, and this is how they get one.
 */
export async function summarizeCaption(
  caption: string,
  handle: string | null,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: { action: "summarize", caption, handle: handle ?? "" },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return typeof data?.summary === "string" ? data.summary : null;
  } catch (e) {
    console.error("capture summarize failed:", e);
    return null;
  }
}

/** A capture of this URL already reviewed by this user, if any. */
export async function findExistingCapture(
  userId: string,
  sourceUrl: string,
): Promise<{ id: string; extraction_status: string } | null> {
  const { data, error } = await supabase
    .from("captured_sources")
    .select("id, extraction_status")
    .eq("user_id", userId)
    .eq("source_url", sourceUrl)
    .maybeSingle();
  if (error) {
    console.error("existing capture lookup failed:", error);
    return null;
  }
  return data;
}

export interface SaveCaptureInput {
  userId: string;
  sourceUrl: string;
  platform: string;
  posterHandle: string | null;
  captionText: string | null;
  thumbnailUrl: string | null;
  rawExtraction: unknown;
  /** The reviewed (user-edited) extraction to persist. */
  post: ExtractedPost;
}

/** Commit an accepted review. Returns the source id, or null on failure. */
export async function saveCapture(input: SaveCaptureInput): Promise<string | null> {
  try {
    // Name→id maps for the reference tables createExercise needs.
    const [goalTypes, movementCategories] = await Promise.all([
      fetchGoalTypes(),
      fetchMovementCategories(),
    ]);
    const goalIdByName = new Map(goalTypes.map((g) => [g.name, g.id]));
    const mcIdByName = new Map(movementCategories.map((m) => [m.name, m.id]));

    // Muscle name→id map.
    const { data: muscleRows, error: muscleError } = await supabase
      .from("muscle_regions")
      .select("id, name");
    if (muscleError) throw muscleError;
    const muscleIdByName = new Map((muscleRows ?? []).map((m) => [m.name, m.id]));

    // 1. Claim the source row. The URL is unique per user, and a failed
    //    earlier save leaves a pending row behind — a plain insert would
    //    collide with it on every retry, making the first flaky-network save
    //    permanent. So: a reviewed row means this capture already succeeded;
    //    a pending/failed row is reclaimed, its children cleared, and the
    //    retry writes a clean set.
    const existing = await findExistingCapture(input.userId, input.sourceUrl);
    let sourceId: string;
    if (existing) {
      if (existing.extraction_status === "reviewed") return existing.id;

      const { error: clearLinksError } = await supabase
        .from("source_exercises")
        .delete()
        .eq("source_id", existing.id);
      if (clearLinksError) throw clearLinksError;
      // captured_workout_exercises cascades from captured_workouts.
      const { error: clearWorkoutsError } = await supabase
        .from("captured_workouts")
        .delete()
        .eq("source_id", existing.id);
      if (clearWorkoutsError) throw clearWorkoutsError;

      const { error: reclaimError } = await supabase
        .from("captured_sources")
        .update({
          platform: input.platform,
          poster_handle: input.posterHandle,
          caption_text: input.captionText,
          thumbnail_url: input.thumbnailUrl,
          raw_extraction: input.rawExtraction ?? null,
          extraction_status: "pending",
        })
        .eq("id", existing.id);
      if (reclaimError) throw reclaimError;
      sourceId = existing.id;
    } else {
      const { data: source, error: sourceError } = await supabase
        .from("captured_sources")
        .insert({
          user_id: input.userId,
          platform: input.platform,
          source_url: input.sourceUrl,
          poster_handle: input.posterHandle,
          caption_text: input.captionText,
          thumbnail_url: input.thumbnailUrl,
          raw_extraction: input.rawExtraction ?? null,
          extraction_status: "pending",
        })
        .select("id")
        .single();
      if (sourceError) throw sourceError;
      sourceId = source.id as string;
    }

    // 2. Each exercise: link the matched library entry, or create a new one
    //    through the SAME path the Add Exercise wizard uses.
    const exerciseIds: string[] = [];
    for (const ex of input.post.exercises) {
      let exerciseId = ex.libraryMatchId;
      let reusedOwn = false;
      if (!exerciseId) {
        // A failed earlier attempt may already have created this exercise
        // (exercises outlive their source's rollback-by-status). An exact
        // name match owned by this user is that leftover — link it instead
        // of minting a twin.
        const { data: dupes, error: dupeError } = await supabase
          .from("exercises")
          .select("id")
          .eq("name", ex.name)
          .eq("created_by", input.userId)
          .limit(1);
        if (dupeError) throw dupeError;
        if (dupes && dupes.length > 0) {
          exerciseId = dupes[0].id as string;
          reusedOwn = true;
        }
      }
      if (!exerciseId) {
        const { goalType, movementCategory } = mapCategory(ex.category);
        const movementCategoryId = mcIdByName.get(movementCategory);
        if (!movementCategoryId) throw new Error(`unknown movement category: ${movementCategory}`);
        const goalTypeId = goalIdByName.get(goalType);
        const muscleIds = [...ex.primaryMuscles, ...ex.secondaryMuscles]
          .map((n) => muscleIdByName.get(n))
          .filter((id): id is string => !!id);
        const primaryIds = ex.primaryMuscles
          .map((n) => muscleIdByName.get(n))
          .filter((id): id is string => !!id);

        exerciseId = await createExercise({
          name: ex.name,
          description: ex.description ?? undefined,
          movement_category_id: movementCategoryId,
          goal_type_ids: goalTypeId ? [goalTypeId] : [],
          skill_level: ex.skillLevel,
          equipment_types: ex.equipment,
          muscle_region_ids: muscleIds,
          primary_muscle_region_ids: primaryIds,
          is_movement: false,
          is_official: false,
          created_by: input.userId,
        });
      }
      exerciseIds.push(exerciseId);

      const { error: linkError } = await supabase.from("source_exercises").insert({
        source_id: sourceId,
        exercise_id: exerciseId,
        was_created: !ex.libraryMatchId && !reusedOwn,
      });
      if (linkError) throw linkError;
    }

    // 3. Full workout: preserve the creator's programming.
    if (input.post.workout) {
      const { data: workout, error: workoutError } = await supabase
        .from("captured_workouts")
        .insert({
          source_id: sourceId,
          user_id: input.userId,
          name: input.post.workout.name,
          rounds: input.post.workout.rounds,
          raw_protocol: input.post.workout.rawProtocol,
          description: input.post.workout.summary,
        })
        .select("id")
        .single();
      if (workoutError) throw workoutError;

      const items = input.post.workout.items.map((item, i) => ({
        captured_workout_id: workout.id,
        exercise_id: exerciseIds[item.exerciseIndex],
        exercise_order: i,
        target_sets: item.sets,
        target_reps: item.reps,
        target_weight: item.weight,
        target_duration: item.duration,
        rest_seconds: item.restSeconds,
        notes: item.notes,
      }));
      const { error: itemsError } = await supabase
        .from("captured_workout_exercises")
        .insert(items);
      if (itemsError) throw itemsError;
    }

    // 4. Only now is the capture real.
    const { error: doneError } = await supabase
      .from("captured_sources")
      .update({ extraction_status: "reviewed" })
      .eq("id", sourceId);
    if (doneError) throw doneError;

    return sourceId;
  } catch (e) {
    console.error("saveCapture failed:", e);
    return null;
  }
}

/** Shared by the list and the single-workout screen so both read a row the
 *  same way. */
function toCapturedWorkoutEntry(row: any): CapturedWorkoutEntry {
  return {
    workoutId: row.id,
    name: row.name,
    rounds: row.rounds ?? null,
    rawProtocol: row.raw_protocol ?? null,
    description: row.description ?? null,
    notes: row.notes ?? null,
    capturedAt: row.created_at,
    source: row.source
      ? {
          sourceId: row.source.id,
          platform: row.source.platform,
          sourceUrl: row.source.source_url,
          posterHandle: row.source.poster_handle,
          thumbnailUrl: row.source.thumbnail_url,
          // Stored as the platform's HTML; decoded here so every reader gets
          // the creator's actual characters rather than "&#x2705;".
          captionText: decodeCaption(row.source.caption_text) || null,
        }
      : null,
    items: (row.items ?? [])
      .slice()
      .sort((a: any, b: any) => a.exercise_order - b.exercise_order)
      .map((it: any) => ({
        exerciseId: it.exercise?.id ?? "",
        name: it.exercise?.name ?? "Unknown movement",
        sets: it.target_sets ?? null,
        reps: it.target_reps ?? null,
        weight: it.target_weight ?? null,
        duration: it.target_duration ?? null,
        restSeconds: it.rest_seconds ?? null,
        notes: it.notes ?? null,
      })),
  };
}

/** Captured workouts with their movements and provenance, newest first.
 *  Without this read the workouts are write-only: the rows exist and nothing
 *  in the app can show them. */
export async function fetchCapturedWorkouts(
  userId: string,
): Promise<CapturedWorkoutEntry[]> {
  const { data, error } = await supabase
    .from("captured_workouts")
    .select(`
      id, name, rounds, raw_protocol, description, notes, created_at,
      source:captured_sources!inner(
        id, platform, source_url, poster_handle, thumbnail_url, caption_text,
        extraction_status
      ),
      items:captured_workout_exercises(
        exercise_order, target_sets, target_reps, target_weight,
        target_duration, rest_seconds, notes,
        exercise:exercises(id, name)
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("fetchCapturedWorkouts failed:", error);
    return [];
  }

  return (data ?? [])
    // A save that never finished leaves a pending source; don't show its
    // half-built workout.
    .filter((row: any) => row.source?.extraction_status === "reviewed")
    .map(toCapturedWorkoutEntry);
}

/** One captured workout, for its own screen. A pushed screen gets an id, not
 *  a prop, so it loads its own row rather than trusting what the list had. */
export async function fetchCapturedWorkout(
  workoutId: string,
): Promise<CapturedWorkoutEntry | null> {
  const { data, error } = await supabase
    .from("captured_workouts")
    .select(`
      id, name, rounds, raw_protocol, description, notes, created_at,
      source:captured_sources!inner(
        id, platform, source_url, poster_handle, thumbnail_url, caption_text,
        extraction_status
      ),
      items:captured_workout_exercises(
        exercise_order, target_sets, target_reps, target_weight,
        target_duration, rest_seconds, notes,
        exercise:exercises(id, name)
      )
    `)
    .eq("id", workoutId)
    .maybeSingle();
  if (error) {
    console.error("fetchCapturedWorkout failed:", error);
    return null;
  }
  return data ? toCapturedWorkoutEntry(data) : null;
}

/** Every captured exercise with taxonomy + provenance, newest capture first. */
export async function fetchCatalog(userId: string): Promise<CatalogEntry[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select(`
      id, name, skill_level, equipment_types,
      muscle_regions:exercise_muscle_regions(is_primary, muscle_region:muscle_regions(name)),
      goal_types:exercise_goal_types(goal_type:goal_types(name)),
      sources:source_exercises!inner(
        source:captured_sources!inner(
          id, user_id, platform, source_url, poster_handle, thumbnail_url,
          captured_at, extraction_status
        )
      )
    `);
  if (error) {
    console.error("fetchCatalog failed:", error);
    return [];
  }

  const entries: CatalogEntry[] = (data ?? []).map((row: any) => ({
    exerciseId: row.id,
    name: row.name,
    skillLevel: row.skill_level ?? null,
    equipmentTypes: row.equipment_types ?? [],
    muscles: (row.muscle_regions ?? []).map((m: any) => ({
      name: m.muscle_region?.name ?? "",
      isPrimary: !!m.is_primary,
    })),
    goalTypes: (row.goal_types ?? []).map((g: any) => g.goal_type?.name ?? ""),
    sources: (row.sources ?? [])
      .map((s: any) => s.source)
      // RLS already scopes captured_sources to the caller; the filters here
      // drop other users' links to a shared library exercise and any capture
      // whose save never completed.
      .filter((s: any) => s && s.user_id === userId && s.extraction_status === "reviewed")
      .map((s: any) => ({
        sourceId: s.id,
        platform: s.platform,
        sourceUrl: s.source_url,
        posterHandle: s.poster_handle,
        thumbnailUrl: s.thumbnail_url,
        capturedAt: s.captured_at,
      })),
  }));

  return entries
    .filter((e) => e.sources.length > 0)
    .sort((a, b) => (a.sources[0].capturedAt < b.sources[0].capturedAt ? 1 : -1));
}

/**
 * The posts one exercise was captured from, newest first — provenance for the
 * detail page. Same two filters fetchCatalog applies: a shared library
 * exercise may be linked by other people's captures, and a save that never
 * finished leaves a pending source that was never really reviewed.
 */
export async function fetchExerciseSources(
  exerciseId: string,
  userId: string,
): Promise<CaptureSource[]> {
  const { data, error } = await supabase
    .from("source_exercises")
    .select(`
      source:captured_sources!inner(
        id, user_id, platform, source_url, poster_handle, thumbnail_url,
        captured_at, extraction_status
      )
    `)
    .eq("exercise_id", exerciseId);
  if (error) {
    console.error("fetchExerciseSources failed:", error);
    return [];
  }

  // collapseByPost both dedupes and orders: two source rows for one post — a
  // capture made twice before the identity rule tightened — would otherwise
  // list the same link against the same handle twice.
  return collapseByPost(
    (data ?? [])
      .map((row: any) => row.source)
      .filter((s: any) => s && s.user_id === userId && s.extraction_status === "reviewed")
      .map((s: any): CaptureSource => ({
        sourceId: s.id,
        platform: s.platform,
        sourceUrl: s.source_url,
        posterHandle: s.poster_handle,
        thumbnailUrl: s.thumbnail_url,
        capturedAt: s.captured_at,
      })),
  );
}

/**
 * Drop a capture's source once nothing it explains is left.
 *
 * The source row is what answers "already captured?", so a bare one left
 * behind would make that post permanently uncapturable. It is also the only
 * thread tying catalog exercises back to the post they came from, and the
 * catalog is assembled through those threads — cutting them would take
 * exercises off the Exercises tab while leaving them in the library, which
 * looks exactly like data loss. So a source with anything still pointing at it
 * stays, and only one that explains nothing goes.
 */
async function pruneOrphanSource(sourceId: string, userId: string): Promise<void> {
  const workouts = await supabase
    .from("captured_workouts")
    .select("id", { count: "exact", head: true })
    .eq("source_id", sourceId);
  const exercises = await supabase
    .from("source_exercises")
    .select("source_id", { count: "exact", head: true })
    .eq("source_id", sourceId);

  // A count we failed to read is not a count of zero: leaving a source behind
  // costs one re-capture, deleting a live one costs the catalog.
  if (workouts.error || exercises.error) {
    console.error("orphan source check failed:", workouts.error ?? exercises.error);
    return;
  }
  if ((workouts.count ?? 1) > 0 || (exercises.count ?? 1) > 0) return;

  const { error } = await supabase
    .from("captured_sources")
    .delete()
    .eq("id", sourceId)
    .eq("user_id", userId);
  if (error) console.error("orphan source delete failed:", error);
}

/**
 * Delete a captured workout the owner is done with.
 *
 * Its movement list — the reps and rounds the creator prescribed — goes with
 * it. The exercises do not: those rows belong to the library whether this
 * capture created them or merely pointed at entries that already existed, and
 * nothing here touches them. A generated session that served this workout
 * survives with its link cleared, which the schema handles.
 */
export async function deleteCapturedWorkout(
  workoutId: string,
  userId: string,
): Promise<boolean> {
  try {
    const { data: workout, error: readError } = await supabase
      .from("captured_workouts")
      .select("source_id")
      .eq("id", workoutId)
      .eq("user_id", userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!workout) return false;

    const { error: deleteError } = await supabase
      .from("captured_workouts")
      .delete()
      .eq("id", workoutId)
      .eq("user_id", userId);
    if (deleteError) throw deleteError;

    await pruneOrphanSource(workout.source_id as string, userId);
    return true;
  } catch (e) {
    console.error("deleteCapturedWorkout failed:", e);
    return false;
  }
}

// ---------- Editing a captured workout ----------
//
// A capture is a starting point, not a contract: the extraction guesses a
// name, the caption arrives with the platform's markup, and the movement list
// is whatever the model could read off a post. All of it is the owner's to
// correct.

export interface CapturedWorkoutEdits {
  name: string;
  rounds: string | null;
  /** One sentence on what this workout is. */
  description: string | null;
  /** The owner's own note. */
  notes: string | null;
}

/** Rename a captured workout, restate its rounds, or keep a note on it. */
export async function updateCapturedWorkout(
  workoutId: string,
  edits: CapturedWorkoutEdits,
): Promise<boolean> {
  const { error } = await supabase
    .from("captured_workouts")
    .update({
      name: edits.name,
      rounds: edits.rounds,
      description: edits.description,
      notes: edits.notes,
    })
    .eq("id", workoutId);
  if (error) {
    console.error("updateCapturedWorkout failed:", error);
    return false;
  }
  return true;
}

export interface CapturedWorkoutItemInput {
  exerciseId: string;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  duration: string | null;
  restSeconds: number | null;
  notes: string | null;
}

/**
 * Replace the movement list wholesale.
 *
 * Reordering, removing and adding all reduce to "here is the new list", and a
 * captured workout is a handful of rows — diffing them would be more code and
 * more ways to be wrong. `exercise_order` is assigned from array position, so
 * the order on screen is the order in the table.
 *
 * Insert first, then delete the old rows by id. The two statements are not a
 * transaction, so the order decides what a failure between them leaves
 * behind: this way a dead insert leaves the workout exactly as it was, where
 * deleting first would leave it empty. Nothing constrains (workout, order),
 * so the brief overlap is harmless.
 */
export async function replaceCapturedWorkoutItems(
  workoutId: string,
  items: CapturedWorkoutItemInput[],
): Promise<boolean> {
  try {
    const { data: existing, error: readError } = await supabase
      .from("captured_workout_exercises")
      .select("id")
      .eq("captured_workout_id", workoutId);
    if (readError) throw readError;

    if (items.length > 0) {
      const { error: insError } = await supabase
        .from("captured_workout_exercises")
        .insert(
          items.map((item, index) => ({
            captured_workout_id: workoutId,
            exercise_id: item.exerciseId,
            exercise_order: index,
            target_sets: item.sets,
            target_reps: item.reps,
            target_weight: item.weight,
            target_duration: item.duration,
            rest_seconds: item.restSeconds,
            notes: item.notes,
          })),
        );
      if (insError) throw insError;
    }

    const oldIds = (existing ?? []).map((r: any) => r.id);
    if (oldIds.length > 0) {
      const { error: delError } = await supabase
        .from("captured_workout_exercises")
        .delete()
        .in("id", oldIds);
      if (delError) throw delError;
    }
    return true;
  } catch (e) {
    console.error("replaceCapturedWorkoutItems failed:", e);
    return false;
  }
}
