import {
  assumedInputs, coerceAssumedInputs, decayedSoreness, defaultAssumedInputs,
  medianMinutes, snapToMinutesOption,
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

describe("defaultAssumedInputs", () => {
  it("is the documented fallback: mid energy, two hours, no soreness", () => {
    expect(defaultAssumedInputs()).toEqual({
      energy: ASSUMED_ENERGY,
      minutesAvailable: 120,
      soreness: {},
    });
  });
});

describe("coerceAssumedInputs", () => {
  const valid = { energy: 7, minutesAvailable: 90, soreness: { Quads: 2 } };

  it("passes a well-formed object through", () => {
    expect(coerceAssumedInputs(valid)).toEqual(valid);
  });

  it("absent reads as null so callers keep no-draft semantics", () => {
    expect(coerceAssumedInputs(null)).toBeNull();
    expect(coerceAssumedInputs(undefined)).toBeNull();
  });

  it("the prose-string bug falls back to the default instead of undefined energy", () => {
    const out = coerceAssumedInputs("usual gym Trans Bay, ~2h, rested");
    expect(out).toEqual(defaultAssumedInputs());
    expect(typeof out?.energy).toBe("number");
  });

  it("other non-objects fall back to the default", () => {
    expect(coerceAssumedInputs(42)).toEqual(defaultAssumedInputs());
    expect(coerceAssumedInputs(["energy"])).toEqual(defaultAssumedInputs());
  });

  it("missing or mistyped fields fall back to the default", () => {
    expect(coerceAssumedInputs({})).toEqual(defaultAssumedInputs());
    expect(coerceAssumedInputs({ energy: "7", minutesAvailable: 90, soreness: {} }))
      .toEqual(defaultAssumedInputs());
    expect(coerceAssumedInputs({ energy: 7, minutesAvailable: 90 }))
      .toEqual(defaultAssumedInputs());
    expect(coerceAssumedInputs({ energy: 7, minutesAvailable: 90, soreness: "quads" }))
      .toEqual(defaultAssumedInputs());
    expect(coerceAssumedInputs({ energy: 7, minutesAvailable: 90, soreness: null }))
      .toEqual(defaultAssumedInputs());
  });

  it("extra fields are ignored, not rejected", () => {
    expect(coerceAssumedInputs({ ...valid, mode: "daily-prescription" })).toEqual(valid);
  });
});
