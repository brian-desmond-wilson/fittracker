import {
  STALE_AFTER_DAYS,
  filterNeverDone,
  formatLastCompleted,
  isStale,
  sortByStaleness,
} from "../workoutCompletion";
import type { CompletionMap, WorkoutCompletion } from "../workoutCompletion";

const done = (lastCompleted: string, count = 1): WorkoutCompletion => ({
  count,
  lastCompleted,
});

// A Wednesday, so the weekday branch has somewhere unambiguous to land.
const TODAY = "2026-08-19";

describe("formatLastCompleted", () => {
  it("says Today for the same day", () => {
    expect(formatLastCompleted(done("2026-08-19"), TODAY)).toBe("Today");
  });

  it("says Yesterday for the day before", () => {
    expect(formatLastCompleted(done("2026-08-18"), TODAY)).toBe("Yesterday");
  });

  it("names the weekday inside the last week", () => {
    // Two days back is a Monday; six days back is the previous Thursday.
    expect(formatLastCompleted(done("2026-08-17"), TODAY)).toBe("Monday");
    expect(formatLastCompleted(done("2026-08-13"), TODAY)).toBe("Thursday");
  });

  it("switches to a date at exactly a week, where a weekday stops being unambiguous", () => {
    expect(formatLastCompleted(done("2026-08-12"), TODAY)).toBe("8/12");
  });

  it("omits the year within the current year", () => {
    expect(formatLastCompleted(done("2026-04-15"), TODAY)).toBe("4/15");
  });

  it("adds a two-digit year once the year changes the meaning", () => {
    expect(formatLastCompleted(done("2025-04-15"), TODAY)).toBe("4/15/25");
  });

  it("reads a future date as Today rather than inventing a tense", () => {
    expect(formatLastCompleted(done("2026-08-20"), TODAY)).toBe("Today");
  });

  it("returns null for an unparseable date so the line can be dropped", () => {
    expect(formatLastCompleted(done(""), TODAY)).toBeNull();
    expect(formatLastCompleted(done("not-a-date"), TODAY)).toBeNull();
  });
});

describe("isStale", () => {
  it("is fresh up to and including the threshold", () => {
    expect(isStale(done("2026-08-19"), TODAY)).toBe(false);
    expect(isStale(done("2026-07-20"), TODAY)).toBe(false); // exactly 30 days
  });

  it("goes stale the day after the threshold", () => {
    expect(isStale(done("2026-07-19"), TODAY)).toBe(true); // 31 days
  });

  it("treats an unreadable date as not stale rather than guessing", () => {
    expect(isStale(done("garbage"), TODAY)).toBe(false);
  });

  it("uses a threshold of a month", () => {
    expect(STALE_AFTER_DAYS).toBe(30);
  });
});

interface Row {
  id: string;
}
const idOf = (r: Row) => r.id;
const rows: Row[] = [
  { id: "fresh" },
  { id: "never-a" },
  { id: "ancient" },
  { id: "never-b" },
  { id: "middling" },
];
const completions: CompletionMap = {
  fresh: done("2026-08-18", 7),
  ancient: done("2025-04-15", 1),
  middling: done("2026-07-01", 3),
};

describe("sortByStaleness", () => {
  it("leads with what has never been done, then the longest neglected", () => {
    expect(sortByStaleness(rows, idOf, completions, TODAY).map(idOf)).toEqual([
      "never-a",
      "never-b",
      "ancient",
      "middling",
      "fresh",
    ]);
  });

  it("keeps the incoming order among workouts that have never been done", () => {
    const reversed = [{ id: "never-b" }, { id: "never-a" }];
    expect(sortByStaleness(reversed, idOf, completions, TODAY).map(idOf)).toEqual([
      "never-b",
      "never-a",
    ]);
  });

  it("does not promote a malformed date to the top of the screen", () => {
    const broken: CompletionMap = { ...completions, ancient: done("nonsense") };
    const order = sortByStaleness(rows, idOf, broken, TODAY).map(idOf);
    expect(order.slice(0, 2)).toEqual(["never-a", "never-b"]);
    expect(order.indexOf("ancient")).toBeGreaterThan(order.indexOf("middling"));
  });

  it("leaves the caller's array alone", () => {
    const original = [...rows];
    sortByStaleness(rows, idOf, completions, TODAY);
    expect(rows).toEqual(original);
  });
});

describe("filterNeverDone", () => {
  it("keeps only the workouts with no history at all", () => {
    expect(filterNeverDone(rows, idOf, completions).map(idOf)).toEqual([
      "never-a",
      "never-b",
    ]);
  });

  it("returns everything when nothing has been completed", () => {
    expect(filterNeverDone(rows, idOf, {})).toHaveLength(rows.length);
  });
});
