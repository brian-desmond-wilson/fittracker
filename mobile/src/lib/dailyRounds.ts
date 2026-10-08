// The round count a block's rounds_note prescribes, for the badge on the
// main block card. The note is free text — the app's own budget writes
// "Do 3 of 4 rounds", "Do 11 rounds (written: 7)" or "Cap at 30 min"; the
// coach writes "Do 4 rounds (written: 8x KB Curl, …; REPEAT 4x)" — so only
// the leading "Do N" is read. Anything else has no round count to show.

export function roundsCount(roundsNote: string | null | undefined): number | null {
  if (!roundsNote) return null;
  const m = roundsNote.trim().match(/^do\s+(\d+)(?:\s+of\s+\d+)?\s+rounds?\b/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "4 ROUNDS" / "1 ROUND", or null when the note prescribes no count. */
export function roundsBadge(roundsNote: string | null | undefined): string | null {
  const n = roundsCount(roundsNote);
  if (n === null) return null;
  return `${n} ${n === 1 ? "ROUND" : "ROUNDS"}`;
}
