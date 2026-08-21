import { applyRating, userSkillCeiling } from "../dailySkill";

describe("applyRating", () => {
  it("starts a fresh movement at beginner with an empty streak", () => {
    const s = applyRating(null, "right");
    expect(s).toEqual({
      currentLevel: "beginner", consecutiveTooEasy: 0,
      lastRating: "right", promoted: false,
    });
  });

  it("one too-easy builds the streak without promoting", () => {
    const s = applyRating(null, "too_easy");
    expect(s.consecutiveTooEasy).toBe(1);
    expect(s.currentLevel).toBe("beginner");
    expect(s.promoted).toBe(false);
  });

  it("two consecutive too-easy promote and reset the streak (spec §5.5)", () => {
    const s = applyRating(
      { currentLevel: "beginner", consecutiveTooEasy: 1 }, "too_easy",
    );
    expect(s.currentLevel).toBe("intermediate");
    expect(s.consecutiveTooEasy).toBe(0);
    expect(s.promoted).toBe(true);
  });

  it("a right rating breaks the streak", () => {
    const s = applyRating(
      { currentLevel: "beginner", consecutiveTooEasy: 1 }, "right",
    );
    expect(s.consecutiveTooEasy).toBe(0);
    expect(s.promoted).toBe(false);
  });

  it("too-hard demotes one level immediately and breaks the streak", () => {
    const s = applyRating(
      { currentLevel: "advanced", consecutiveTooEasy: 1 }, "too_hard",
    );
    expect(s.currentLevel).toBe("intermediate");
    expect(s.consecutiveTooEasy).toBe(0);
  });

  it("demotion floors at beginner", () => {
    const s = applyRating(
      { currentLevel: "beginner", consecutiveTooEasy: 0 }, "too_hard",
    );
    expect(s.currentLevel).toBe("beginner");
  });

  it("promotion at advanced keeps the level but still signals — the chain may offer a harder movement", () => {
    const s = applyRating(
      { currentLevel: "advanced", consecutiveTooEasy: 1 }, "too_easy",
    );
    expect(s.currentLevel).toBe("advanced");
    expect(s.promoted).toBe(true);
    expect(s.consecutiveTooEasy).toBe(0);
  });
});

describe("userSkillCeiling", () => {
  it("is Beginner with no earned states", () => {
    expect(userSkillCeiling([])).toBe("Beginner");
  });
  it("needs three movements at a level before the ceiling rises", () => {
    expect(userSkillCeiling(["intermediate", "intermediate"])).toBe("Beginner");
    expect(userSkillCeiling(["intermediate", "intermediate", "intermediate"])).toBe("Intermediate");
  });
  it("advanced states count toward the intermediate threshold too", () => {
    expect(userSkillCeiling(["advanced", "intermediate", "intermediate"])).toBe("Intermediate");
    expect(userSkillCeiling(["advanced", "advanced", "advanced"])).toBe("Advanced");
  });
});
