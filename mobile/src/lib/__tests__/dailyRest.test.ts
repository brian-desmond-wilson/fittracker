import {
  assumedInputs, decayedSoreness, medianMinutes, snapToMinutesOption,
  wasRestDay, ASSUMED_ENERGY, MINUTES_OPTIONS,
} from "../dailyRest";

describe("medianMinutes", () => {
  it("odd count takes the middle", () => {
    expect(medianMinutes([30, 60, 90])).toBe(60);
  });
  it("even count averages the middle pair", () => {
    expect(medianMinutes([45, 60, 90, 120])).toBe(75);
  });
  it("empty history falls back to 60", () => {
    expect(medianMinutes([])).toBe(60);
  });
});

describe("snapToMinutesOption", () => {
  it("snaps to the nearest offered session length", () => {
    expect(snapToMinutesOption(75)).toBe(90); // 75 is equidistant; ties go up
    expect(snapToMinutesOption(50)).toBe(45);
    expect(snapToMinutesOption(200)).toBe(180);
  });
  it("an exact option stands", () => {
    for (const m of MINUTES_OPTIONS) expect(snapToMinutesOption(m)).toBe(m);
  });
});

describe("decayedSoreness", () => {
  it("each region steps down one and 1s drop out", () => {
    expect(decayedSoreness({ Quads: 3, Chest: 2, Calves: 1 }))
      .toEqual({ Quads: 2, Chest: 1 });
  });
  it("empty stays empty", () => {
    expect(decayedSoreness({})).toEqual({});
  });
});

describe("assumedInputs", () => {
  it("assembles neutral energy, snapped median minutes, decayed soreness", () => {
    const out = assumedInputs({ soreness: { Quads: 2 } }, [60, 60, 90]);
    expect(out).toEqual({
      energy: ASSUMED_ENERGY,
      minutesAvailable: 60,
      soreness: { Quads: 1 },
    });
  });
  it("no prior check-in means no soreness and the fallback hour", () => {
    expect(assumedInputs(null, [])).toEqual({
      energy: ASSUMED_ENERGY, minutesAvailable: 60, soreness: {},
    });
  });
});

describe("wasRestDay", () => {
  it("a rested row is a rest day", () => {
    expect(wasRestDay([{ status: "rested", blocks: [] }])).toBe(true);
  });
  it("a completed recovery-shaped day (blocks, no main, no warmup) counts", () => {
    expect(wasRestDay([
      { status: "completed", blocks: [{ block: "mobility" }, { block: "cooldown" }] },
    ])).toBe(true);
  });
  it("a completed trained day does not", () => {
    expect(wasRestDay([
      { status: "completed", blocks: [{ block: "warmup" }, { block: "main" }] },
    ])).toBe(false);
  });
  it("no rows is not a rest day — it is an unknown day", () => {
    expect(wasRestDay([])).toBe(false);
  });
});
