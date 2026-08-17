// Deciding what "remove this exercise" is allowed to mean.
//
// Pulled out of the Supabase call so the judgment can be tested without a
// database: it is the part that decides whether a row in someone's library
// lives or dies, and "it typechecked" is not the standard for that.

/** One provenance row: did this capture create the exercise, or just link it? */
export interface ProvenanceLink {
  was_created: boolean | null;
}

export interface DeleteModeInput {
  links: ProvenanceLink[];
  /** Owner of the exercise row, or null when it has no creator recorded. */
  createdBy: string | null;
  isOfficial: boolean | null;
  userId: string;
}

/**
 * "delete" removes the exercise itself; "unlink" only cuts its tie to the post,
 * taking it off the catalog and leaving the library untouched.
 *
 * Deleting needs all three: some capture brought this exercise into being, it
 * belongs to the person asking, and it is not part of the official library.
 * Anything else — an entry that predates the capture, someone else's, an
 * official movement — is not this capture's to destroy.
 */
export function catalogDeleteMode(input: DeleteModeInput): "delete" | "unlink" {
  const capturedIntoBeing = input.links.some((l) => l.was_created === true);
  const mine = input.createdBy === input.userId && input.isOfficial !== true;
  return capturedIntoBeing && mine ? "delete" : "unlink";
}

export interface UsageCounts {
  /** Sets actually performed. The database refuses these outright. */
  logged: number;
  capturedWorkouts: number;
  programWorkouts: number;
}

/**
 * What still stands on this exercise, phrased for the alert — or null when
 * nothing does and it is safe to remove.
 *
 * Deleting the row would cascade through every list below, so each one is a
 * refusal rather than a warning: a captured workout quietly coming back a
 * movement shorter is worse than a card that wouldn't go away.
 */
export function describeUsage(counts: UsageCounts): string | null {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const parts = [
    counts.logged > 0 ? plural(counts.logged, "logged set") : null,
    counts.capturedWorkouts > 0 ? plural(counts.capturedWorkouts, "captured workout") : null,
    counts.programWorkouts > 0 ? plural(counts.programWorkouts, "program workout") : null,
  ].filter((p): p is string => p !== null);

  if (parts.length === 0) return null;
  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Still used in ${list}.`;
}
