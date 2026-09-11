// Folds a string to its bare searchable form: lowercased, accents stripped,
// and every space, hyphen, and underscore removed. This is what lets the
// Training header search treat "Push Up", "push-up", and "pushup" as the same
// thing, and lets "fit dad" find the "@fit___dad" handle. Both the workout and
// the exercise search fold through here, so the two behave identically.
export function normaliseForSearch(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s\-_]+/g, "")
    .toLowerCase();
}

/** True when the needle's folded form appears anywhere in the haystack's. A
 *  needle that folds to nothing (empty, or only separators) matches anything. */
export function searchMatches(haystack: string, needle: string): boolean {
  return normaliseForSearch(haystack).includes(normaliseForSearch(needle));
}
