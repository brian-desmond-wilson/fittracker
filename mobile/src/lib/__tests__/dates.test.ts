import {
  addDays,
  formatDayLabel,
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
