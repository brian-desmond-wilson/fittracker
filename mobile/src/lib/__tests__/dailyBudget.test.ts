import { sessionBudget } from "../dailyBudget";
import { planMinutes } from "../dailySectionMinutes";

/** Matches dailyBudget's own "this is rounding, not a gap" threshold. */
const MIN_LEFTOVER = 5;

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

// The re-entry ceilings hold down hard sets, not time in the building. A long
// day the caps refuse to fill goes to mobility and to longer rests instead of
// simply going unused.
describe("sessionBudget spends what a cap left over", () => {
  const of = (p: ReturnType<typeof sessionBudget>, section: string) =>
    p.find((s) => s.section === section)!;

  it("buys mobility and rest, never more loaded work", () => {
    const capped = plan(120, 1);
    expect(of(capped, "main").slots).toBeLessThanOrEqual(3);
    expect(of(capped, "accessory").slots).toBeLessThanOrEqual(1);
    expect(of(capped, "bfr").slots).toBe(0);
    // ...and the time goes somewhere.
    expect(of(capped, "warmup").slots).toBeGreaterThan(4);
    expect(of(capped, "cooldown").slots).toBeGreaterThan(2);
    expect(of(capped, "main").restSeconds!).toBeGreaterThan(120);
  });

  it("gives a capped day more mobility than an uncapped one of the same length", () => {
    expect(of(plan(120, 1), "warmup").slots)
      .toBeGreaterThan(of(plan(120, 3), "warmup").slots);
  });

  it("respects the mobility ceilings", () => {
    const p = plan(240, 1);
    expect(of(p, "warmup").slots).toBeLessThanOrEqual(12);
    expect(of(p, "cooldown").slots).toBeLessThanOrEqual(8);
  });

  it("respects the rest ceilings", () => {
    const p = plan(240, 1);
    expect(of(p, "main").restSeconds!).toBeLessThanOrEqual(300);
    expect(of(p, "accessory").restSeconds!).toBeLessThanOrEqual(210);
  });

  it("plans the time it was given, priced as the screen prices it", () => {
    for (const [minutes, ramp] of [[120, 3], [90, 3], [60, 1], [45, 1], [30, 1]]) {
      const total = plan(minutes, ramp).reduce((s, p) => s + planMinutes(p), 0);
      expect(total).toBeLessThanOrEqual(minutes);
      expect(total).toBeGreaterThan(minutes - MIN_LEFTOVER);
    }
  });

  it("falls short only when every unloaded ceiling is already spent", () => {
    // Re-entry week 1 allows three main lifts and one accessory. Two hours
    // cannot be filled honestly on top of that, even with the warm-up,
    // cooldown and rests all stretched to their limits — so it comes up short
    // rather than inventing volume.
    const p = plan(120, 1);
    const total = p.reduce((s, x) => s + planMinutes(x), 0);
    expect(total).toBeLessThan(120);
    expect(total).toBeGreaterThan(80);
    expect(of(p, "warmup").slots).toBe(12);
    expect(of(p, "cooldown").slots).toBe(8);
    expect(of(p, "main").restSeconds).toBe(300);
  });

  it("leaves a section the clock closed closed", () => {
    const short = plan(30, 1);
    expect(of(short, "cooldown").slots).toBe(0);
    expect(of(short, "accessory").slots).toBe(0);
    expect(of(short, "bfr").slots).toBe(0);
  });

  it("never stretches rest where the section prescribes none", () => {
    const p = plan(120, 1);
    expect(of(p, "warmup").restSeconds).toBeNull();
    expect(of(p, "cooldown").restSeconds).toBeNull();
  });
});
