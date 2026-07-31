import {
  estimateConsumption,
  RATE_WINDOW_DAYS,
  MIN_UNITS,
  MIN_SPAN_DAYS,
  type DecrementEvent,
} from "../consumptionRate";

const TODAY = "2026-07-30";
// dateLocal N days before TODAY (local-date arithmetic, matching the lib's).
// Derived from TODAY itself (not a second hardcoded literal) so there is one
// source of truth for the anchor every assertion in this file hangs off; the
// noon anchor and the independence from the lib's own daysBetweenLocalDates
// implementation are both intentional and preserved.
const daysAgo = (n: number): string => {
  const [y, m, d] = TODAY.split("-").map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d, 12);
  dt.setDate(dt.getDate() - n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};
const ev = (inventoryId: string, n: number): DecrementEvent => ({ inventoryId, dateLocal: daysAgo(n) });

const run = (events: DecrementEvent[], total = 10) =>
  estimateConsumption({
    events,
    totalsById: new Map([["a", total]]),
    todayLocalDate: TODAY,
  });

describe("estimateConsumption", () => {
  it("computes rate over the window and ceil(total/rate)", () => {
    // 4 units in 28 days → 1/7 per day; total 10 → ceil(70) = 70
    const r = run([ev("a", 20), ev("a", 15), ev("a", 10), ev("a", 2)]);
    expect(r.get("a")).toEqual({ ratePerDay: 4 / RATE_WINDOW_DAYS, daysUntilOut: 70 });
  });

  it(`gate: fewer than MIN_UNITS (${MIN_UNITS}) in-window units → no estimate`, () => {
    expect(run([ev("a", 20), ev("a", 10)]).has("a")).toBe(false);          // 2 < 3
    expect(run([ev("a", 20), ev("a", 15), ev("a", 10)]).has("a")).toBe(true); // exactly 3
  });

  it(`gate: history span under MIN_SPAN_DAYS (${MIN_SPAN_DAYS}) → no estimate`, () => {
    expect(run([ev("a", 13), ev("a", 7), ev("a", 2)]).has("a")).toBe(false);  // span 13
    expect(run([ev("a", 14), ev("a", 7), ev("a", 2)]).has("a")).toBe(true);   // span exactly 14
  });

  it("an event outside the window doesn't count toward units but DOES span", () => {
    // day-30 event: excluded from the 28-day unit count, but proves history depth.
    const r = run([ev("a", 30), ev("a", 6), ev("a", 4), ev("a", 2)]);
    expect(r.get("a")!.ratePerDay).toBe(3 / RATE_WINDOW_DAYS);
  });

  it("window boundary: day RATE_WINDOW_DAYS−1 counts, day RATE_WINDOW_DAYS doesn't", () => {
    const inWin = run([ev("a", RATE_WINDOW_DAYS - 1), ev("a", 20), ev("a", 2)]);
    expect(inWin.has("a")).toBe(true); // 3 units
    const outWin = run([ev("a", RATE_WINDOW_DAYS), ev("a", 20), ev("a", 2)]);
    expect(outWin.has("a")).toBe(false); // only 2 in window
  });

  it("already out → daysUntilOut 0", () => {
    const r = run([ev("a", 20), ev("a", 10), ev("a", 2)], 0);
    expect(r.get("a")!.daysUntilOut).toBe(0);
  });

  it("no events / unknown item → empty map entry absent", () => {
    expect(run([]).size).toBe(0);
    const r = estimateConsumption({
      events: [ev("b", 5), ev("b", 4), ev("b", 3)],
      totalsById: new Map([["a", 10]]), // b has events but no total → skipped
      todayLocalDate: TODAY,
    });
    expect(r.size).toBe(0);
  });

  it("rejects a non-finite event age instead of letting it silently clear the span gate", () => {
    // A malformed/empty dateLocal makes daysBetweenLocalDates return NaN.
    // Unguarded, NaN < 0 is false (so the event isn't dropped) and
    // Math.max(...ages) becomes NaN, and NaN < MIN_SPAN_DAYS is ALSO false —
    // so the span gate silently passes. The real span here (day 0 to day 2)
    // is only 2 days, well under MIN_SPAN_DAYS, so this must NOT estimate.
    const events: DecrementEvent[] = [
      { inventoryId: "a", dateLocal: "" },
      ev("a", 0),
      ev("a", 1),
      ev("a", 2),
    ];
    expect(run(events).has("a")).toBe(false);
  });

  it("rounds daysUntilOut up (ceil), not down or to nearest", () => {
    // 3 in-window units (span 18, clears both gates) → rate 3/28;
    // total 10 → 10 / (3/28) = 93.33... → ceil is 94, floor would be 93.
    const r = run([ev("a", 20), ev("a", 15), ev("a", 2)]);
    expect(r.get("a")!.daysUntilOut).toBe(94);
  });

  it("rejects future-dated events (never fabricates demand from a clock/timezone skew)", () => {
    // Ages [-11, 10, 25]: with the guard, only 10 and 25 are legitimate
    // in-window units (2 < MIN_UNITS) → no estimate. Without the guard, the
    // future-dated event would count as a third in-window unit and produce one.
    const events: DecrementEvent[] = [ev("a", -11), ev("a", 10), ev("a", 25)];
    expect(run(events).has("a")).toBe(false);
  });

  it("counts a same-day (age 0) event toward the window, not just strictly-past ones", () => {
    // Ages [0, 14, 20]: age 0 is a meal logged today. If the future-date
    // guard were age <= 0 instead of age < 0, this event would be dropped,
    // leaving only 2 in-window units (< MIN_UNITS) and no estimate at all —
    // a real day's log shouldn't be invisible for the rest of that day.
    const r = run([ev("a", 0), ev("a", 14), ev("a", 20)]);
    expect(r.get("a")).toEqual({ ratePerDay: 3 / RATE_WINDOW_DAYS, daysUntilOut: 94 });
  });
});
