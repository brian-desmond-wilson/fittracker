import {
  ageFromBirthdate,
  cmToFtIn,
  ftInToCm,
  intOrNull,
  kgToLbs,
  lbsToKg,
} from "../bodyUnits";

describe("cmToFtIn / ftInToCm", () => {
  it("converts 172.72 cm to 5 ft 8 in", () => {
    const { ft, inches } = cmToFtIn(172.72);
    expect(ft).toBe(5);
    expect(Math.round(inches)).toBe(8);
  });

  it("round-trips ft/in through cm", () => {
    expect(cmToFtIn(ftInToCm(6, 1)).ft).toBe(6);
    expect(Math.round(cmToFtIn(ftInToCm(6, 1)).inches)).toBe(1);
  });

  it("handles whole-foot heights without spilling into 12 inches", () => {
    const { ft, inches } = cmToFtIn(ftInToCm(6, 0));
    expect(ft).toBe(6);
    expect(Math.round(inches)).toBe(0);
  });
});

describe("kgToLbs / lbsToKg", () => {
  it("converts 79.4 kg to ~175 lbs", () => {
    expect(Math.round(kgToLbs(79.4))).toBe(175);
  });

  it("round-trips", () => {
    expect(kgToLbs(lbsToKg(175))).toBeCloseTo(175, 6);
  });
});

describe("intOrNull", () => {
  it("parses a plain integer string", () => {
    expect(intOrNull("160")).toBe(160);
  });
  it("returns null for empty and whitespace", () => {
    expect(intOrNull("")).toBeNull();
    expect(intOrNull("   ")).toBeNull();
  });
  it("returns null for zero, negatives, and garbage", () => {
    expect(intOrNull("0")).toBeNull();
    expect(intOrNull("-5")).toBeNull();
    expect(intOrNull("abc")).toBeNull();
  });
  it("truncates decimals (parseInt semantics, matching old GoalsScreen)", () => {
    expect(intOrNull("160.9")).toBe(160);
  });
});

describe("ageFromBirthdate", () => {
  it("computes age when birthday has passed this year", () => {
    expect(ageFromBirthdate("1990-01-15", new Date(2026, 7, 1))).toBe(36);
  });
  it("computes age when birthday has not yet arrived", () => {
    expect(ageFromBirthdate("1990-12-31", new Date(2026, 7, 1))).toBe(35);
  });
  it("handles the birthday itself", () => {
    expect(ageFromBirthdate("1990-08-01", new Date(2026, 7, 1))).toBe(36);
  });
  it("returns null for empty or malformed input", () => {
    expect(ageFromBirthdate("", new Date(2026, 7, 1))).toBeNull();
    expect(ageFromBirthdate("not-a-date", new Date(2026, 7, 1))).toBeNull();
  });
});
