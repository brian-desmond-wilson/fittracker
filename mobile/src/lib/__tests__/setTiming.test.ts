import {
  formatSetDuration,
  formatSetTimeChip,
  resolveSetTimes,
  shiftSpanStart,
  splitDuration,
} from "../setTiming";

const AT = (h: number, m: number) => Date.UTC(2026, 7, 17, h, m, 0);
const clock = (ms: number) => {
  const d = new Date(ms);
  return `${d.getUTCHours()}:${d.getUTCMinutes().toString().padStart(2, "0")}`;
};

describe("resolveSetTimes", () => {
  it("resolves nothing for an empty session", () => {
    expect(resolveSetTimes(AT(7, 15), [])).toEqual([]);
  });

  it("lays the first duration down at the anchor", () => {
    const [set] = resolveSetTimes(AT(7, 15), [{ kind: "duration", seconds: 240 }]);
    expect(set.startMs).toBe(AT(7, 15));
    expect(set.endMs).toBe(AT(7, 19));
    expect(set.durationSeconds).toBe(240);
  });

  // The point of durations-only entry: type ten numbers, get ten real times.
  it("chains each duration onto the end of the one before", () => {
    const resolved = resolveSetTimes(AT(7, 15), [
      { kind: "duration", seconds: 240 },
      { kind: "duration", seconds: 120 },
      { kind: "duration", seconds: 60 },
    ]);
    expect(resolved.map((r) => r.startMs)).toEqual([AT(7, 15), AT(7, 19), AT(7, 21)]);
    expect(resolved.map((r) => r.endMs)).toEqual([AT(7, 19), AT(7, 21), AT(7, 22)]);
  });

  it("takes a span as given and derives its duration", () => {
    const [set] = resolveSetTimes(AT(7, 0), [
      { kind: "span", startMs: AT(8, 0), endMs: AT(8, 5) },
    ]);
    expect(set.startMs).toBe(AT(8, 0));
    expect(set.endMs).toBe(AT(8, 5));
    expect(set.durationSeconds).toBe(300);
  });

  it("re-anchors everything after a span", () => {
    const resolved = resolveSetTimes(AT(7, 15), [
      { kind: "duration", seconds: 60 },
      { kind: "span", startMs: AT(9, 0), endMs: AT(9, 10) },
      { kind: "duration", seconds: 120 },
    ]);
    expect(resolved[2].startMs).toBe(AT(9, 10));
    expect(resolved[2].endMs).toBe(AT(9, 12));
  });

  // One blank set in the middle must not shift every later set into fiction.
  it("leaves a blank set unresolved and does not move the cursor", () => {
    const resolved = resolveSetTimes(AT(7, 15), [
      { kind: "duration", seconds: 60 },
      { kind: "none" },
      { kind: "duration", seconds: 60 },
    ]);
    expect(resolved[1]).toEqual({ startMs: null, endMs: null, durationSeconds: null });
    expect(resolved[2].startMs).toBe(AT(7, 16));
  });

  it("clamps a backwards span to zero without reordering it", () => {
    const [set] = resolveSetTimes(AT(7, 0), [
      { kind: "span", startMs: AT(8, 10), endMs: AT(8, 0) },
    ]);
    expect(set.durationSeconds).toBe(0);
    expect(set.startMs).toBe(AT(8, 10));
    expect(set.endMs).toBe(AT(8, 0));
    // The cursor must not travel backwards behind an earlier set's end.
    expect(set.endMs! < set.startMs!).toBe(true);
  });

  it("treats a negative duration as zero", () => {
    const [set] = resolveSetTimes(AT(7, 0), [{ kind: "duration", seconds: -30 }]);
    expect(set.durationSeconds).toBe(0);
    expect(set.endMs).toBe(AT(7, 0));
  });
});

describe("formatSetDuration", () => {
  it("dashes when there is nothing", () => {
    expect(formatSetDuration(null)).toBe("--");
  });
  it("reads as minutes and seconds", () => {
    expect(formatSetDuration(0)).toBe("0:00");
    expect(formatSetDuration(9)).toBe("0:09");
    expect(formatSetDuration(252)).toBe("4:12");
  });
  it("grows an hours field when it needs one", () => {
    expect(formatSetDuration(3661)).toBe("1:01:01");
  });
});

describe("formatSetTimeChip", () => {
  it("invites you to fill it in when empty", () => {
    expect(
      formatSetTimeChip({ startMs: null, endMs: null, durationSeconds: null }, clock),
    ).toBe("Set time");
  });
  it("shows the span when both ends are known", () => {
    expect(
      formatSetTimeChip(
        { startMs: AT(7, 15), endMs: AT(7, 19), durationSeconds: 240 },
        clock,
      ),
    ).toBe("7:15 – 7:19");
  });
  it("falls back to the duration alone", () => {
    expect(
      formatSetTimeChip({ startMs: null, endMs: null, durationSeconds: 252 }, clock),
    ).toBe("4:12");
  });
});

describe("splitDuration", () => {
  it("splits into the sheet's two fields", () => {
    expect(splitDuration(252)).toEqual({ mins: 4, secs: 12 });
    expect(splitDuration(60)).toEqual({ mins: 1, secs: 0 });
    expect(splitDuration(null)).toEqual({ mins: 0, secs: 0 });
  });
});

describe("shiftSpanStart", () => {
  it("carries the end along and holds the duration", () => {
    const moved = shiftSpanStart(AT(9, 18), AT(9, 22), AT(9, 50));
    expect(moved.startMs).toBe(AT(9, 50));
    expect(moved.endMs).toBe(AT(9, 54));
  });

  it("keeps a zero-length span at zero", () => {
    const moved = shiftSpanStart(AT(9, 18), AT(9, 18), AT(9, 50));
    expect(moved.startMs).toBe(AT(9, 50));
    expect(moved.endMs).toBe(AT(9, 50));
  });

  // The state the screenshot was in: finish behind start. Moving the start
  // should resolve that rather than preserve a negative gap.
  it("collapses an inverted span instead of preserving it", () => {
    const moved = shiftSpanStart(AT(9, 50), AT(9, 18), AT(10, 0));
    expect(moved.startMs).toBe(AT(10, 0));
    expect(moved.endMs).toBe(AT(10, 0));
  });

  it("moves backwards as readily as forwards", () => {
    const moved = shiftSpanStart(AT(9, 50), AT(9, 55), AT(7, 15));
    expect(moved.startMs).toBe(AT(7, 15));
    expect(moved.endMs).toBe(AT(7, 20));
  });
});
