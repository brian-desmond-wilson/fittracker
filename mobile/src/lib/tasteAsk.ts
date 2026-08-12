// Whether to ask what you thought of a meal you just ate (C3 / E2). Pure.
//
// The Brian Score puts 30 of its 95 points on taste, and for a delivered dish
// that number came from a default the writer had to supply because the column
// is NOT NULL — not from an opinion. A third of the ranking, guessed, and
// never asked about.
//
// The moment after eating is the only one where the answer is free: the food
// is in front of you and the question is one tap. This decides when that
// prompt is worth showing, and it is deliberately conservative — a prompt that
// appears too often is dismissed reflexively, which trains the habit of
// ignoring it and costs more than the data it gathers.

export interface TasteAskConcept {
  id: string;
  name: string;
  /** Null when nobody has ever confirmed the rating — a default or an import. */
  ratingConfirmedAt: string | null;
}

/**
 * The single concept to ask about after logging a meal, or null for silence.
 *
 * Asks only when EXACTLY ONE of the meal's concepts is unconfirmed. A meal
 * built from five unrated ingredients is a curation job, not a question worth
 * interrupting a meal log with, and picking one of the five arbitrarily would
 * teach the wrong thing about the other four. One unconfirmed concept is the
 * shape a delivered dish has — its own — which is exactly the case worth
 * catching.
 */
export function tasteAskFor(
  concepts: readonly TasteAskConcept[],
): TasteAskConcept | null {
  const unconfirmed = concepts.filter((c) => c.ratingConfirmedAt === null);
  return unconfirmed.length === 1 ? unconfirmed[0] : null;
}
