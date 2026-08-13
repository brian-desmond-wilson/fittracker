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

/**
 * One press of a stepper: move to the next multiple of `step`, clamped.
 *
 * It SNAPS rather than adding, so a value that starts off-grid (a typed 83
 * with a step of 5) lands on the grid instead of carrying its offset forever
 * — 83 → 85 → 90, not 83 → 88 → 93. With `step: 1` snapping and adding are
 * the same thing, which is why the quantity steppers behave exactly as they
 * did before this existed.
 *
 * Lives here, not in the stepper component, because this repo's Jest run
 * covers pure libs only and a stepper that quietly stops at 99 is precisely
 * the kind of bug no typecheck catches.
 */
export function nudgeOnGrid(
  value: number,
  direction: 1 | -1,
  opts: { step?: number; min?: number; max?: number } = {},
): number {
  const step = opts.step && opts.step > 0 ? opts.step : 1;
  const min = opts.min ?? 0;
  const max = opts.max ?? Number.POSITIVE_INFINITY;
  const base = Number.isFinite(value) ? value : min;
  const next = direction > 0
    ? Math.floor(base / step) * step + step
    : Math.ceil(base / step) * step - step;
  return Math.max(min, Math.min(max, next));
}
