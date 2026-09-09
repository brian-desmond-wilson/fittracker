// Client half of capture-post, plus the writes the review sheet commits and
// the catalog read. Save is a SEQUENCE, not a DB transaction (the JS client
// cannot open one): the source row goes first as 'pending', children follow,
// and 'reviewed' is stamped last — so a failure partway leaves a retryable
// pending source, never a half-visible catalog entry.
import { supabase } from "../supabase";
import { decodeCaption } from "../captionText";
import { resolveCapturedExercise } from "../captureResolution";
import {
  createMatchReview,
  deletePendingReviewsForSource,
  fetchMatchCandidates,
  fetchPendingItemsForSources,
  resolveNameByAlias,
} from "./matchReviews";
import { collapseByPost } from "../captureUrl";
import { catalogDeleteMode, describeUsage } from "../catalogDelete";
import type { ProvenanceLink } from "../catalogDelete";
import type {
  CapturedWorkoutEntry,
  CaptureSource,
  CatalogEntry,
  ExtractedPost,
  PendingWorkoutItemEntry,
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
  /** The rehosted (app-owned) thumbnail — the model reads it beside the
   *  caption when present. Never a platform CDN link. */
  thumbnailUrl?: string | null;
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
        thumbnailUrl: input.thumbnailUrl ?? null,
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

export interface SaveCaptureResult {
  sourceId: string;
  /** Names that matched nothing and were queued in exercise_match_reviews. */
  pendingReviewCount: number;
}

/** Commit an accepted review. Returns the source id plus how many names went
 *  to the match-review queue, or null on failure. */
export async function saveCapture(input: SaveCaptureInput): Promise<SaveCaptureResult | null> {
  try {
    // 1. Claim the source row. The URL is unique per user, and a failed
    //    earlier save leaves a pending row behind — a plain insert would
    //    collide with it on every retry, making the first flaky-network save
    //    permanent. So: a reviewed row means this capture already succeeded;
    //    a pending/failed row is reclaimed, its children cleared, and the
    //    retry writes a clean set.
    // A blank source URL must NEVER match an earlier capture: historical
    // share-intent captures saved '' as their URL, so blank==blank made every
    // URL-less capture "already reviewed" and silently saved nothing. A
    // URL-less capture is always treated as brand new.
    const hasUrl = !!input.sourceUrl && input.sourceUrl.trim() !== "";
    if (!hasUrl) console.warn('saveCapture: capture has no source URL; skipping duplicate check');
    const existing = hasUrl
      ? await findExistingCapture(input.userId, input.sourceUrl)
      : null;
    let sourceId: string;
    if (existing) {
      if (existing.extraction_status === "reviewed") {
        return { sourceId: existing.id, pendingReviewCount: 0 };
      }

      // A partially-saved earlier attempt may have queued reviews already;
      // this retry re-queues its names, so the stale rows go first.
      await deletePendingReviewsForSource(existing.id);

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

    // 2. Resolve each captured name: alias dictionary first, then the model's
    //    validated match, else NOTHING — the name goes to the review queue in
    //    step 4. Capture NEVER creates an exercise row; the guarded front
    //    door (frontDoor.ts) is the catalog's only writer, and the silent
    //    auto-create that minted duplicates died here (Stage 5, Task 4).
    const linkedIds: (string | null)[] = [];
    for (const ex of input.post.exercises) {
      const res = await resolveCapturedExercise(ex.name, ex.libraryMatchId, resolveNameByAlias);
      if (res.kind === "linked") {
        linkedIds.push(res.exerciseId);
        // Upsert: two captured names may resolve to the same exercise
        // ("Pullups" + "Pull ups"), and a plain insert would 23505.
        const { error: linkError } = await supabase.from("source_exercises").upsert(
          { source_id: sourceId, exercise_id: res.exerciseId, was_created: false },
          { onConflict: "source_id,exercise_id", ignoreDuplicates: true },
        );
        if (linkError) throw linkError;
      } else {
        linkedIds.push(null);
      }
    }

    // 3. Full workout: preserve the creator's programming. Only resolved
    //    names become item rows — exercise_id is NOT NULL, so a pending
    //    name's items ride in its review draft (step 4) and are inserted at
    //    resolution. exercise_order keeps the ORIGINAL list position either
    //    way, so a resolved item lands back in its slot.
    let workoutId: string | null = null;
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
      workoutId = workout.id as string;

      const items = input.post.workout.items
        .map((item, i) => ({ item, order: i }))
        .filter(({ item }) => linkedIds[item.exerciseIndex] !== null)
        .map(({ item, order }) => ({
          captured_workout_id: workoutId,
          exercise_id: linkedIds[item.exerciseIndex],
          exercise_order: order,
          target_sets: item.sets,
          target_reps: item.reps,
          target_weight: item.weight,
          target_duration: item.duration,
          rest_seconds: item.restSeconds,
          notes: item.notes,
        }));
      if (items.length > 0) {
        const { error: itemsError } = await supabase
          .from("captured_workout_exercises")
          .insert(items);
        if (itemsError) throw itemsError;
      }
    }

    // 4. Queue every unmatched name. The draft carries the sanitized
    //    extraction (wizard-prefill material) and the items the name was
    //    prescribed in; candidates give the review sheet its tap-to-link
    //    chips. A failed insert throws: the source stays pending/retryable
    //    rather than silently dropping a captured name.
    let pendingReviewCount = 0;
    for (let i = 0; i < input.post.exercises.length; i++) {
      if (linkedIds[i] !== null) continue;
      const ex = input.post.exercises[i];
      const { libraryMatchId: _omit, ...exerciseDraft } = ex;
      const draftItems = (input.post.workout?.items ?? [])
        .map((item, order) => ({ item, order }))
        .filter(({ item }) => item.exerciseIndex === i)
        .map(({ item, order }) => ({
          exerciseOrder: order,
          sets: item.sets,
          reps: item.reps,
          weight: item.weight,
          duration: item.duration,
          restSeconds: item.restSeconds,
          notes: item.notes,
        }));
      await createMatchReview({
        userId: input.userId,
        sourceId,
        rawName: ex.name,
        context: input.post.workout?.name ?? input.posterHandle,
        candidates: await fetchMatchCandidates(ex.name),
        draft: {
          exercise: exerciseDraft,
          capturedWorkoutId: workoutId,
          items: draftItems,
        },
      });
      pendingReviewCount++;
    }

    // 5. Only now is the capture real.
    const { error: doneError } = await supabase
      .from("captured_sources")
      .update({ extraction_status: "reviewed" })
      .eq("id", sourceId);
    if (doneError) throw doneError;

    return { sourceId, pendingReviewCount };
  } catch (e) {
    console.error("saveCapture failed:", e);
    return null;
  }
}

/** Shared by the list and the single-workout screen so both read a row the
 *  same way. `pendingItems` come from the match-review join — names the
 *  capture could not resolve, waiting in the queue. */
function toCapturedWorkoutEntry(
  row: any,
  pendingItems: PendingWorkoutItemEntry[] = [],
): CapturedWorkoutEntry {
  return {
    pendingItems,
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
    tags: {
      blockRoles: row.block_roles ?? [],
      muscles: (row.wmuscles ?? [])
        .map((m: any) => ({
          name: m.muscle_region?.name ?? "",
          isPrimary: !!m.is_primary,
        }))
        .filter((m: any) => m.name !== ""),
      estMinutes: row.est_minutes ?? null,
      intensity: row.intensity ?? null,
      skillLevel: row.skill_level ?? null,
      classifiedAt: row.classified_at ?? null,
    },
  };
}

export interface RejectCaptureInput {
  userId: string;
  sourceUrl: string;
  platform: string;
  posterHandle: string | null;
  captionText: string | null;
  thumbnailUrl: string | null;
  rawExtraction: unknown;
}

/** The review sheet was dismissed without accepting: keep the source row as
 *  'failed' so the capture isn't lost (spec §4 — "rejecting keeps the source
 *  row for retry"). saveCapture already reclaims pending/failed rows, so
 *  re-capturing the same URL heals it. Never downgrades a reviewed row —
 *  rejecting a duplicate of something already captured is a no-op.
 *  Best-effort by design: it must never block the close. */
export async function markCaptureRejected(input: RejectCaptureInput): Promise<void> {
  try {
    const existing = await findExistingCapture(input.userId, input.sourceUrl);
    if (existing) {
      if (existing.extraction_status === "reviewed") return;
      const { error } = await supabase
        .from("captured_sources")
        .update({ extraction_status: "failed", raw_extraction: input.rawExtraction ?? null })
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from("captured_sources").insert({
      user_id: input.userId,
      platform: input.platform,
      source_url: input.sourceUrl,
      poster_handle: input.posterHandle,
      caption_text: input.captionText,
      thumbnail_url: input.thumbnailUrl,
      raw_extraction: input.rawExtraction ?? null,
      extraction_status: "failed",
    });
    if (error) throw error;
  } catch (e) {
    console.error("markCaptureRejected failed:", e);
  }
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
      block_roles, est_minutes, intensity, skill_level, classified_at,
      wmuscles:captured_workout_muscles(is_primary, muscle_region:muscle_regions(name)),
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

  const rows = (data ?? [])
    // A save that never finished leaves a pending source; don't show its
    // half-built workout.
    .filter((row: any) => row.source?.extraction_status === "reviewed");

  // Names still in the match-review queue render as "pending review" rows.
  const pendingByWorkout = await fetchPendingItemsForSources(
    [...new Set(rows.map((row: any) => row.source.id as string))],
  );
  return rows.map((row: any) =>
    toCapturedWorkoutEntry(row, pendingByWorkout.get(row.id) ?? []),
  );
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
      block_roles, est_minutes, intensity, skill_level, classified_at,
      wmuscles:captured_workout_muscles(is_primary, muscle_region:muscle_regions(name)),
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
  if (!data) return null;
  const pendingByWorkout = await fetchPendingItemsForSources(
    (data as any).source?.id ? [(data as any).source.id as string] : [],
  );
  return toCapturedWorkoutEntry(data, pendingByWorkout.get((data as any).id) ?? []);
}

/** Every captured exercise with taxonomy + provenance, newest capture first. */
export async function fetchCatalog(userId: string): Promise<CatalogEntry[]> {
  const { data, error } = await supabase
    .from("exercises")
    .select(`
      id, name, skill_level, equipment_types,
      equipment_junction:exercise_equipment(equipment(name)),
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
    // The junction is the source of truth (front-door rows keep it and the
    // compat array in step); the legacy array fills in for pre-model rows
    // that never got junction rows. Union so both eras pill correctly.
    equipmentTypes: [
      ...new Set<string>([
        ...(row.equipment_types ?? []),
        ...((row.equipment_junction ?? [])
          .map((e: any) => e.equipment?.name)
          .filter((n: any): n is string => typeof n === "string")),
      ]),
    ],
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

export type DeleteCatalogResult =
  | { ok: true; removedExercise: boolean }
  | { ok: false; reason: string };

/** Rows counted, or null when the count could not be read. */
async function countRows(
  table: string,
  column: string,
  exerciseId: string,
): Promise<number | null> {
  const { count, error } = await supabase
    .from(table)
    .select(column, { count: "exact", head: true })
    .eq("exercise_id", exerciseId);
  if (error) {
    console.error(`usage count failed for ${table}:`, error);
    return null;
  }
  return count ?? 0;
}

/**
 * Remove a captured exercise from the catalog.
 *
 * Two different acts wear one word here, and which one applies is already
 * recorded: a capture either CREATED an exercise or merely pointed at a
 * library entry that already existed. Only the first is this capture's to
 * delete — the second just loses its link to the post, leaves the catalog, and
 * stays in the library where it was before any of this.
 *
 * A created exercise still standing in a captured workout, a program, or a
 * logged set is refused rather than deleted, because the row cascades: those
 * lists would silently come back a movement shorter. Generated sessions are
 * not counted — they are today's suggestion, rebuilt tomorrow from whatever
 * the catalog holds, so they are a derived list rather than authored work.
 */
export async function deleteCatalogExercise(
  exerciseId: string,
  userId: string,
): Promise<DeleteCatalogResult> {
  try {
    const { data: links, error: linkError } = await supabase
      .from("source_exercises")
      .select("source_id, was_created")
      .eq("exercise_id", exerciseId);
    if (linkError) throw linkError;
    const sourceIds = [...new Set((links ?? []).map((l: any) => l.source_id as string))];

    const { data: exercise, error: exerciseError } = await supabase
      .from("exercises")
      .select("created_by, is_official")
      .eq("id", exerciseId)
      .maybeSingle();
    if (exerciseError) throw exerciseError;

    const mode = catalogDeleteMode({
      links: (links ?? []) as ProvenanceLink[],
      createdBy: (exercise?.created_by as string | null) ?? null,
      isOfficial: (exercise?.is_official as boolean | null) ?? null,
      userId,
    });
    const deletable = mode === "delete";

    if (deletable) {
      const [workouts, programs, logged] = await Promise.all([
        countRows("captured_workout_exercises", "exercise_id", exerciseId),
        countRows("program_workout_exercises", "exercise_id", exerciseId),
        countRows("exercise_instances", "exercise_id", exerciseId),
      ]);
      // A count that would not read is treated as "in use": refusing costs a
      // card left on screen, deleting wrongly costs somebody's history.
      if (workouts === null || programs === null || logged === null) {
        return { ok: false, reason: "Couldn't check what still uses it. Try again." };
      }
      const used = describeUsage({
        logged, capturedWorkouts: workouts, programWorkouts: programs,
      });
      if (used) return { ok: false, reason: used };

      // The provenance links cascade with the row.
      const { error: deleteError } = await supabase
        .from("exercises")
        .delete()
        .eq("id", exerciseId);
      if (deleteError) throw deleteError;
    } else {
      const { error: unlinkError } = await supabase
        .from("source_exercises")
        .delete()
        .eq("exercise_id", exerciseId);
      if (unlinkError) throw unlinkError;
    }

    for (const sourceId of sourceIds) await pruneOrphanSource(sourceId, userId);
    return { ok: true, removedExercise: deletable };
  } catch (e) {
    console.error("deleteCatalogExercise failed:", e);
    return { ok: false, reason: "Couldn't remove that one. Try again." };
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
