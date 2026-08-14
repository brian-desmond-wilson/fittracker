import {
  HOUR_HEIGHT,
  calculateEventPosition,
  detectOverlappingEvents,
  formatDateHeader,
  getEventsForDate,
  isToday,
  shouldEventRecur,
} from "../schedule-utils";
import type { ScheduleEvent } from "../../types/schedule";

const event = (over: Partial<ScheduleEvent> = {}): ScheduleEvent =>
  ({
    id: over.id ?? "e1",
    title: "Event",
    start_time: "09:00",
    end_time: "10:00",
    date: "2026-08-14",
    is_recurring: false,
    recurrence_days: null,
    status: "pending",
    ...over,
  }) as ScheduleEvent;

describe("calculateEventPosition", () => {
  it("measures the grid from 5am", () => {
    expect(calculateEventPosition(event({ start_time: "05:00", end_time: "06:00" })).top).toBe(0);
    expect(calculateEventPosition(event({ start_time: "09:00", end_time: "10:00" })).top)
      .toBe(4 * HOUR_HEIGHT);
  });

  it("places the small hours at the far end of the day, not above it", () => {
    // 2am belongs to the end of the 5am-to-5am day, not to a negative offset.
    expect(calculateEventPosition(event({ start_time: "02:00", end_time: "03:00" })).top)
      .toBe(21 * HOUR_HEIGHT);
  });

  it("scales height with duration, part-hours included", () => {
    expect(calculateEventPosition(event({ start_time: "09:00", end_time: "10:30" })).height)
      .toBe(1.5 * HOUR_HEIGHT);
  });

  it("keeps a very short event tall enough to see and tap", () => {
    const { height } = calculateEventPosition(event({ start_time: "09:00", end_time: "09:05" }));
    expect(height).toBe((15 / 60) * HOUR_HEIGHT);
  });

  it("handles an event that runs past midnight", () => {
    expect(calculateEventPosition(event({ start_time: "23:00", end_time: "01:00" })).height)
      .toBe(2 * HOUR_HEIGHT);
  });
});

describe("detectOverlappingEvents", () => {
  const layoutOf = (evts: ScheduleEvent[]) =>
    new Map(
      detectOverlappingEvents(evts).map((p) => [p.event.id, p]),
    );

  it("leaves an event alone when nothing overlaps it", () => {
    const out = detectOverlappingEvents([
      event({ id: "a", start_time: "09:00", end_time: "10:00" }),
      event({ id: "b", start_time: "11:00", end_time: "12:00" }),
    ]);
    expect(out.every((p) => p.column === 0 && p.totalColumns === 1)).toBe(true);
  });

  it("puts two overlapping events in different columns", () => {
    const l = layoutOf([
      event({ id: "a", start_time: "09:00", end_time: "11:00" }),
      event({ id: "b", start_time: "10:00", end_time: "12:00" }),
    ]);
    expect(l.get("a")!.column).not.toBe(l.get("b")!.column);
    expect(l.get("a")!.totalColumns).toBe(2);
    expect(l.get("b")!.totalColumns).toBe(2);
  });

  // The regression this function was rewritten for: the chained case, where
  // A/B overlap and B/C overlap but A and C do not. The old pass assigned B a
  // column against A, then overwrote it when pairing B with C — landing B back
  // on top of A.
  it("never puts two overlapping events in the same column in a chain", () => {
    const l = layoutOf([
      event({ id: "a", start_time: "09:00", end_time: "11:00" }),
      event({ id: "b", start_time: "10:00", end_time: "12:00" }),
      event({ id: "c", start_time: "11:30", end_time: "12:30" }),
    ]);
    expect(l.get("a")!.column).not.toBe(l.get("b")!.column);
    expect(l.get("b")!.column).not.toBe(l.get("c")!.column);
    // A and C don't overlap, so C is free to reuse A's column.
    expect(l.get("c")!.column).toBe(l.get("a")!.column);
    // One width for the whole chain, so the columns line up down the group.
    expect([...l.values()].every((p) => p.totalColumns === 2)).toBe(true);
  });

  it("reuses a column once it is free again", () => {
    const l = layoutOf([
      event({ id: "long", start_time: "09:00", end_time: "13:00" }),
      event({ id: "first", start_time: "09:00", end_time: "10:00" }),
      event({ id: "second", start_time: "10:00", end_time: "11:00" }),
    ]);
    // Two columns, not three: the short pair takes turns beside the long one.
    expect([...l.values()].every((p) => p.totalColumns === 2)).toBe(true);
    expect(l.get("first")!.column).toBe(l.get("second")!.column);
    expect(l.get("long")!.column).not.toBe(l.get("first")!.column);
  });

  it("starts a new group after a genuine gap", () => {
    const l = layoutOf([
      event({ id: "a", start_time: "09:00", end_time: "11:00" }),
      event({ id: "b", start_time: "10:00", end_time: "12:00" }),
      event({ id: "later", start_time: "15:00", end_time: "16:00" }),
    ]);
    expect(l.get("later")!.totalColumns).toBe(1);
    expect(l.get("later")!.column).toBe(0);
  });

  it("gives three genuinely concurrent events three columns", () => {
    const l = layoutOf([
      event({ id: "a", start_time: "09:00", end_time: "12:00" }),
      event({ id: "b", start_time: "09:30", end_time: "12:00" }),
      event({ id: "c", start_time: "10:00", end_time: "12:00" }),
    ]);
    expect(new Set([...l.values()].map((p) => p.column)).size).toBe(3);
    expect([...l.values()].every((p) => p.totalColumns === 3)).toBe(true);
  });

  it("returns every event it was given", () => {
    expect(detectOverlappingEvents([])).toEqual([]);
    expect(detectOverlappingEvents([event({ id: "solo" })])).toHaveLength(1);
  });
});

describe("shouldEventRecur", () => {
  it("shows a one-off only on its own date", () => {
    const e = event({ date: "2026-08-14" });
    expect(shouldEventRecur(e, new Date(2026, 7, 14))).toBe(true);
    expect(shouldEventRecur(e, new Date(2026, 7, 15))).toBe(false);
  });

  it("reads the stored date as a local day, not a UTC instant", () => {
    // `new Date("2026-08-14")` would be the 13th west of Greenwich.
    expect(shouldEventRecur(event({ date: "2026-08-14" }), new Date(2026, 7, 14))).toBe(true);
  });

  it("shows a daily recurrence on every day", () => {
    const e = event({ is_recurring: true, recurrence_days: null });
    expect(shouldEventRecur(e, new Date(2026, 7, 14))).toBe(true);
    expect(shouldEventRecur(e, new Date(2026, 7, 15))).toBe(true);
  });

  it("shows a weekday recurrence only on those weekdays", () => {
    // 2026-08-14 is a Friday (5); 2026-08-15 a Saturday (6).
    const e = event({ is_recurring: true, recurrence_days: [5] });
    expect(shouldEventRecur(e, new Date(2026, 7, 14))).toBe(true);
    expect(shouldEventRecur(e, new Date(2026, 7, 15))).toBe(false);
  });

  it("hides a one-off with no date rather than showing it every day", () => {
    expect(shouldEventRecur(event({ date: null as never }), new Date(2026, 7, 14))).toBe(false);
  });
});

describe("getEventsForDate", () => {
  it("keeps what belongs to the day and drops the rest", () => {
    const out = getEventsForDate(
      [
        event({ id: "today", date: "2026-08-14" }),
        event({ id: "tomorrow", date: "2026-08-15" }),
        event({ id: "fridays", is_recurring: true, recurrence_days: [5] }),
      ],
      new Date(2026, 7, 14),
    );
    expect(out.map((e) => e.id)).toEqual(["today", "fridays"]);
  });
});

describe("formatDateHeader", () => {
  it("spells the day out", () => {
    expect(formatDateHeader(new Date(2026, 7, 14))).toBe("Friday, August 14, 2026");
  });
});

describe("isToday", () => {
  const today = new Date(2026, 7, 14, 9, 0);

  it("is true anywhere inside the same calendar day", () => {
    expect(isToday(new Date(2026, 7, 14, 0, 1), today)).toBe(true);
    expect(isToday(new Date(2026, 7, 14, 23, 59), today)).toBe(true);
  });

  it("is false either side of it", () => {
    expect(isToday(new Date(2026, 7, 13, 23, 59), today)).toBe(false);
    expect(isToday(new Date(2026, 7, 15, 0, 1), today)).toBe(false);
  });

  it("does not confuse the same day of another month or year", () => {
    expect(isToday(new Date(2026, 8, 14), today)).toBe(false);
    expect(isToday(new Date(2025, 7, 14), today)).toBe(false);
  });

  it("falls back to the real clock when no day is given", () => {
    expect(isToday(new Date())).toBe(true);
  });
});
