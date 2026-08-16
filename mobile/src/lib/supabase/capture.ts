// Client half of capture-post, plus the writes the review sheet commits and
// the catalog read. Save is a SEQUENCE, not a DB transaction (the JS client
// cannot open one): the source row goes first as 'pending', children follow,
// and 'reviewed' is stamped last — so a failure partway leaves a retryable
// pending source, never a half-visible catalog entry.
import { supabase } from "../supabase";
import { createExercise, fetchGoalTypes, fetchMovementCategories } from "./crossfit";
import { mapCategory } from "../captureReview";
import type {
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

    // 1. The source row, pending until everything under it lands.
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
    const sourceId = source.id as string;

    // 2. Each exercise: link the matched library entry, or create a new one
    //    through the SAME path the Add Exercise wizard uses.
    const exerciseIds: string[] = [];
    for (const ex of input.post.exercises) {
      let exerciseId = ex.libraryMatchId;
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
        was_created: !ex.libraryMatchId,
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
