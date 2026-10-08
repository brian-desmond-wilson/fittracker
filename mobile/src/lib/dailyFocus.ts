// The day-level title of an AI-composed session. The session row has no
// focus column: the composer's one sentence (day_reason) is where the focus
// lives, so the title reads it back out — "Pull emphasis for the stalest
// groups…" → "Pull Emphasis". Nothing found → the plain title, never a guess.

/** Focus words the composer and the coach actually use, longest first so
 *  "full body" wins over "body" and "upper body" over "upper". */
const FOCUS_WORDS = [
  "full body", "full-body", "upper body", "upper-body", "lower body", "lower-body",
  "push", "pull", "legs", "leg", "upper", "lower", "core", "conditioning",
  "recovery", "mobility", "strength", "hypertrophy", "cardio", "endurance",
];

const FOCUS_NOUNS = ["emphasis", "focus", "day", "session", "work"];

function titleCase(words: string): string {
  return words
    .split(/[\s-]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * "Pull Emphasis" from "Pull emphasis for the stalest groups…"; "Push Day"
 * from "…today is a push day"; "Full Body" from "…a full-body strength
 * session…" (the noun is kept only when it is one of the composer's own
 * framing words, so "pull-ups" never reads as a pull day). Null when the
 * sentence names no focus.
 */
export function sessionFocus(dayReason: string | null | undefined): string | null {
  if (!dayReason) return null;
  const text = dayReason.toLowerCase();
  const bareWords = ["push", "pull", "legs", "leg", "upper", "lower", "core"];
  let best: { index: number; length: number; label: string } | null = null;
  for (const word of FOCUS_WORDS) {
    const escaped = word.replace(/[-]/g, "[\\s-]");
    const re = new RegExp(`\\b${escaped}(?:[\\s-]+(${FOCUS_NOUNS.join("|")}))?\\b`, "g");
    for (const m of text.matchAll(re)) {
      const index = m.index ?? 0;
      // "yesterday's push session" describes the day before, not this one.
      const before = text.slice(Math.max(0, index - 14), index);
      if (/\b(yesterday['’]?s?|last|previous)\s*$/.test(before)) continue;
      // A bare "pull" or "push" with no framing noun is a movement word
      // unless it leads the sentence ("Pull, with…" still names the day).
      if (bareWords.includes(word) && !m[1] && index !== 0) continue;
      const label = `${titleCase(word)}${m[1] ? ` ${titleCase(m[1])}` : ""}`;
      // Earliest mention wins; at the same spot the longer phrase does.
      if (!best || index < best.index || (index === best.index && m[0].length > best.length)) {
        best = { index, length: m[0].length, label };
      }
    }
  }
  return best?.label ?? null;
}

/** "Today's Session — Pull Emphasis", or "Today's Session" alone. */
export function sessionTitle(dayReason: string | null | undefined, base = "Today's Session"): string {
  const focus = sessionFocus(dayReason);
  return focus ? `${base} — ${focus}` : base;
}
