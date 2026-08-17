import { sessionBudget } from "../dailyBudget";

const plan = (minutes: number, rampWeek = 3, energy = 7) =>
  sessionBudget({ minutes, rampWeek, energy });

const slotsOf = (p: ReturnType<typeof sessionBudget>) =>
  Object.fromEntries(p.map((s) => [s.section, s.slots]));

describe("sessionBudget", () => {
  it("fills a 120-minute day with every section", () => {
    const s = slotsOf(plan(120));
    expect(s.warmup).toBeGreaterThanOrEqual(2);
    expect(s.main).toBeGreaterThanOrEqual(4);
    expect(s.accessory).toBeGreaterThanOrEqual(2);
    expect(s.bfr).toBeGreaterThanOrEqual(1);
    expect(s.cooldown).toBeGreaterThanOrEqual(1);
  });

  it("trims from the back as minutes shrink: cooldown and bfr go before main", () => {
    const s60 = slotsOf(plan(60));
    expect(s60.main).toBeGreaterThanOrEqual(3);
    expect(s60.bfr).toBe(0);
    const s30 = slotsOf(plan(30));
    expect(s30.main).toBeGreaterThanOrEqual(2);
    expect(s30.accessory).toBe(0);
    expect(s30.cooldown).toBe(0);
  });

  it("caps volume in ramp weeks 1 and 2 regardless of time", () => {
    const w1 = slotsOf(plan(120, 1));
    expect(w1.main).toBeLessThanOrEqual(3);
    expect(w1.accessory).toBeLessThanOrEqual(1);
    expect(w1.bfr).toBe(0);
    const w2 = slotsOf(plan(120, 2));
    expect(w2.main).toBeLessThanOrEqual(4);
    expect(w2.bfr).toBeLessThanOrEqual(1);
  });

  it("low energy trims sets, not sections", () => {
    const normal = plan(120, 3, 7).find((s) => s.section === "main")!;
    const tired = plan(120, 3, 3).find((s) => s.section === "main")!;
    expect(tired.slots).toBe(normal.slots);
    expect(tired.targetSets).toBe(normal.targetSets - 1);
  });

  it("sets are never below 2", () => {
    const tired = plan(120, 1, 1).find((s) => s.section === "main")!;
    expect(tired.targetSets).toBeGreaterThanOrEqual(2);
  });
});
