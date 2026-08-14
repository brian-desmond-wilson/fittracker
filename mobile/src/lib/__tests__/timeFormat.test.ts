import {
  elapsedSecondsSince,
  formatClockTime,
  formatDuration,
  formatInstantTime,
} from "../timeFormat";

describe("formatClockTime", () => {
  it("formats morning and afternoon", () => {
    expect(formatClockTime("08:05")).toBe("8:05 AM");
    expect(formatClockTime("13:30")).toBe("1:30 PM");
  });

  it("formats the two times that trip 12-hour clocks", () => {
    expect(formatClockTime("00:00")).toBe("12:00 AM");
    expect(formatClockTime("12:00")).toBe("12:00 PM");
    expect(formatClockTime("00:30")).toBe("12:30 AM");
    expect(formatClockTime("12:30")).toBe("12:30 PM");
  });

  it("accepts the seconds Postgres time columns hand back", () => {
    expect(formatClockTime("14:30:00")).toBe("2:30 PM");
  });

  it("pads a single-digit minute rather than printing it bare", () => {
    expect(formatClockTime("09:5")).toBe("9:05 AM");
  });

  it("hands junk back untouched instead of rendering NaN", () => {
    expect(formatClockTime("")).toBe("");
    expect(formatClockTime("not a time")).toBe("not a time");
  });

  it("treats a missing minute as the hour exactly", () => {
    expect(formatClockTime("07")).toBe("7:00 AM");
  });
});

describe("formatInstantTime", () => {
  it("renders the local wall-clock time of an instant", () => {
    // Built from local parts, so the assertion holds in any timezone the
    // suite runs in.
    const d = new Date(2026, 7, 14, 14, 30);
    expect(formatInstantTime(d)).toBe("2:30 PM");
  });

  it("accepts a Date and its ISO string alike", () => {
    const d = new Date(2026, 7, 14, 8, 5);
    expect(formatInstantTime(d.toISOString())).toBe(formatInstantTime(d));
  });

  it("formats midnight as 12 AM", () => {
    expect(formatInstantTime(new Date(2026, 7, 14, 0, 0))).toBe("12:00 AM");
  });
});

describe("formatDuration", () => {
  it("reads as a stopwatch under an hour", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(303)).toBe("5:03");
    expect(formatDuration(3599)).toBe("59:59");
  });

  it("grows an hours field only once there are hours", () => {
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(3903)).toBe("1:05:03");
    expect(formatDuration(36000)).toBe("10:00:00");
  });

  it("clamps a negative countdown to zero", () => {
    expect(formatDuration(-5)).toBe("0:00");
  });

  it("floors fractional seconds", () => {
    expect(formatDuration(65.9)).toBe("1:05");
  });
});

describe("elapsedSecondsSince", () => {
  it("counts whole seconds from the start", () => {
    const now = Date.now();
    expect(elapsedSecondsSince(now)).toBe(0);
    expect(elapsedSecondsSince(now - 1000)).toBe(1);
    expect(elapsedSecondsSince(now - 65_000)).toBe(65);
  });

  it("floors a partial second rather than rounding up", () => {
    expect(elapsedSecondsSince(Date.now() - 1900)).toBe(1);
  });

  it("clamps a start in the future to zero", () => {
    // A device clock adjustment can put "now" behind a stored timestamp.
    expect(elapsedSecondsSince(Date.now() + 5000)).toBe(0);
  });
});
