// Captions come back from the platforms HTML-encoded.
//
// `capture-post` stores what the embed/oEmbed payload gives it, and that is
// HTML: a caption reading "Save this 1 KB chest & triceps series ✅" is stored
// as "Save this 1 KB chest &amp; triceps series &#x2705;". Rendered verbatim
// in a <Text> that is exactly what the reader sees, so the caption has to be
// decoded on the way out.
//
// Decoding on read rather than on capture is deliberate: the stored row stays
// a faithful copy of what the platform returned, and a decoder bug is a
// display bug we can fix, not data we have already mangled.

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  // U+00A0, not a plain space: the markup asked for a space that does not
  // break, and the caption should keep it.
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
};

// One pass, one regex, so an entity produced BY decoding is never decoded
// again: "&amp;#x2705;" is a creator who typed "&#x2705;" literally, and
// running the decoder twice would turn their text into a tick.
const ENTITY = /&(#[Xx][0-9A-Fa-f]+|#\d+|[A-Za-z][A-Za-z0-9]*);/g;

/** A stored caption as the creator actually wrote it. Null becomes "" so
 *  callers can test emptiness without a null dance. */
export function decodeCaption(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw.replace(ENTITY, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X";
      const code = parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      // Unpaired surrogates and out-of-range values would throw or produce
      // replacement junk — leaving the entity visible is the honest failure.
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
      if (code >= 0xd800 && code <= 0xdfff) return match;
      return String.fromCodePoint(code);
    }
    const named = NAMED[body.toLowerCase()];
    return named ?? match;
  });
}
