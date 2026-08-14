// mobile/src/theme/tokens.ts
// FitTracker design tokens — the ONLY place raw color/size values may live.
// Spec: docs/superpowers/specs/2026-08-01-fittracker-style-guide-design.md
import type { TextStyle, ViewStyle } from "react-native";

export const colors = {
  bg: "#0A0F1E",
  surface: "#111827",
  surface2: "#1E293B",
  border: "#1F2937",
  text: "#F9FAFB",
  textMuted: "#9CA3AF",
  textFaint: "#6B7280",
  brand: "#22C55E",
  onBrand: "#FFFFFF",
  success: "#22C55E",
  warning: "#F59E0B",
  danger: "#EF4444",
  imageWell: "#FFFFFF", // product photos are shot on white; wells stay white on dark cards
  shadow: "#000000",    // only for `elevation` below — never a fill or a stroke
  // The Nutrition Facts panel is a regulated artifact, not a component: its
  // identity IS black on white with those rule weights, and a dark-themed
  // version reads as "some card about nutrition" rather than as the back of
  // the packet. Same class of exception as `imageWell` — a faithful
  // reproduction of something physical. Never use these for app chrome.
  labelPaper: "#FFFFFF",
  labelInk: "#000000",
  scrim: "rgba(0,0,0,0.5)",
  accents: {
    meals: "#F97316",
    // The library is Fuel's sibling station — a warm amber one step off
    // `meals` orange, so the two tiles read as family without either one
    // borrowing the other's identity. Its own key (not `photos`) because a
    // camera tile and a recipe book are unrelated things that happen to be
    // amber; either may move without dragging the other.
    mealLibrary: "#FBBF24",
    water: "#3B82F6",
    inventory: "#8B5CF6",
    shopping: "#14B8A6",
    // A delivery is the leg between the two stations either side of it — you
    // have bought it (shopping) and you do not have it yet (inventory) — so its
    // identity is the midpoint of that teal and that purple. Its own key rather
    // than borrowing either one: a box on the way is neither a list nor stock,
    // and the whole reason the pending table exists is that the app must not
    // say otherwise.
    deliveries: "#6366F1",
    brand: "#22C55E",
    // Track hub's non-nutrition tiles (Task 7). Identity only, same as above:
    // each is the tile's own pre-existing base hex, now named by domain so the
    // tile can pass an `accent` key instead of a hex/rgba pair. `photos` and
    // `workouts` are literally `warning`/`danger`, but they are IDENTITY here
    // (a camera tile, a dumbbell tile), not a semantic verdict — a tile must
    // not have to reach for `colors.danger` to say "Workouts".
    measurements: "#EC4899",
    photos: "#F59E0B",
    workouts: "#EF4444",
  },
  /**
   * Data-series palette for macro meters — the fills `macroColor()` returns
   * into macro bars and rings (spec §8 stage 6 sanctions macro-bar fills as a
   * surviving identity use). Keyed by PROGRESS STATE, not by macro name: the
   * function maps (value, goal, macro) onto a verdict, it never colors
   * "protein" differently from "carbs".
   *
   * `under` is byte-identical to `accents.water` and the other three to
   * `success`/`warning`/`danger` — deliberately NOT deduplicated. These are
   * marks on a meter, not a domain identity and not a semantic verdict badge:
   * a bar showing 60% of a sodium cap must not repaint because the app's
   * danger red or its water accent changed. Same reasoning Task 7 recorded
   * for `accents.photos`/`accents.workouts`.
   */
  macros: {
    under: "#3B82F6",   // in progress toward a goal / approaching a cap
    met: "#22C55E",     // at or past a "hit this" goal
    atCap: "#F59E0B",   // at a "do not exceed" cap
    overCap: "#EF4444", // more than 10% past a cap
  },
} as const;

export type AccentKey = keyof typeof colors.accents;

/**
 * The one translucent-fill helper: takes a token hex, returns `rgba()`.
 *
 * The common cases are the 0.15 default (tiles, badges, banner fills) and 0.3
 * for the matching border on a tinted banner — those two alphas are what spec
 * §4.2 collapses ~60 hand-typed `rgba()` literals onto, and new surface fills
 * should use them.
 *
 * It is not limited to those: a caller with a genuinely functional alpha passes
 * its own. `BarcodeScannerModal` dims its camera viewfinder with
 * `tint(colors.bg, 0.6 / 0.8)` because that darkness has to keep white chrome
 * legible over an arbitrarily bright live image, which neither 0.15 nor the
 * fixed `colors.scrim` can express. Such a call must justify its alpha at the
 * call site; the point of the helper is that the COLOR still comes from a
 * token, never a raw literal.
 */
export function tint(hex: string, alpha = 0.15): string {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
    throw new Error(`tint(): expected #RRGGBB, got "${hex}"`);
  }
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * The one exception to a deliberately flat system.
 *
 * Cards, sheets and panels stay flat: they belong to the page, and a fill step
 * is enough to separate them. Transient surfaces that float OVER content —
 * toasts and snackbars — cannot be read that way, because the palette has only
 * three neutral fills and the lightest of them is already spoken for by every
 * other raised panel. A shadow is what says "this is above the page and will
 * leave again"; no fill can say it.
 *
 * Deliberately ONE step, not a scale. A scale invites arbitrary depth
 * decisions; this is a single named case with a single answer.
 */
export const elevation = {
  overlay: {
    shadowColor: colors.shadow,
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8, // Android reads this and ignores the rest
  } satisfies ViewStyle,
};

export const spacing = {
  xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32,
  screenGutter: 16,
} as const;

export const radii = { control: 8, row: 12, panel: 16, pill: 999 } as const;

export const typography = {
  titleRoot: { fontSize: 28, fontWeight: "bold" } satisfies TextStyle,
  titleBar: { fontSize: 17, fontWeight: "600" } satisfies TextStyle,
  section: {
    fontSize: 13, fontWeight: "700", textTransform: "uppercase",
    letterSpacing: 0.5, color: colors.textMuted,
  } satisfies TextStyle,
  rowTitle: { fontSize: 16, fontWeight: "600" } satisfies TextStyle,
  body: { fontSize: 14 } satisfies TextStyle,
  caption: { fontSize: 12, color: colors.textMuted } satisfies TextStyle,
  button: { fontSize: 16, fontWeight: "600" } satisfies TextStyle,
  buttonSm: { fontSize: 14, fontWeight: "600" } satisfies TextStyle,
} as const;

export const icons = { sm: 16, md: 20, lg: 24, xl: 32, strokeWidth: 2 } as const;
