// mobile/src/lib/loopStatus.ts
// Pure projection of the Nutrition OS loop: six StationStatus entries built
// from data the shipped engines already computed. No fetching, no fabrication:
// forecast entries absent from `rates` (honesty gates) are simply absent here,
// and Eat Next stock display goes through eatNextStockBadge rather than being
// re-derived from `reasons` (the Phase 4 Task 14 lesson).
import type { ItemStockState } from "./stockState";
import { isExpiringSoon, reviewExpiry } from "./expiryPolicy";
import type { EatNextResult, EatNextStockInfo } from "./eatNext";
import { eatNextExpiringLine, eatNextStockBadge } from "./eatNext";
import type { MealPaceState } from "./mealPace";
import type { ConsumptionEstimate } from "./consumptionRate";
import { MAX_DISPLAY_DAYS, MIN_SPAN_DAYS, MIN_UNITS } from "./consumptionRate";
import { FORECAST_LEAD_DAYS } from "./shoppingDemand";

export type StationKey = "inventory" | "library" | "eatNext" | "pace" | "forecast" | "shopping";
/** Structurally a subset of ui/Badge's BadgeTone — the engine must not import
 *  from src/components (layering rule; see Phase 5 amendments). */
export type StationTone = "warning" | "danger" | "success" | "neutral" | "inventory" | "shopping" | "meals" | "brand";

export interface StationChip { label: string; tone: StationTone }
export interface StationDetailLine { label: string; value: string }
export interface StationDetail {
  lines: StationDetailLine[];
  chips: StationChip[];
  footnote: string | null;
}

export type LoopDestination =
  | "/(tabs)/track/food-inventory"
  | "/(tabs)/track/meal-library"
  | "/(tabs)/track/fuel"
  | "/(tabs)/track/shopping";

export interface StationStatus {
  key: StationKey;
  title: string;
  headline: string;
  badge: StationChip | null;
  attention: boolean;
  connector: string;
  detail: StationDetail;
  destination: LoopDestination;
  destinationLabel: string;
}

export interface LoopStatus { stations: StationStatus[]; attentionCount: number }

// No `todayLocalDate`: every date-relative fact a station renders is already
// resolved upstream (`ItemStockState.daysLeft`/`.expiration`,
// `ConsumptionEstimate.daysUntilOut`, `MealPaceState`). A station needing
// today's date would have to derive a date-relative fact ITSELF, which the
// header comment above forbids — so that need would be the signal the
// computation belongs upstream, not that this field should return.
export interface LoopStatusInputs {
  /** `categories` = `food_categories.name` values the item carries; drives the
   *  expiry-aging grace window (expiryPolicy.ts). Optional so synthetic
   *  fixtures stay terse — absent means the conservative perishable default. */
  inventory: Array<{ id: string; name: string; state: ItemStockState; categories?: string[] }>;
  /** The library AND its ranking in ONE array: `raw` ranks (spec §5.5),
   *  `display` is the /100 UI value. `useLoopHub` fills both with the same pure
   *  trio `useEatNext` uses. Deliberately not two parallel arrays — a separate
   *  `mealScores` let the count come from one and the content from the other
   *  (`meals: [a]` + `scores: [a, ghost]` → "1 meals · top: Ghost"), and an
   *  empty-scores/non-empty-meals pair crashed all six stations. */
  meals: Array<{ id: string; name: string; raw: number; display: number }>;
  stockByMealId: Map<string, EatNextStockInfo>;
  eatNext: EatNextResult | null;
  paceCalories: MealPaceState;
  paceProtein: MealPaceState;
  totals: { calories: number; protein: number };
  goals: { calories: number | null; protein: number | null };
  rates: Map<string, ConsumptionEstimate>;
  suggestions: Array<{ name: string; priority: 1 | 2 | 3; reasons: string[] }>;
  listRows: Array<{ vendor_id: string | null; is_purchased: boolean }>;
  vendors: Array<{ id: string; name: string }>;
}

export const DETAIL_MAX_ROWS = 5;

/** Row-order context labels for station 3's detail. */
export const CONTEXT_LABELS: Record<EatNextResult["context"], string> = {
  after_window: "after eating window",
  goal_hit: "goal hit",
  post_workout: "post-workout",
  emergency: "emergency",
  catch_up: "catch-up",
  next_meal: "next meal",
};

// `+ 1`: at exactly DETAIL_MAX_ROWS + 1 the summary chip would occupy the very
// row it is summarising — same chip count, one fewer NAME. Truncation has to
// buy back at least one row to be worth doing.
const capChips = (chips: StationChip[]): StationChip[] =>
  chips.length <= DETAIL_MAX_ROWS + 1
    ? chips
    : [...chips.slice(0, DETAIL_MAX_ROWS), { label: `+${chips.length - DETAIL_MAX_ROWS} more`, tone: "neutral" }];

const capLines = (lines: StationDetailLine[]): { lines: StationDetailLine[]; overflow: number } =>
  lines.length <= DETAIL_MAX_ROWS
    ? { lines, overflow: 0 }
    : { lines: lines.slice(0, DETAIL_MAX_ROWS), overflow: lines.length - DETAIL_MAX_ROWS };

function inventoryStation(inp: LoopStatusInputs, readyCount: number): StationStatus {
  const out = inp.inventory.filter((i) => i.state.isOut);
  // The three populations the Inventory screen splits on, named the same way
  // here so the two agree. `isArchived` there is out OR stale, which is why
  // "35 items · 14 out" read as 21 usable when the page said 8: the other 13
  // are still on the shelf but long past their date.
  const past = inp.inventory.filter(
    (i) => !i.state.isOut && reviewExpiry(i.state, i.categories) === "stale",
  );
  const usable = inp.inventory.length - out.length - past.length;
  // C3: the ONE "expiring" definition, shared with the Inventory screen —
  // excludes out-of-stock items and stale (aged-out) expired items. Never
  // re-derive from bands here; the policy module owns the semantics.
  const expiring = inp.inventory.filter((i) => isExpiringSoon(i.state, i.categories));
  const badge: StationChip =
    out.length > 0 ? { label: `${out.length} out`, tone: "danger" }
    : expiring.length > 0 ? { label: `${expiring.length} expiring`, tone: "warning" }
    : { label: "Stocked", tone: "success" };
  const expiringSorted = [...expiring].sort(
    (a, b) => (a.state.daysLeft ?? -1) - (b.state.daysLeft ?? -1),
  );
  // "today" gets its own word rather than "0d left". `projectItemStock` bands
  // day zero as "today" (stockState.ts:121) and `expiryClause` exists precisely
  // so the MOST urgent value doesn't render as the least urgent-sounding string
  // (eatNext.ts:291-293, ruled twice). Station 1 saying "0d left" while station 3
  // says "expires today" would be two answers in one sheet stack.
  const rawLines = expiringSorted.map((i) => ({
    label: i.name,
    value: i.state.expiration === "expired" ? "expired"
      : i.state.expiration === "today" ? "today"
      : `${i.state.daysLeft}d left`,
  }));
  const { lines, overflow } = capLines(rawLines);
  return {
    key: "inventory",
    title: "Inventory",
    // Leads with what is actually usable, which is the number the page it
    // links to leads with. The three sum to the whole shelf.
    headline: `${usable} usable · ${out.length} out · ${past.length} past`,
    badge,
    attention: out.length > 0 || expiring.length > 0,
    // A10. These captions describe how one station feeds the next, and they
    // were written in schema words — "assemblability", "meal_logs" — on a
    // screen about food. Same fact, said the way a person would say it.
    connector: `what you have makes ${readyCount} of ${inp.meals.length} meals`,
    detail: {
      lines,
      chips: capChips(out.map((i) => ({ label: i.name, tone: "danger" as const }))),
      footnote: overflow > 0 ? `+${overflow} more expiring` : null,
    },
    destination: "/(tabs)/track/food-inventory",
    destinationLabel: "Open Inventory",
  };
}

function libraryStation(inp: LoopStatusInputs, readyCount: number): StationStatus {
  const n = inp.meals.length;
  const ranked = [...inp.meals].sort((a, b) => b.raw - a.raw);
  // `undefined` ⟺ `n === 0`, by construction — count and content are now the
  // same array, so no assertion and no paired invariant to maintain.
  const top = ranked[0];
  const topThree = ranked.slice(0, 3);
  return {
    key: "library",
    title: "Meal Library",
    // A11. "17 meals · top: Cheeseburger Bo…" — the prefix cost five
    // characters of the one thing worth reading, and the row truncates.
    // The meal is already the largest thing on the line and the count sits
    // beside it; nothing needed the word "top".
    headline: top === undefined ? "0 meals — build your library"
      : `${top.name} ${top.display} · ${n} meals`,
    badge: n === 0 ? null
      : readyCount === 0 ? { label: "0 ready", tone: "warning" }
      : { label: `${readyCount} ready`, tone: "success" },
    attention: n > 0 && readyCount === 0,
    connector: "ranked for right now",
    detail: {
      lines: topThree.map((m) => ({ label: m.name, value: `${m.display} / 100` })),
      chips: capChips(topThree.map((m) => {
        const s = inp.stockByMealId.get(m.id);
        // An ABSENT entry is UNKNOWN, not missing. `buildStockByMealId` skips
        // item-less meals by design, so absence is a routine live state, and
        // station 3 already honors it (`eatNextStockBadge(undefined)` → null →
        // no badge). A warning-toned "missing ?" would be a verdict on data we
        // never had — the fabrication §4.1 forbids. Neutral keeps the row
        // present (a dropped chip leaves an unexplained gap in a 3-row list)
        // while "unknown" states exactly what we know.
        if (s === undefined) {
          return { label: `${m.name}: unknown`, tone: "neutral" as const };
        }
        if (s.assemblable) {
          return { label: `${m.name}: ready`, tone: "success" as const };
        }
        // The HELPER owns the unresolved-count rule: `missingCount === 0` on a
        // non-assemblable meal renders "Missing items", never "Missing 0"
        // (eatNext.ts:255-261 ruled this once already). Station 2 only
        // reshapes that label into its "{name}: {verdict}" chip format rather
        // than answering the same question a second, drift-prone time.
        //
        // Tone stays `warning`, NOT the `neutral` of the unknown chip above:
        // `assemblable: false` is a real assessment — only the COUNT is
        // unresolved — so the verdict is earned even when the number isn't.
        //
        // `!` is sound because `eatNextStockBadge` returns null for exactly one
        // input, `undefined`, and `s` is narrowed non-undefined by this point.
        // `toLowerCase()` assumes the helper's labels carry no proper nouns;
        // the tests below are what hold that assumption in place.
        // Tone now comes FROM the helper rather than being hardcoded here.
        // The reasoning above still holds for a genuine shortfall, but it no
        // longer holds for every non-assemblable meal: one blocked purely by
        // unlinked ingredients is not a verdict about the kitchen, and the
        // helper returns `neutral` for it — the same tone as the unknown chip.
        return {
          label: `${m.name}: ${eatNextStockBadge(s)!.label.toLowerCase()}`,
          tone: eatNextStockBadge(s)!.tone,
        };
      })),
      footnote: null,
    },
    // The library has its own page now. It used to open Fuel, which is the
    // station AFTER this one — the loop's own arrow pointed one step ahead of
    // where you tapped.
    destination: "/(tabs)/track/meal-library",
    destinationLabel: "Open Meal Library",
  };
}

function eatNextStation(inp: LoopStatusInputs): StationStatus {
  const r = inp.eatNext;
  const pick = r?.recommendations[0] ?? null;
  const runnerUp = r?.recommendations[1] ?? null;
  // ONE call, reused for the row badge, the sheet chip, and the attention
  // flag — the shipped helper is the single definition of this copy, and
  // re-deriving it from `missingCount` here is precisely the drift Phase 4
  // Task 14 closed (it also renders "Missing items", not "Missing 0", for a
  // known-unassemblable meal with an unresolved count).
  const pickBadge = eatNextStockBadge(pick?.stock);
  const expiring = pick ? eatNextExpiringLine(pick.stock) : null;
  const runnerUpBadge = eatNextStockBadge(runnerUp?.stock);
  return {
    key: "eatNext",
    title: "Eat Next",
    headline: pick ? `${pick.name} · ${pick.calories} cal · ${pick.prepMinutes} min`
      : r?.message ?? "—",
    badge: pickBadge ? { label: pickBadge.label, tone: pickBadge.tone } : null,
    // Warning badge on the pick, OR a LOADED result that produced no pick at
    // all while the library has meals (spec §5). `eatNext === null` is "not
    // loaded yet", never a stalled loop, so it stays quiet.
    // Keyed on the WARNING tone, not on `!assemblable`: a pick held back only
    // by unlinked ingredients is a curation nudge, and raising the loop's
    // attention flag for it would put the station permanently in alarm while
    // the concept graph is still being filled in.
    attention:
      (pickBadge !== null && pickBadge.tone === "warning") ||
      (r !== null && r.recommendations.length === 0 && inp.meals.length > 0),
    connector: "eating one takes it off the shelf",
    detail: {
      lines: pick ? [
        // `r!` is sound: `pick` comes from `r?.recommendations[0]`, so a
        // non-null `pick` implies a non-null `r`. A `r ? … : "—"` ternary here
        // would read as a real case that can never occur.
        { label: "Context", value: CONTEXT_LABELS[r!.context] },
        { label: "Calories", value: String(pick.calories) },
        { label: "Protein", value: `${pick.protein}g` },
        { label: "Prep · Score", value: `${pick.prepMinutes} min · ${pick.score}/100` },
        ...(expiring ? [{ label: "Expiring", value: expiring }] : []),
      ] : [],
      // `EatNextStockInfo` carries a COUNT, not names, so the sheet shows the
      // count chip only. Adding per-meal missing NAMES would mean re-running
      // assemblability here — a new derivation, out of scope for a projection.
      chips: pickBadge && !pickBadge.assemblable
        ? [{ label: pickBadge.label, tone: pickBadge.tone }]
        : [],
      footnote: runnerUp
        ? `Runner-up: ${runnerUp.name} · ${runnerUp.calories} cal${runnerUpBadge ? ` · ${runnerUpBadge.label}` : ""}`
        : null,
    },
    destination: "/(tabs)/track/fuel",
    destinationLabel: "Open Fuel",
  };
}

const fmt = (n: number): string => n.toLocaleString("en-US");

function paceStation(inp: LoopStatusInputs): StationStatus {
  const { paceCalories: pc, paceProtein: pp } = inp;
  const behind = pc.status === "behind" || pp.status === "behind";
  // A macro with NO goal cannot speak to pace. `computeMealPace` returns
  // `{ status: "on_pace" }` as its no-goal SENTINEL (mealPace.ts:97-99), so an
  // ungated read of the status treats "we were never asked to track this" as
  // "you're on pace" — pinning the badge to "On pace" all day for a user with
  // no protein goal, even before the window opens, while calories correctly
  // reported before_window. The status enum can't express the difference; the
  // goal can, and the engine already has it (it em-dashes the same null below).
  const hasGoal = (goal: number | null) => goal !== null;
  const paceish = (p: MealPaceState, goal: number | null) =>
    hasGoal(goal) && ["on_pace", "ahead", "goal_hit"].includes(p.status);
  const goalHit = (p: MealPaceState, goal: number | null) =>
    hasGoal(goal) && p.status === "goal_hit";
  const bothGoal = goalHit(pc, inp.goals.calories) && goalHit(pp, inp.goals.protein);
  const anyPaceish = paceish(pc, inp.goals.calories) || paceish(pp, inp.goals.protein);
  const windowLabel = pc.status === "before_window" ? "Before window" : "Day done";
  const badge: StationChip = behind ? { label: "Behind", tone: "warning" }
    : bothGoal ? { label: "Goal hit", tone: "success" }
    : anyPaceish ? { label: "On pace", tone: "success" }
    : { label: windowLabel, tone: "neutral" };
  const goalStr = (g: number | null) => (g === null ? "—" : fmt(g));
  const lines: StationDetailLine[] = [
    { label: "Calories", value: `${fmt(inp.totals.calories)} / ${goalStr(inp.goals.calories)} · ${pc.status}` },
    { label: "Protein", value: `${fmt(inp.totals.protein)}g / ${goalStr(inp.goals.protein)}g · ${pp.status}` },
  ];
  // Unit travels with its state as a pair rather than being recovered by an
  // identity check against `pc` — a caller passing ONE state object for both
  // macros (two equal literals hoisted to a shared const) would otherwise get
  // both catch-up lines labelled "cal".
  for (const [p, unit] of [[pc, "cal"], [pp, "g"]] as const) {
    if (p.status !== "behind" || p.catchUpAmount == null) continue;
    lines.push({
      label: "Catch up",
      value: `${p.catchUpAmount} ${unit} by ${p.catchUpLabel ?? "end of day"}`,
    });
  }
  return {
    key: "pace",
    title: "Today's Pace",
    headline: `${fmt(inp.totals.calories)} / ${goalStr(inp.goals.calories)} cal · ${fmt(inp.totals.protein)} / ${goalStr(inp.goals.protein)}g protein`,
    badge,
    attention: behind,
    connector: "what you log becomes your pace",
    detail: { lines, chips: [], footnote: null },
    destination: "/(tabs)/track/fuel",
    destinationLabel: "Open Fuel",
  };
}

function forecastStation(inp: LoopStatusInputs): StationStatus {
  const nameById = new Map(inp.inventory.map((i) => [i.id, i.name]));
  const tracked = [...inp.rates.entries()]
    .filter(([id]) => nameById.has(id))
    .map(([id, est]) => ({ name: nameById.get(id)!, ...est }))
    .sort((a, b) => a.daysUntilOut - b.daysUntilOut);
  const urgent = tracked.filter((t) => t.daysUntilOut <= FORECAST_LEAD_DAYS);
  const first = tracked[0] ?? null;
  const itemWord = (n: number) => (n === 1 ? "item" : "items");
  const headline = tracked.length === 0 ? "no items tracked yet"
    : first!.daysUntilOut <= MAX_DISPLAY_DAYS
      ? `${first!.name} ~${first!.daysUntilOut}d left · ${tracked.length} ${itemWord(tracked.length)} tracked`
      : `${tracked.length} ${itemWord(tracked.length)} tracked`;
  const { lines } = capLines(
    tracked
      .filter((t) => t.daysUntilOut <= MAX_DISPLAY_DAYS)
      .map((t) => ({ label: t.name, value: `~${t.daysUntilOut}d left` })),
  );
  // Counted against the FULL tracked set, not just the display-eligible slice
  // `capLines` saw. The headline says "N items tracked"; if the footnote counted
  // only the row cap, items dropped by the MAX_DISPLAY_DAYS filter would vanish
  // unaccounted — the same noun describing two different sets, one tap apart.
  const hiddenTracked = tracked.length - lines.length;
  // An empty forecast used to be a dead end: a row saying "no items tracked
  // yet" that opened an empty sheet. The station is waiting on something
  // specific and knowable, so it says what.
  const emptyNote =
    `Nothing has been used often enough yet — an item needs ${MIN_UNITS} uses ` +
    `spread over at least ${MIN_SPAN_DAYS} days before its rate means anything.`;
  return {
    key: "forecast",
    title: "Forecast",
    headline,
    badge: urgent.length > 0 ? { label: `${urgent.length} urgent`, tone: "shopping" } : null,
    attention: urgent.length > 0,
    connector: "gaps and forecasts become a list",
    detail: {
      lines,
      chips: [],
      footnote: tracked.length === 0 ? emptyNote
        : hiddenTracked > 0 ? `+${hiddenTracked} more tracked`
        : null,
    },
    destination: "/(tabs)/track/shopping",
    destinationLabel: "Open Shopping",
  };
}

function shoppingStation(inp: LoopStatusInputs): StationStatus {
  const active = inp.listRows.filter((r) => !r.is_purchased);
  const vendorName = new Map(inp.vendors.map((v) => [v.id, v.name]));
  const byVendor = new Map<string, number>();
  let unassigned = 0;
  for (const r of active) {
    if (r.vendor_id === null || !vendorName.has(r.vendor_id)) unassigned += 1;
    else byVendor.set(r.vendor_id, (byVendor.get(r.vendor_id) ?? 0) + 1);
  }
  // Name breaks count ties so the order is deterministic. Without it, equal-count
  // vendors fall back to first-appearance order in `listRows`, which reshuffles
  // as rows get purchased — the breakdown would visibly reorder between refreshes
  // with nothing having changed. `get(id)!` is sound: `byVendor` only ever takes
  // ids that passed the `vendorName.has(...)` check above.
  const parts = [...byVendor.entries()]
    .map(([id, n]) => ({ name: vendorName.get(id)!, n }))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
    .map((v) => `${v.name} ${v.n}`);
  if (unassigned > 0) parts.push(`unassigned ${unassigned}`);
  const s = inp.suggestions.length;
  const { lines, overflow } = capLines(
    inp.suggestions.map((sg) => ({ label: sg.name, value: sg.reasons[0] ?? "" })),
  );
  return {
    key: "shopping",
    title: "Shopping",
    headline: `${active.length} on list${parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}`,
    badge: s > 0 ? { label: `${s} suggested`, tone: "shopping" } : null,
    attention: s > 0,
    // The loop CLOSING, not a dangling sixth connector: six stations, six
    // connectors, and this one is the arrow back to station 1.
    connector: "what you buy comes back as stock",
    // When both apply, overflow wins: the ↺ line is decorative, the count is
    // information.
    detail: { lines, chips: [], footnote: overflow > 0 ? `+${overflow} more suggested` : "restock returns units to Inventory ↺" },
    destination: "/(tabs)/track/shopping",
    destinationLabel: "Open Shopping",
  };
}

export function computeLoopStatus(inp: LoopStatusInputs): LoopStatus {
  // Counted over `inp.meals`, not over the map's values: a stale entry for a
  // deleted meal would otherwise inflate the count past the library size
  // ("assemblability → 3 of 2 meals ready"). Driving off `meals` makes that
  // structurally impossible rather than merely unlikely.
  const readyCount = inp.meals.filter((m) => inp.stockByMealId.get(m.id)?.assemblable).length;
  const stations = [
    inventoryStation(inp, readyCount),
    libraryStation(inp, readyCount),
    eatNextStation(inp),
    paceStation(inp),
    forecastStation(inp),
    shoppingStation(inp),
  ];
  return { stations, attentionCount: stations.filter((s) => s.attention).length };
}
