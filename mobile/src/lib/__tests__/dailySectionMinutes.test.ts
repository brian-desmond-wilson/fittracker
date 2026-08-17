import {
  estimateSectionMinutes,
  setSeconds,
  totalSectionMinutes,
  validateSectionMinutes,
} from "../dailySectionMinutes";
import type { SessionItem, SessionSection } from "../../types/daily";

const item = (
  section: SessionSection,
  over: Partial<SessionItem> = {},
): SessionItem => ({
  exerciseId: `${section}-${over.itemOrder ?? 0}`,
  section,
  itemOrder: 0,
  targetSets: 3,
  targetReps: "8-12",
  restSeconds: 120,
  reason: null,
  ...over,
});

describe("setSeconds", () => {
  it("costs a rep range at its top end", () => {
    expect(setSeconds("8-12")).toBe(48); // 12 reps × 4s
  });

  it("doubles a per-side prescription", () => {
    expect(setSeconds("10/side")).toBe(80);
  });

  it("reads a prescription in seconds as a hold, not a rep count", () => {
    expect(setSeconds("30-60s")).toBe(60);
  });

  it("falls back to ten reps when the prescription says nothing usable", () => {
    expect(setSeconds(null)).toBe(40);
    expect(setSeconds("as many as you like")).toBe(40);
  });
});

describe("estimateSectionMinutes", () => {
  it("times each section from its own items", () => {
    const minutes = estimateSectionMinutes([
      item("warmup", { targetSets: 1, targetReps: "10/side", restSeconds: null }),
      item("main"),
      item("main", { itemOrder: 1 }),
    ]);
    // warmup: 80s work + 60s transition = 140s
    expect(minutes.warmup).toBe(2);
    // main, twice: 3×48s work + 2×120s rest + 60s transition = 444s each
    expect(minutes.main).toBe(15);
    expect(minutes.accessory).toBeUndefined();
  });

  it("gives no entry to a section with no work in it", () => {
    expect(estimateSectionMinutes([])).toEqual({});
  });

  it("shortens the day when a low-energy check-in trims a set", () => {
    const three = estimateSectionMinutes([item("main", { targetSets: 3 })]);
    const two = estimateSectionMinutes([item("main", { targetSets: 2 })]);
    expect(two.main!).toBeLessThan(three.main!);
  });

  it("never reports a section as taking under a minute", () => {
    const minutes = estimateSectionMinutes([
      item("cooldown", { targetSets: 1, targetReps: "1", restSeconds: null }),
    ]);
    expect(minutes.cooldown).toBe(1);
  });
});

describe("totalSectionMinutes", () => {
  it("adds up every section it was given", () => {
    expect(totalSectionMinutes({ warmup: 10, main: 45, cooldown: 5 })).toBe(60);
    expect(totalSectionMinutes({})).toBe(0);
  });
});

describe("validateSectionMinutes", () => {
  const items = [item("warmup"), item("main"), item("cooldown")];
  const good = [
    { section: "warmup", minutes: 10 },
    { section: "main", minutes: 45 },
    { section: "cooldown", minutes: 5 },
  ];

  it("keeps a well-formed answer covering every section with work", () => {
    expect(validateSectionMinutes(good, items, 90)).toEqual({
      warmup: 10, main: 45, cooldown: 5,
    });
  });

  it("rounds fractional minutes", () => {
    const answer = validateSectionMinutes(
      [{ section: "warmup", minutes: 9.6 }], [item("warmup")], 60,
    );
    expect(answer).toEqual({ warmup: 10 });
  });

  it("rejects an answer that skips a section it filled", () => {
    expect(validateSectionMinutes(good.slice(0, 2), items, 90)).toBeNull();
  });

  it("drops a timing for a section it never filled", () => {
    const answer = validateSectionMinutes(
      [...good, { section: "bfr", minutes: 12 }], items, 90,
    );
    expect(answer).toEqual({ warmup: 10, main: 45, cooldown: 5 });
  });

  it("rejects a total that overruns the day beyond tolerance", () => {
    expect(validateSectionMinutes(good, items, 40)).toBeNull();
  });

  it("allows a small overrun of the available minutes", () => {
    // 60 minutes of plan against a 50-minute day is judgment, not nonsense.
    expect(validateSectionMinutes(good, items, 50)).not.toBeNull();
  });

  it("rejects minutes that are not usable numbers", () => {
    const cases: unknown[] = [
      [{ section: "warmup", minutes: "ten" }],
      [{ section: "warmup", minutes: 0 }],
      [{ section: "warmup", minutes: -5 }],
      [{ section: "warmup", minutes: 400 }],
      [{ section: "warmup", minutes: Number.NaN }],
      [{ section: "warmup" }],
      ["warmup: 10"],
      [null],
    ];
    for (const raw of cases) {
      expect(validateSectionMinutes(raw, [item("warmup")], 90)).toBeNull();
    }
  });

  it("rejects anything that is not a list of timings", () => {
    expect(validateSectionMinutes(undefined, items, 90)).toBeNull();
    expect(validateSectionMinutes({ warmup: 10 }, items, 90)).toBeNull();
    expect(validateSectionMinutes("10 minutes", items, 90)).toBeNull();
  });

  it("rejects any answer when the session has no items to time", () => {
    expect(validateSectionMinutes(good, [], 90)).toBeNull();
  });
});
