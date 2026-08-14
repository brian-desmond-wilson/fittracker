// The fallback mark for anything with no picture: a vendor with no logo, and
// a meal whose photo is missing or failed to load.
//
// The meal surfaces each carried their own `initials`, which split on
// whitespace only — so "Boost + Cashews" came out "B+" and "PB&J" came out
// "P". This handles the punctuation, which is the whole reason it exists.
//
// Lives here rather than beside the tile component because that file imports
// react-native, which cannot load in the node test environment — and the
// punctuation handling is the part worth testing: "Costco (Instacart)" must
// not come out as "C(".

/** "Gus's Community Market" -> "GC". Two letters at most; one word gives one. */
export function monogram(name: string): string {
  const words = name
    // Apostrophes are INSIDE words, so they are deleted rather than turned
    // into a separator: splitting on them makes "Gus's Community" read as
    // Gus / s / Community, and the monogram comes out "GS".
    .replace(/['’]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
