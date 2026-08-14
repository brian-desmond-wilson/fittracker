import {
  addDays,
  formatDayLabel,
  formatArrival,
  formatArrivalShort,
  formatRelativeDay,
  getLocalDateString,
  parseLocalDate,
} from "../dates";

describe("getLocalDateString", () => {
  it("reads the local calendar date, not the UTC one", () => {
    // Late evening on the 14th is still the 14th, even though this instant is
    // already the 15th in UTC for anywhere west of Greenwich.
    expect(getLocalDateString(new Date(2026, 7, 14, 23, 30))).toBe("2026-08-14");
    // And just after midnight is the new day, not the old one.
    expect(getLocalDateString(new Date(2026, 7, 15, 0, 5))).toBe("2026-08-15");
  });

  it("zero-pads, so the strings sort as dates", () => {
    expect(getLocalDateString(new Date(2026, 0, 5))).toBe("2026-01-05");
    const days = [new Date(2026, 8, 9), new Date(2026, 8, 10), new Date(2026, 9, 1)]
      .map((d) => getLocalDateString(d));
    expect([...days].sort()).toEqual(days);
  });
});

describe("parseLocalDate", () => {
  it("returns the same calendar day it was given", () => {
    const d = parseLocalDate("2026-08-14");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(14);
  });

  it("does not drift a day west of Greenwich, the way `new Date(str)` does", () => {
    expect(getLocalDateString(parseLocalDate("2026-08-14"))).toBe("2026-08-14");
  });

  it("round-trips every day of a month, including a DST changeover", () => {
    // US DST ends 2026-11-01. A midnight anchor can land either side of the
    // clock change; the noon anchor this uses cannot.
    for (let day = 1; day <= 30; day++) {
      const key = `2026-11-${String(day).padStart(2, "0")}`;
      expect(getLocalDateString(parseLocalDate(key))).toBe(key);
    }
  });

  it("round-trips across a spring-forward month too", () => {
    // US DST starts 2026-03-08.
    for (let day = 1; day <= 31; day++) {
      const key = `2026-03-${String(day).padStart(2, "0")}`;
      expect(getLocalDateString(parseLocalDate(key))).toBe(key);
    }
  });
});

describe("addDays", () => {
  it("moves forward and back", () => {
    expect(getLocalDateString(addDays(new Date(2026, 7, 14), 1))).toBe("2026-08-15");
    expect(getLocalDateString(addDays(new Date(2026, 7, 14), -1))).toBe("2026-08-13");
    expect(getLocalDateString(addDays(new Date(2026, 7, 14), 0))).toBe("2026-08-14");
  });

  it("rolls the month and the year", () => {
    expect(getLocalDateString(addDays(new Date(2026, 7, 31), 1))).toBe("2026-09-01");
    expect(getLocalDateString(addDays(new Date(2026, 11, 31), 1))).toBe("2027-01-01");
    expect(getLocalDateString(addDays(new Date(2026, 0, 1), -1))).toBe("2025-12-31");
  });

  it("counts calendar days across a clock change, not 24-hour blocks", () => {
    // US DST ends 2026-11-01: that day is 25 hours long.
    expect(getLocalDateString(addDays(new Date(2026, 9, 31, 12), 1))).toBe("2026-11-01");
    expect(getLocalDateString(addDays(new Date(2026, 10, 1, 12), 1))).toBe("2026-11-02");
  });

  it("leaves the date it was given alone", () => {
    const original = new Date(2026, 7, 14);
    addDays(original, 5);
    expect(getLocalDateString(original)).toBe("2026-08-14");
  });
});

describe("formatDayLabel", () => {
  it("writes a bare date as the day it names", () => {
    // The whole point: `new Date("2026-08-14")` is the 13th west of Greenwich.
    expect(formatDayLabel("2026-08-14")).toBe("Aug 14, 2026");
    expect(formatDayLabel("2026-01-01")).toBe("Jan 1, 2026");
  });

  it("writes a timestamp as its own local day", () => {
    expect(formatDayLabel(new Date(2026, 7, 14, 22, 0).toISOString())).toBe("Aug 14, 2026");
  });

  it("takes a different format when asked", () => {
    expect(formatDayLabel("2026-08-14", { month: "long", day: "numeric", year: "numeric" }))
      .toBe("August 14, 2026");
  });

  it("keeps the weekday when asked for one", () => {
    // What the class screens want: "Friday, Aug 14".
    expect(formatDayLabel("2026-08-14", { weekday: "long", month: "short", day: "numeric" }))
      .toBe("Friday, Aug 14");
  });

  it("has a dash for nothing, rather than 'Invalid Date'", () => {
    expect(formatDayLabel(null)).toBe("—");
    expect(formatDayLabel(undefined)).toBe("—");
    expect(formatDayLabel("")).toBe("—");
    expect(formatDayLabel("not a date")).toBe("—");
  });
});

describe("formatRelativeDay", () => {
  const today = new Date(2026, 7, 14, 9, 0);

  it("names the two days worth naming", () => {
    expect(formatRelativeDay("2026-08-14", today)).toBe("Today");
    expect(formatRelativeDay("2026-08-13", today)).toBe("Yesterday");
  });

  it("dates anything else", () => {
    expect(formatRelativeDay("2026-08-12", today)).toBe("Aug 12, 2026");
    expect(formatRelativeDay("2026-08-15", today)).toBe("Aug 15, 2026");
  });

  it("takes the day off the front of a timestamp", () => {
    expect(formatRelativeDay("2026-08-14T23:30:00Z", today)).toBe("Today");
  });

  it("anchors on the day it was given, not the real clock", () => {
    // The point of the parameter: a list can label every row against one
    // instant instead of drifting across local midnight mid-render.
    expect(formatRelativeDay("2026-01-01", new Date(2026, 0, 1))).toBe("Today");
    expect(formatRelativeDay("2025-12-31", new Date(2026, 0, 1))).toBe("Yesterday");
  });
});

// Fixed local instants, so nothing depends on when the suite runs.
const ARRIVAL_NOW = new Date(2026, 7, 14, 13, 0); // Fri Aug 14 2026, 1:00 PM local

describe("formatArrival", () => {
  it("names today by name, with the time", () => {
    expect(formatArrival(new Date(2026, 7, 14, 16, 30), ARRIVAL_NOW)).toBe("Today at 4:30 PM");
  });

  it("knows tomorrow — the commonest arrival there is", () => {
    expect(formatArrival(new Date(2026, 7, 15, 9, 0), ARRIVAL_NOW)).toBe("Tomorrow at 9:00 AM");
  });

  it("gives a weekday and a date for anything further out", () => {
    expect(formatArrival(new Date(2026, 7, 16, 9, 0), ARRIVAL_NOW)).toBe("Sun, Aug 16 at 9:00 AM");
  });

  it("does not call an arrival tomorrow just because it is later today", () => {
    // 11:59 PM today is still today, however close to midnight it sits.
    expect(formatArrival(new Date(2026, 7, 14, 23, 59), ARRIVAL_NOW)).toBe("Today at 11:59 PM");
  });

  it("labels a past instant the same way — it is a time, not a promise", () => {
    expect(formatArrival(new Date(2026, 7, 13, 8, 0), ARRIVAL_NOW)).toBe("Thu, Aug 13 at 8:00 AM");
  });

  it("takes an ISO string as readily as a Date", () => {
    const iso = new Date(2026, 7, 15, 9, 0).toISOString();
    expect(formatArrival(iso, ARRIVAL_NOW)).toBe("Tomorrow at 9:00 AM");
  });

  it("says nothing rather than NaN for an unparseable value", () => {
    expect(formatArrival("not a date", ARRIVAL_NOW)).toBe("—");
  });

  it("lowercases only today and tomorrow inside a sentence", () => {
    const mid = { midSentence: true };
    expect(formatArrival(new Date(2026, 7, 14, 16, 30), ARRIVAL_NOW, mid)).toBe("today at 4:30 PM");
    expect(formatArrival(new Date(2026, 7, 15, 9, 0), ARRIVAL_NOW, mid)).toBe("tomorrow at 9:00 AM");
  });

  it("leaves a weekday and month capitalised wherever they sit", () => {
    // The bug this closes: lowercasing the whole line to fix "Today" also
    // produced "sun, aug 16 at 7:00 pm".
    expect(formatArrival(new Date(2026, 7, 16, 19, 0), ARRIVAL_NOW, { midSentence: true }))
      .toBe("Sun, Aug 16 at 7:00 PM");
  });
});

describe("formatArrivalShort — the arrival, as a tile caption", () => {
  // Same anchor the formatArrival suite above uses: Fri 14 Aug 2026, 2:00 PM.
  const NOW = new Date(2026, 7, 14, 14, 0);

  it("gives a weekday and a time, and no comma or month", () => {
    // The hub tile has a caption's width, not a sentence's: "Sun, Aug 16 at
    // 7:00 PM" wraps, and the month is redundant a few days out.
    expect(formatArrivalShort(new Date(2026, 7, 16, 19, 0), NOW)).toBe("Sun 7:00 PM");
  });

  it("prefers today and tomorrow to their weekday names", () => {
    expect(formatArrivalShort(new Date(2026, 7, 14, 19, 0), NOW)).toBe("Today 7:00 PM");
    expect(formatArrivalShort(new Date(2026, 7, 15, 9, 0), NOW)).toBe("Tomorrow 9:00 AM");
  });

  it("adds the month once the weekday alone would be ambiguous", () => {
    // Eight days out, "Sat" is this Saturday to every reader, and it is not.
    expect(formatArrivalShort(new Date(2026, 7, 22, 10, 0), NOW)).toBe("Sat, Aug 22 10:00 AM");
  });

  it("takes an ISO string as readily as a Date", () => {
    const iso = new Date(2026, 7, 16, 19, 0).toISOString();
    expect(formatArrivalShort(iso, NOW)).toBe("Sun 7:00 PM");
  });

  it("says nothing rather than NaN for an unparseable value", () => {
    expect(formatArrivalShort("not a date", NOW)).toBe("—");
  });
});
