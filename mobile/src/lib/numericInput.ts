// Keep non-numbers out of numeric fields as they are typed.
//
// `keyboardType` is a HINT, not a constraint: it picks which on-screen keyboard
// appears and does nothing about a hardware keyboard, a paste, dictation, or
// autofill. So a calories field could hold "abc" until save-time validation
// rejected it — which is late, and lands you back in a section you had
// finished with.
//
// These sanitise rather than reject: a keystroke that would make the value
// invalid is dropped and the rest is kept, so typing never silently stops
// working.

/** Digits only. Empty stays empty — that means "not recorded", not zero. */
export function sanitizeInteger(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/**
 * Digits with at most one decimal point.
 *
 * A bare leading "." survives, because it is a legitimate half-typed state on
 * the way to ".5"; the save-time parse already treats an unparseable field as
 * not-set. Later points are dropped rather than truncating what follows, so
 * fumbling "1..5" gives "1.5" instead of losing the 5.
 */
export function sanitizeDecimal(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  const firstDot = cleaned.indexOf(".");
  if (firstDot === -1) return cleaned;
  return (
    cleaned.slice(0, firstDot + 1) +
    cleaned.slice(firstDot + 1).replace(/\./g, "")
  );
}
