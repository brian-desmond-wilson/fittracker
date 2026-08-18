import { validateWorkoutTags } from "../workoutTagValidate";

const allowed = new Set(["Chest", "Shoulders", "Quads", "Core"]);

const good = {
  block_roles: ["main", "conditioning"],
  primary_muscles: ["Chest", "Shoulders"],
  secondary_muscles: ["Core"],
  est_minutes: 35,
  intensity: "high",
  skill_level: "Intermediate",
};

describe("validateWorkoutTags", () => {
  it("accepts a good answer", () => {
    const tags = validateWorkoutTags(good, allowed)!;
    expect(tags.blockRoles).toEqual(["main", "conditioning"]);
    expect(tags.muscles).toEqual([
      { name: "Chest", isPrimary: true },
      { name: "Shoulders", isPrimary: true },
      { name: "Core", isPrimary: false },
    ]);
    expect(tags.estMinutes).toBe(35);
    expect(tags.intensity).toBe("high");
    expect(tags.skillLevel).toBe("Intermediate");
  });

  it("drops unknown roles and muscles rather than failing", () => {
    const tags = validateWorkoutTags({
      ...good,
      block_roles: ["main", "cardio"],
      primary_muscles: ["Chest", "Traps"],
    }, allowed)!;
    expect(tags.blockRoles).toEqual(["main"]);
    expect(tags.muscles.map((m) => m.name)).toEqual(["Chest", "Core"]);
  });

  it("no valid roles = unusable", () => {
    expect(validateWorkoutTags({ ...good, block_roles: ["hiit"] }, allowed)).toBeNull();
  });

  it("no primary muscle = unusable — it would be immune to the soreness gate", () => {
    expect(validateWorkoutTags({ ...good, primary_muscles: [] }, allowed)).toBeNull();
    expect(validateWorkoutTags({ ...good, primary_muscles: ["Traps"] }, allowed)).toBeNull();
  });

  it("nonsense minutes become null, not a rejection", () => {
    expect(validateWorkoutTags({ ...good, est_minutes: 600 }, allowed)!.estMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, est_minutes: "x" }, allowed)!.estMinutes).toBeNull();
  });

  it("bad enum values become null", () => {
    const tags = validateWorkoutTags({ ...good, intensity: "brutal", skill_level: "Pro" }, allowed)!;
    expect(tags.intensity).toBeNull();
    expect(tags.skillLevel).toBeNull();
  });

  it("garbage is null", () => {
    expect(validateWorkoutTags(null, allowed)).toBeNull();
    expect(validateWorkoutTags("x", allowed)).toBeNull();
    expect(validateWorkoutTags(undefined, allowed)).toBeNull();
    expect(validateWorkoutTags(7, allowed)).toBeNull();
    expect(validateWorkoutTags([], allowed)).toBeNull();
  });

  it("a muscle in both lists stays primary", () => {
    const tags = validateWorkoutTags({
      ...good, primary_muscles: ["Chest"], secondary_muscles: ["Chest"],
    }, allowed)!;
    expect(tags.muscles).toEqual([{ name: "Chest", isPrimary: true }]);
  });

  // ---- Added beyond the plan's list ----

  it("a muscle repeated within one list is stored once", () => {
    const tags = validateWorkoutTags({
      ...good,
      primary_muscles: ["Chest", "Chest", "Quads"],
      secondary_muscles: ["Core", "Core"],
    }, allowed)!;
    expect(tags.muscles).toEqual([
      { name: "Chest", isPrimary: true },
      { name: "Quads", isPrimary: true },
      { name: "Core", isPrimary: false },
    ]);
  });

  it("a repeated role is stored once", () => {
    const tags = validateWorkoutTags({
      ...good, block_roles: ["main", "main", "cooldown", "main"],
    }, allowed)!;
    expect(tags.blockRoles).toEqual(["main", "cooldown"]);
  });

  it("minutes outside the column's own range degrade to null", () => {
    expect(validateWorkoutTags({ ...good, est_minutes: 0 }, allowed)!.estMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, est_minutes: -5 }, allowed)!.estMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, est_minutes: 241 }, allowed)!.estMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, est_minutes: NaN }, allowed)!.estMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, est_minutes: Infinity }, allowed)!.estMinutes).toBeNull();
    expect(validateWorkoutTags({ ...good, est_minutes: 240 }, allowed)!.estMinutes).toBe(240);
    expect(validateWorkoutTags({ ...good, est_minutes: 1 }, allowed)!.estMinutes).toBe(1);
  });

  it("a fractional estimate lands on a whole minute, since the column is an integer", () => {
    expect(validateWorkoutTags({ ...good, est_minutes: 35.7 }, allowed)!.estMinutes).toBe(36);
  });

  it("missing fields degrade rather than reject", () => {
    const tags = validateWorkoutTags(
      { block_roles: ["cooldown"], primary_muscles: ["Quads"] },
      allowed,
    )!;
    expect(tags.blockRoles).toEqual(["cooldown"]);
    expect(tags.muscles).toEqual([{ name: "Quads", isPrimary: true }]);
    expect(tags.estMinutes).toBeNull();
    expect(tags.intensity).toBeNull();
    expect(tags.skillLevel).toBeNull();
  });

  it("non-array and non-string members are ignored", () => {
    expect(validateWorkoutTags({ ...good, block_roles: "main" }, allowed)).toBeNull();
    expect(validateWorkoutTags({ ...good, primary_muscles: "Chest" }, allowed)).toBeNull();
    const tags = validateWorkoutTags({
      ...good, primary_muscles: ["Chest", null, 7, { name: "Quads" }], secondary_muscles: null,
    }, allowed)!;
    expect(tags.muscles).toEqual([{ name: "Chest", isPrimary: true }]);
  });

  it("leaves classifiedAt unstamped — the saver decides when a tag counts", () => {
    expect(validateWorkoutTags(good, allowed)!.classifiedAt).toBeNull();
  });

  it("an empty vocabulary makes every answer unusable", () => {
    expect(validateWorkoutTags(good, new Set())).toBeNull();
  });
});
