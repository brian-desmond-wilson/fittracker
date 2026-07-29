// TS port of the head-noun concept matcher from migration
// 20260728100200_nutrition_concept_link_backfill.sql. Keep the two in sync —
// the UI must suggest exactly what the SQL backfill would have linked.
//
// English food names put the head noun LAST ("Kerrygold Butter" is butter;
// "Butter Lettuce" is lettuce), so suffix position is the safe direction.
// No substring/LIKE semantics: literal % or _ in product names cannot
// wildcard. Under-linking is the intended failure mode; the known residual
// ("Nutter Butter" → Butter) is filtered by human confirmation in the UI.
export interface MatchableConcept {
  id: string;
  name: string;
}

export interface ConceptSuggestion {
  conceptId: string;
  /** 0 exact · 1 plural-modulo · 2 head-noun suffix */
  rank: 0 | 1 | 2;
}

const MIN_SUFFIX_CONCEPT_LENGTH = 5;

const norm = (s: string) => s.trim().toLowerCase();
const deplural = (s: string) => s.replace(/s$/, "");

/** All matching concepts, best first (rank asc, longer concept name first). */
export function suggestConcepts(
  productName: string,
  concepts: MatchableConcept[],
): ConceptSuggestion[] {
  const p = norm(productName);
  const out: Array<ConceptSuggestion & { specificity: number }> = [];
  for (const c of concepts) {
    const cn = norm(c.name);
    let rank: 0 | 1 | 2 | null = null;
    if (p === cn) rank = 0;
    else if (deplural(p) === deplural(cn)) rank = 1;
    else if (cn.length >= MIN_SUFFIX_CONCEPT_LENGTH && p.endsWith(" " + cn)) rank = 2;
    if (rank !== null) out.push({ conceptId: c.id, rank, specificity: cn.length });
  }
  out.sort(
    (a, b) =>
      a.rank - b.rank ||
      b.specificity - a.specificity ||
      a.conceptId.localeCompare(b.conceptId),
  );
  return out.map(({ conceptId, rank }) => ({ conceptId, rank }));
}
