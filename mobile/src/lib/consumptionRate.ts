// Per-item consumption estimates (Nutrition OS Phase 5, spec §7). Pure.
//
// The honesty gates ARE the design: an estimate exists only with >= MIN_UNITS
// consumed inside the trailing window AND >= MIN_SPAN_DAYS of event history.
// Below that: no map entry, and the UI shows nothing — null beats a
// confident wrong number.
//
// Known bias, documented not hidden: (1) units are CONTAINERS, not servings —
// half-finishing a bottle counts the same as finishing it; (2) the Phase 4
// pre-apply gap window (zero-location items logged without decrements)
// undercounts; (3) ratePerDay divides unitsInWindow by the FULL
// RATE_WINDOW_DAYS even when the item's actual history is shorter — the
// MIN_SPAN_DAYS gate bounds this to a known factor (span >= MIN_SPAN_DAYS,
// window = RATE_WINDOW_DAYS, so the worst-case underestimate of the true
// rate is RATE_WINDOW_DAYS / MIN_SPAN_DAYS = 2x), and it's biased in the
// conservative direction for suggest-confirm: rate reads low, daysUntilOut
// reads high, so the failure mode is a missed suggestion, never a spurious
// one. (1)-(3) are all UNDER-count sources. (4) is not: the caller's events
// come from meal_logs.inventory_items, which records what a meal log CLAIMED
// against inventory, not what the consume RPC actually took
// (lib/supabase/mealLibrary.ts:417-422) — a failed decrement
// (MealLoggedButDecrementFailed, deliberately not cleaned up) or a
// resolve/consume stale-read race can leave a row claiming a unit that was
// never really removed from stock. Phantom claimed units inflate ratePerDay
// and deflate daysUntilOut, and near the MIN_UNITS boundary can manufacture
// an estimate — and a spurious forecast suggestion — for an item that wasn't
// actually being drawn down that fast. No cheap fix: actual decrements
// aren't persisted anywhere this lib could read instead, so this bias is
// carried, not corrected. This is a heuristic, not calibrated science.
import { daysBetweenLocalDates } from "./stockState";
import type { InventoryUsage } from "@/src/types/track";

export const RATE_WINDOW_DAYS = 28;
export const MIN_UNITS = 3;
export const MIN_SPAN_DAYS = 14;

// Expressed as a multiple of RATE_WINDOW_DAYS, not a bare literal, because
// that relationship is what makes the value defensible — retuning the
// window keeps the horizon at the same implied error bar instead of
// silently becoming some other fraction of a window. The bar itself: since
// spanDays is always >= MIN_SPAN_DAYS and the divisor is RATE_WINDOW_DAYS,
// every displayed daysUntilOut = n carries an implicit interval of
// [n/2, n] (the bias-3 note above, worst case 2x). At n = MAX_DISPLAY_DAYS
// (= 60 today) that's a 30-day band — already at the edge of actionable.
// Left unbounded, at n = 934 (a real measured case for a 100-count item on
// 3 logs) the interval is [467, 934]: three-digit precision the gates can't
// stand behind. Two windows is exactly where the error bar swamps the
// resolution. The lib still returns the true value below — daysUntilOut is
// NOT capped here, because the demand engine (spec §6) needs the real number
// and capping it in the lib would corrupt that input. This constant governs
// rendering only: surfaces should omit the "~Nd left" line rather than print
// a number the honesty gates can't actually stand behind.
export const MAX_DISPLAY_DAYS = RATE_WINDOW_DAYS * 2;

export interface DecrementEvent {
  inventoryId: string;
  dateLocal: string; // YYYY-MM-DD, the meal log's local date
}

/** One row of the append-only inventory trail, as the estimator cares about it. */
export interface InventoryTrailEvent {
  inventoryId: string;
  kind: "consume" | "restore";
  dateLocal: string;
  /** Epoch ms, used only to decide which consume a restore cancels. */
  at: number;
}

/**
 * Nets undone taps out of the consume stream.
 *
 * The trail is append-only: undoing a "used one" writes a compensating
 * `restore` rather than deleting the consume. So the raw rows say a unit was
 * eaten AND put back, and demand must count neither. Each restore cancels the
 * most recent unmatched consume for the same item — most recent, because an
 * undo follows its own tap by seconds, and cancelling the oldest would
 * misdate the remaining event.
 *
 * Restores with no consume left to cancel are dropped, not carried as negative
 * demand: they mean the consume fell outside the query window, and a negative
 * rate is not a thing.
 */
export function netConsumeEvents(rows: readonly InventoryTrailEvent[]): DecrementEvent[] {
  const byItem = new Map<string, { consumes: InventoryTrailEvent[]; restores: number }>();
  for (const row of rows) {
    let entry = byItem.get(row.inventoryId);
    if (!entry) {
      entry = { consumes: [], restores: 0 };
      byItem.set(row.inventoryId, entry);
    }
    if (row.kind === "consume") entry.consumes.push(row);
    else entry.restores += 1;
  }

  const out: DecrementEvent[] = [];
  for (const [inventoryId, { consumes, restores }] of byItem) {
    const survivors = [...consumes].sort((a, b) => a.at - b.at); // oldest first
    survivors.splice(Math.max(0, survivors.length - restores), restores);
    for (const c of survivors) out.push({ inventoryId, dateLocal: c.dateLocal });
  }
  return out;
}

export interface ConsumptionEstimate {
  ratePerDay: number;
  daysUntilOut: number;
}

// A `meal_logs` row's `inventory_items` is unvalidated JSONB (no DB-side
// shape check), so the expansion below is defensive: a non-array value must
// not throw out of `for…of` and take the whole caller down with it, and a
// malformed `quantity` (huge, negative, or fractional) must not grow the
// output without bound. This is hardening, not a bug fix — every writer,
// current and historical, hardcodes `quantity: 1`
// (`lib/supabase/mealLibrary.ts:423`, `components/track/MealsScreen.tsx:568-570`,
// and no other writer exists anywhere in the repo's history), so the inner
// loop below is currently dead generality.
export const MAX_CLAIMED_UNITS_PER_ROW = 1000;

/**
 * One `DecrementEvent` per unit a `meal_logs` row CLAIMS against an inventory
 * item — not a confirmed decrement. `inventory_items` records intent, not
 * outcome (`lib/supabase/mealLibrary.ts:417-422`): a row can claim a unit
 * that was never actually taken, e.g. a failed `consume_inventory_units`
 * call (`mealLibrary.ts:441-453`, deliberately not cleaned up) or a
 * stale-read race in `resolveInventoryMatches`. See the 4th bias in this
 * file's header for what that costs the estimate below. Pure, so it lives
 * here (not in `lib/supabase/shopping.ts`, its only caller) — this is the
 * one file in the pure-lib layer that owns `DecrementEvent`, and keeping the
 * adapter beside the type it produces is what makes it reachable by Jest
 * (`jest.config.js` scopes suites to pure TypeScript libs with no React
 * Native imports; `shopping.ts` pulls in `../supabase` → `expo-secure-store`
 * at module load, which is exactly what that scope excludes).
 */
export function expandDecrementEvents(
  rows: Array<{
    date: string;
    inventory_items: InventoryUsage[] | null;
    /**
     * D3. What the consume RPC CONFIRMED it took, when the log carries it.
     * Preferred over `inventory_items` wherever present, which retires bias
     * (4) in this file's header for every row written since the column
     * landed: a claim can name a unit that was never removed, and the
     * confirmed list cannot.
     *
     * `null`/absent means UNKNOWN — a row from before the column, or from a
     * path that does not decrement — not "nothing was taken", so those rows
     * still fall back to the claim rather than contributing zero demand.
     */
    consumed_inventory_ids?: string[] | null;
  }>,
): DecrementEvent[] {
  const events: DecrementEvent[] = [];
  for (const log of rows) {
    if (Array.isArray(log.consumed_inventory_ids)) {
      // One unit per id: `consume_inventory_units` decrements exactly one per
      // id passed, and only ids it actually took are recorded.
      for (const id of log.consumed_inventory_ids) {
        if (typeof id === "string" && id !== "") {
          events.push({ inventoryId: id, dateLocal: log.date });
        }
      }
      continue;
    }
    if (!Array.isArray(log.inventory_items)) continue; // malformed JSONB — never throw the caller down over it
    for (const u of log.inventory_items) {
      const claimed = Math.min(Math.max(Math.trunc(u.quantity), 0), MAX_CLAIMED_UNITS_PER_ROW);
      for (let i = 0; i < claimed; i++) {
        events.push({ inventoryId: u.id, dateLocal: log.date });
      }
    }
  }
  return events;
}

export function estimateConsumption(opts: {
  events: DecrementEvent[];
  totalsById: Map<string, number>;
  todayLocalDate: string;
}): Map<string, ConsumptionEstimate> {
  const { events, totalsById, todayLocalDate } = opts;
  const byItem = new Map<string, number[]>(); // ages in days
  for (const e of events) {
    const age = daysBetweenLocalDates(e.dateLocal, todayLocalDate);
    // Reject non-finite ages (a malformed/empty dateLocal makes
    // daysBetweenLocalDates return NaN, which is falsy in every comparison —
    // NaN < 0 is false, and unguarded it would silently clear the
    // MIN_SPAN_DAYS gate below; see stockState.ts:125-129 for the sibling
    // hazard) together with future-dated logs, which never count either.
    if (!Number.isFinite(age) || age < 0) continue;
    const arr = byItem.get(e.inventoryId) ?? [];
    arr.push(age);
    byItem.set(e.inventoryId, arr);
  }

  const out = new Map<string, ConsumptionEstimate>();
  for (const [inventoryId, ages] of byItem) {
    const total = totalsById.get(inventoryId);
    if (total === undefined) continue;
    const unitsInWindow = ages.filter((a) => a < RATE_WINDOW_DAYS).length;
    const spanDays = Math.max(...ages);
    if (unitsInWindow < MIN_UNITS || spanDays < MIN_SPAN_DAYS) continue;
    const ratePerDay = unitsInWindow / RATE_WINDOW_DAYS;
    out.set(inventoryId, {
      ratePerDay,
      daysUntilOut: total <= 0 ? 0 : Math.ceil(total / ratePerDay),
    });
  }
  return out;
}

/** Sweep D5: how many units of buffer a learned threshold should hold —
 *  roughly a week of usage plus shopping cadence slack. */
export const RESTOCK_BUFFER_DAYS = 10;

/**
 * A restock threshold derived from observed consumption instead of the
 * hand-set 0/1 defaults that made the low-stock signal meaningless. Ceil of
 * the buffer window at the observed rate, floored at one unit — a threshold
 * of zero can never fire. Advisory: surfaces as a suggestion the user
 * applies, never a silent overwrite of their own setting.
 */
export function suggestedRestockThreshold(est: ConsumptionEstimate): number {
  return Math.max(1, Math.ceil(est.ratePerDay * RESTOCK_BUFFER_DAYS));
}
