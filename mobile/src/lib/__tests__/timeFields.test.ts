import {
  dateFromHhmm,
  formatTimeLabel,
  hhmmAscending,
  hhmmFromDate,
} from "../timeFields";

describe("formatTimeLabel", () => {
  it("formats morning times", () => {
    expect(formatTimeLabel("08:05")).toBe("8:05 AM");
  });
  it("formats afternoon times", () => {
    expect(formatTimeLabel("13:30")).toBe("1:30 PM");
  });
  it("formats midnight and noon", () => {
    expect(formatTimeLabel("00:00")).toBe("12:00 AM");
    expect(formatTimeLabel("12:00")).toBe("12:00 PM");
  });
});

describe("hhmmFromDate / dateFromHhmm", () => {
  it("round-trips through a Date", () => {
    expect(hhmmFromDate(dateFromHhmm("07:45"))).toBe("07:45");
    expect(hhmmFromDate(dateFromHhmm("23:59"))).toBe("23:59");
  });
});

describe("hhmmAscending", () => {
  it("accepts strictly increasing times", () => {
    expect(hhmmAscending("08:00", "12:00", "18:00")).toBe(true);
  });
  it("rejects equal adjacent times", () => {
    expect(hhmmAscending("08:00", "08:00")).toBe(false);
  });
  it("rejects out-of-order times", () => {
    expect(hhmmAscending("12:00", "08:00")).toBe(false);
    expect(hhmmAscending("08:00", "18:00", "12:00")).toBe(false);
  });
  it("is true for zero or one argument", () => {
    expect(hhmmAscending()).toBe(true);
    expect(hhmmAscending("08:00")).toBe(true);
  });
});
