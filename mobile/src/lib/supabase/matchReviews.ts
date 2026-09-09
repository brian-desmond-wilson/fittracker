// The exercise_match_reviews queue — where a captured name that matched
// nothing waits for a person (Stage 5, Task 4).
//
// The schema truth this module is written against (staging, live-identical):
//   exercise_match_reviews(id, user_id, source_id -> captured_sources ON
//   DELETE SET NULL, raw_name, raw_name_normalized [trigger-filled from
//   normalize_alias], context, candidates jsonb array, draft jsonb, status
//   pending|linked|minted|dismissed [lifecycle CHECK], resolved_exercise_id
//   -> exercises ON DELETE RESTRICT, created_at, resolved_at).
//
// LINKAGE SHAPE: captured_workout_exercises.exercise_id is NOT NULL and the
// table has no review column, so a captured workout CANNOT hold an
// exercise-less item. A pending name's workout items therefore live in the
// review row's `draft` (prescriptions + exercise_order + the workout id) and
// are inserted as real items only at resolution; until then the workout
// screens render them as "pending review" from the review join.
import { supabase } from '../supabase';
import { addWildAliases } from './frontDoor';
import type { ExtractedExercise } from '../../types/capture';

// ── Shapes ──────────────────────────────────────────────────────────────────

/** One fuzzy suggestion stored on the review row, shown as a tap-to-link chip. */
export interface MatchReviewCandidate {
  exerciseId: string;
  name: string;
}

/** One workout item the pending name was prescribed in, held in draft. */
export interface MatchReviewDraftItem {
  /** The position the item had in the captured workout's list. */
  exerciseOrder: number;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  duration: string | null;
  restSeconds: number | null;
  notes: string | null;
}

/** Everything a resolution needs to finish the interrupted capture. */
export interface MatchReviewDraft {
  /** The sanitized extraction for this name (wizard-prefill material). */
  exercise: Omit<ExtractedExercise, 'libraryMatchId'> | null;
  /** The captured workout the pending items belong to (null: exercises-only post). */
  capturedWorkoutId: string | null;
  items: MatchReviewDraftItem[];
}

export interface PendingMatchReview {
  id: string;
  rawName: string;
  context: string | null;
  candidates: MatchReviewCandidate[];
  sourceId: string | null;
  draft: MatchReviewDraft | null;
  createdAt: string;
}

// ── Alias resolution (rung 1 of the capture order) ──────────────────────────

/** ilike metacharacters, escaped so a name is matched as itself. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * The exercise a captured name already resolves to, or null.
 *
 * Normalization goes through the DB's `normalize_alias` RPC — NOT a ported
 * copy — so the abbreviation dictionary stays single-source (the Task 5
 * re-normalization trigger would silently break a client-side port). Two
 * legs: the normalized alias lookup, then case-insensitive display-name
 * equality for names the alias table has no row for yet.
 */
export async function resolveNameByAlias(name: string): Promise<string | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const { data: normalized, error: normError } = await supabase.rpc('normalize_alias', {
    raw: trimmed,
  });
  if (normError) throw new Error(normError.message);

  if (normalized) {
    // alias_normalized is UNIQUE, so maybeSingle is exact.
    const { data, error } = await supabase
      .from('exercise_aliases')
      .select('exercise_id')
      .eq('alias_normalized', normalized)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.exercise_id) return data.exercise_id as string;
  }

  // Display-name equality: ilike with everything escaped IS case-insensitive
  // equality. limit(1) rather than single: names are not unique by constraint.
  const { data: byName, error: nameError } = await supabase
    .from('exercises')
    .select('id')
    .ilike('name', escapeLike(trimmed))
    .limit(1);
  if (nameError) throw new Error(nameError.message);
  return (byName?.[0]?.id as string | undefined) ?? null;
}

// ── Candidates (fuzzy suggestions stored on the review row) ─────────────────

/** PostgREST or-syntax delimiters; stripped like crossfit.ts's cleanSearchTerm. */
function cleanTerm(raw: string): string {
  return raw.replace(/[,()\[\]{}"\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function candidateLeg(term: string, limit: number): Promise<MatchReviewCandidate[]> {
  // Alias leg first: ids whose alias contains the term.
  const { data: aliasRows, error: aliasError } = await supabase
    .from('exercise_aliases')
    .select('exercise_id')
    .ilike('alias', `%${escapeLike(term)}%`)
    .limit(50);
  if (aliasError) throw new Error(aliasError.message);
  const aliasIds = [...new Set((aliasRows ?? []).map((r: any) => r.exercise_id as string))];

  let query = supabase.from('exercises').select('id, name');
  query =
    aliasIds.length > 0
      ? query.or(`name.ilike.%${term}%,id.in.(${aliasIds.join(',')})`)
      : query.ilike('name', `%${term}%`);
  const { data, error } = await query.order('name').limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: any) => ({ exerciseId: r.id as string, name: r.name as string }));
}

/**
 * A few likely matches for an unknown captured name, for the review row's
 * candidates column. Best-effort: candidates are a convenience, so a failed
 * search degrades to an empty list rather than failing the capture. When the
 * whole name finds nothing, the last word usually names the movement noun
 * ("Cyclist Squat" → "Squat") — one retry on that.
 */
export async function fetchMatchCandidates(
  name: string,
  limit = 5,
): Promise<MatchReviewCandidate[]> {
  try {
    const cleaned = cleanTerm(name);
    if (cleaned.length < 2) return [];
    const full = await candidateLeg(cleaned, limit);
    if (full.length > 0) return full;
    const words = cleaned.split(' ');
    const lastWord = words[words.length - 1];
    if (words.length < 2 || lastWord.length < 3) return [];
    return await candidateLeg(lastWord, limit);
  } catch (e) {
    console.error(`candidate search failed for '${name}':`, e);
    return [];
  }
}

// ── Queue reads ─────────────────────────────────────────────────────────────

function parseCandidates(raw: unknown): MatchReviewCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
    .map((c) => ({
      exerciseId: typeof c.exerciseId === 'string' ? c.exerciseId : '',
      name: typeof c.name === 'string' ? c.name : '',
    }))
    .filter((c) => c.exerciseId !== '' && c.name !== '');
}

function parseDraft(raw: unknown): MatchReviewDraft | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const d = raw as Record<string, unknown>;
  const items: MatchReviewDraftItem[] = Array.isArray(d.items)
    ? d.items
        .filter((it): it is Record<string, unknown> => typeof it === 'object' && it !== null)
        .map((it) => ({
          exerciseOrder: typeof it.exerciseOrder === 'number' ? it.exerciseOrder : 0,
          sets: typeof it.sets === 'number' ? it.sets : null,
          reps: typeof it.reps === 'string' ? it.reps : null,
          weight: typeof it.weight === 'string' ? it.weight : null,
          duration: typeof it.duration === 'string' ? it.duration : null,
          restSeconds: typeof it.restSeconds === 'number' ? it.restSeconds : null,
          notes: typeof it.notes === 'string' ? it.notes : null,
        }))
    : [];
  return {
    exercise:
      typeof d.exercise === 'object' && d.exercise !== null
        ? (d.exercise as MatchReviewDraft['exercise'])
        : null,
    capturedWorkoutId: typeof d.capturedWorkoutId === 'string' ? d.capturedWorkoutId : null,
    items,
  };
}

function toPendingReview(row: any): PendingMatchReview {
  return {
    id: row.id,
    rawName: row.raw_name,
    context: row.context ?? null,
    candidates: parseCandidates(row.candidates),
    sourceId: row.source_id ?? null,
    draft: parseDraft(row.draft),
    createdAt: row.created_at,
  };
}

/** The queue, oldest first — first captured, first resolved. */
export async function fetchPendingReviews(userId: string): Promise<PendingMatchReview[]> {
  const { data, error } = await supabase
    .from('exercise_match_reviews')
    .select('id, raw_name, context, candidates, source_id, draft, created_at')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  if (error) {
    console.error('fetchPendingReviews failed:', error);
    return [];
  }
  return (data ?? []).map(toPendingReview);
}

/** Queue size for the Catalog tab's entry point. */
export async function fetchPendingReviewCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('exercise_match_reviews')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'pending');
  if (error) {
    console.error('fetchPendingReviewCount failed:', error);
    return 0;
  }
  return count ?? 0;
}

// ── Queue writes ────────────────────────────────────────────────────────────

export interface CreateMatchReviewInput {
  userId: string;
  sourceId: string | null;
  rawName: string;
  context: string | null;
  candidates: MatchReviewCandidate[];
  draft: MatchReviewDraft;
}

/**
 * Queue one unknown captured name. raw_name_normalized is deliberately NOT
 * written: the table's BEFORE trigger fills it from normalize_alias, keeping
 * the dictionary single-source. A failure here THROWS — losing a captured
 * name silently is exactly what the queue exists to prevent, and saveCapture's
 * pending-status sequencing makes the whole capture retryable instead.
 */
export async function createMatchReview(input: CreateMatchReviewInput): Promise<string> {
  const { data, error } = await supabase
    .from('exercise_match_reviews')
    .insert({
      user_id: input.userId,
      source_id: input.sourceId,
      raw_name: input.rawName,
      context: input.context,
      candidates: input.candidates,
      draft: input.draft,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

/** Reclaimed captures re-queue their names, so the stale rows go first. */
export async function deletePendingReviewsForSource(sourceId: string): Promise<void> {
  const { error } = await supabase
    .from('exercise_match_reviews')
    .delete()
    .eq('source_id', sourceId)
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
}

export interface ResolveMatchReviewInput {
  review: PendingMatchReview;
  exerciseId: string;
  /** True when the exercise was created new for this review → status 'minted';
   *  false when linked to something that already existed → status 'linked'. */
  minted: boolean;
  /** Also save the captured name as a wild alias, so the next capture of the
   *  same wording resolves on rung 1 without a review. */
  saveAlias: boolean;
}

export interface ResolveMatchReviewResult {
  ok: boolean;
  /** The alias write missed (the resolution itself still stands). */
  aliasFailed: boolean;
}

/**
 * Finish an interrupted capture: repoint provenance, materialize the draft's
 * workout items, optionally teach the alias, then close the review.
 *
 * The review row is updated LAST, so any earlier failure leaves it pending
 * and the whole thing retryable. The earlier steps are idempotent for that
 * retry: the provenance link upserts, and draft items already present (same
 * workout + exercise + order) are skipped rather than duplicated.
 */
export async function resolveMatchReview(
  input: ResolveMatchReviewInput,
): Promise<ResolveMatchReviewResult> {
  const { review, exerciseId, minted, saveAlias } = input;
  try {
    // 1. Provenance: the capture now explains this exercise. was_created
    //    records which act this was — a mint or a link — because catalog
    //    delete semantics read it (a minted row is the capture's to delete).
    if (review.sourceId) {
      const { error } = await supabase.from('source_exercises').upsert(
        { source_id: review.sourceId, exercise_id: exerciseId, was_created: minted },
        { onConflict: 'source_id,exercise_id', ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    }

    // 2. The workout items the pending name was holding back. A deleted
    //    workout (FK 23503) is not a failure of the resolution — the linkage
    //    it carried is simply gone.
    const draft = review.draft;
    if (draft?.capturedWorkoutId && draft.items.length > 0) {
      const { data: existing, error: readError } = await supabase
        .from('captured_workout_exercises')
        .select('exercise_id, exercise_order')
        .eq('captured_workout_id', draft.capturedWorkoutId);
      if (readError) throw new Error(readError.message);
      const taken = new Set(
        (existing ?? []).map((r: any) => `${r.exercise_id}#${r.exercise_order}`),
      );
      const toInsert = draft.items
        .filter((it) => !taken.has(`${exerciseId}#${it.exerciseOrder}`))
        .map((it) => ({
          captured_workout_id: draft.capturedWorkoutId,
          exercise_id: exerciseId,
          exercise_order: it.exerciseOrder,
          target_sets: it.sets,
          target_reps: it.reps,
          target_weight: it.weight,
          target_duration: it.duration,
          rest_seconds: it.restSeconds,
          notes: it.notes,
        }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from('captured_workout_exercises').insert(toInsert);
        if (error && (error as any).code !== '23503') throw new Error(error.message);
        if (error) {
          console.error('resolved review items skipped (workout gone):', error.message);
        }
      }
    }

    // 3. Teach the dictionary. Best-effort by the same argument as the
    //    wizard's aliases: the link already stands.
    let aliasFailed = false;
    if (saveAlias) {
      const result = await addWildAliases(exerciseId, [review.rawName]);
      aliasFailed = result.failed.length > 0;
    }

    // 4. Close the review — last, so failure above leaves it retryable.
    //    status='pending' in the filter makes a double-tap a no-op.
    const { error: closeError } = await supabase
      .from('exercise_match_reviews')
      .update({
        status: minted ? 'minted' : 'linked',
        resolved_exercise_id: exerciseId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', review.id)
      .eq('status', 'pending');
    if (closeError) throw new Error(closeError.message);

    return { ok: true, aliasFailed };
  } catch (e) {
    console.error('resolveMatchReview failed:', e);
    return { ok: false, aliasFailed: false };
  }
}
