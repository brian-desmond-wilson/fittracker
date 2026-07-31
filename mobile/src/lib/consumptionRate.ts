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
// one. This is a heuristic, not calibrated science.
import { daysBetweenLocalDates } from "./stockState";

export const RATE_WINDOW_DAYS = 28;
export const MIN_UNITS = 3;
export const MIN_SPAN_DAYS = 14;

// Beyond roughly two months out, a daysUntilOut estimate carries no useful
// information: at the minimum passing rate (MIN_UNITS over RATE_WINDOW_DAYS),
// a single high-count item projects hundreds of days from as few as three
// data points. The lib still returns the true value below — daysUntilOut is
// NOT capped here, because the demand engine (spec §6) needs the real number
// and capping it in the lib would corrupt that input. This constant governs
// rendering only: surfaces should omit the "~Nd left" line rather than print
// a number the honesty gates can't actually stand behind.
export const MAX_DISPLAY_DAYS = 60;

export interface DecrementEvent {
  inventoryId: string;
  dateLocal: string; // YYYY-MM-DD, the meal log's local date
}

export interface ConsumptionEstimate {
  ratePerDay: number;
  daysUntilOut: number;
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
