// The resolution order for one captured exercise name (Stage 5, Task 4).
//
// Pure by injection: the alias lookup is handed in, so the order itself —
// the part that decides whether an exercise row ever gets minted — is
// testable without a client. The order is the plan's, verbatim:
//
//   1. Alias resolution. The captured name, normalized through the DB's
//      normalize_alias dictionary, names an exercise_aliases row (or equals a
//      display name). A hit links immediately — no model involved, and a name
//      the user already taught the app ("Pullups") never reaches the queue.
//   2. The model's library_match_id, already validated against the vocabulary
//      index by sanitizeExtraction. The alias table outranks it: the
//      dictionary is deterministic truth, the model is a guess.
//   3. NOTHING. No exercise row is created for an unknown name — the caller
//      routes it to the exercise_match_reviews queue instead. The silent
//      auto-create (the duplicate mint the movement model exists to prevent)
//      died here.
export type CaptureNameResolution =
  | { kind: 'linked'; exerciseId: string; via: 'alias' | 'model' }
  | { kind: 'review' };

/**
 * Resolve one captured name. `lookupAlias` returns the exercise id an alias
 * or display name resolves to, or null. A lookup FAILURE (throw) degrades to
 * the next rung rather than failing the capture: worse resolution beats no
 * save, and the review queue is a safe floor.
 */
export async function resolveCapturedExercise(
  name: string,
  libraryMatchId: string | null,
  lookupAlias: (name: string) => Promise<string | null>,
): Promise<CaptureNameResolution> {
  let aliasId: string | null = null;
  try {
    aliasId = await lookupAlias(name);
  } catch (e) {
    console.error(`alias lookup failed for '${name}' (degrading to model match):`, e);
  }
  if (aliasId) return { kind: 'linked', exerciseId: aliasId, via: 'alias' };
  if (libraryMatchId) return { kind: 'linked', exerciseId: libraryMatchId, via: 'model' };
  return { kind: 'review' };
}
