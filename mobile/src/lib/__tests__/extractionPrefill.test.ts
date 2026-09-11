import { extractionPrefillFor, prefillFromDraft, applyPrefillToForm, normaliseName } from "../extractionPrefill";
import type { ExtractionPrefill } from "../extractionPrefill";
import { EMPTY_WIZARD_FORM } from "../catalogWizardForm";

const raw = (exercises: unknown[]) => ({ post_type: "single_exercise", exercises, workout: null });
const swing = {
  name: "Kettlebell Swing",
  description: "Hinge at the hips and swing the bell to chest height.",
  category: "strength",
  skill_level: "Intermediate",
  primary_muscles: ["Glutes", "Hamstrings"],
  secondary_muscles: ["Lower Back"],
  equipment: ["Kettlebell"],
  library_match_id: null,
};

describe("normaliseName", () => {
  it("ignores case and spacing", () => {
    expect(normaliseName("  Kettlebell   SWING ")).toBe("kettlebell swing");
  });
});

describe("extractionPrefillFor", () => {
  it("returns the extraction's values for the reviewed name", () => {
    expect(extractionPrefillFor(raw([swing]), "Kettlebell Swing")).toEqual<ExtractionPrefill>({
      description: "Hinge at the hips and swing the bell to chest height.",
      primaryMuscles: ["Glutes", "Hamstrings"],
      secondaryMuscles: ["Lower Back"],
      equipment: ["Kettlebell"],
      skillLevel: "Intermediate",
    });
  });

  it("matches across case and spacing differences", () => {
    expect(extractionPrefillFor(raw([swing]), "kettlebell  swing")?.skillLevel).toBe("Intermediate");
    expect(extractionPrefillFor(raw([{ ...swing, name: "KETTLEBELL SWING " }]), "Kettlebell Swing")).not.toBeNull();
  });

  it("is null when the name is absent, or the extraction is not an extraction", () => {
    expect(extractionPrefillFor(raw([swing]), "Goblet Squat")).toBeNull();
    expect(extractionPrefillFor(null, "Kettlebell Swing")).toBeNull();
    expect(extractionPrefillFor("garbage", "Kettlebell Swing")).toBeNull();
    expect(extractionPrefillFor({ exercises: "nope" }, "Kettlebell Swing")).toBeNull();
  });

  it("case-folds the skill level to the canonical value", () => {
    expect(extractionPrefillFor(raw([{ ...swing, skill_level: "intermediate" }]), "Kettlebell Swing")?.skillLevel).toBe("Intermediate");
    expect(extractionPrefillFor(raw([{ ...swing, skill_level: " ADVANCED " }]), "Kettlebell Swing")?.skillLevel).toBe("Advanced");
  });

  it("tolerates missing or malformed fields", () => {
    expect(extractionPrefillFor(raw([{ name: "Kettlebell Swing" }]), "Kettlebell Swing")).toEqual<ExtractionPrefill>({
      description: null, primaryMuscles: [], secondaryMuscles: [], equipment: [], skillLevel: null,
    });
    expect(
      extractionPrefillFor(raw([{ ...swing, description: "   ", skill_level: "Elite", primary_muscles: [1, "Glutes"] }]), "Kettlebell Swing"),
    ).toEqual<ExtractionPrefill>({
      description: null, primaryMuscles: ["Glutes"], secondaryMuscles: ["Lower Back"], equipment: ["Kettlebell"], skillLevel: null,
    });
  });
});

describe("prefillFromDraft", () => {
  const draft = {
    name: "KB Swing (Russian)",
    description: "Hinge at the hips and swing the bell to chest height.",
    category: "strength",
    skillLevel: "Intermediate",
    primaryMuscles: ["Glutes", "Hamstrings"],
    secondaryMuscles: ["Lower Back"],
    equipment: ["Kettlebell"],
  };

  it("maps the review draft's exercise, whatever name the reviewer gave it", () => {
    expect(prefillFromDraft(draft)).toEqual<ExtractionPrefill>({
      description: "Hinge at the hips and swing the bell to chest height.",
      primaryMuscles: ["Glutes", "Hamstrings"],
      secondaryMuscles: ["Lower Back"],
      equipment: ["Kettlebell"],
      skillLevel: "Intermediate",
    });
  });

  it("tolerates missing or malformed fields and case-folds the skill level", () => {
    expect(prefillFromDraft({ name: "KB Swing" })).toEqual<ExtractionPrefill>({
      description: null, primaryMuscles: [], secondaryMuscles: [], equipment: [], skillLevel: null,
    });
    expect(prefillFromDraft({ ...draft, description: "  ", skillLevel: "advanced", primaryMuscles: [1, "Glutes"], equipment: "Kettlebell" }))
      .toEqual<ExtractionPrefill>({
        description: null, primaryMuscles: ["Glutes"], secondaryMuscles: ["Lower Back"], equipment: [], skillLevel: "Advanced",
      });
    expect(prefillFromDraft({ ...draft, skillLevel: "Elite" })?.skillLevel).toBeNull();
  });

  it("is null for null or garbage", () => {
    expect(prefillFromDraft(null)).toBeNull();
    expect(prefillFromDraft(undefined)).toBeNull();
    expect(prefillFromDraft("garbage")).toBeNull();
    expect(prefillFromDraft(42)).toBeNull();
    expect(prefillFromDraft([draft])).toBeNull();
  });
});

describe("applyPrefillToForm", () => {
  const dict = {
    muscleRegions: [{ id: "m-glutes", name: "Glutes" }, { id: "m-hams", name: "Hamstrings" }, { id: "m-back", name: "Lower Back" }],
    equipment: [{ id: "eq-kb", name: "Kettlebell" }, { id: "eq-db", name: "Dumbbell" }],
  };
  const prefill: ExtractionPrefill = {
    description: "Hinge at the hips and swing the bell to chest height.",
    primaryMuscles: ["glutes", "Hamstrings"], secondaryMuscles: ["Lower Back", "Unknown Muscle"],
    equipment: ["kettlebell", "Rope"], skillLevel: "Intermediate",
  };

  it("maps names to ids, case-insensitively, and drops names the dictionary lacks", () => {
    const form = applyPrefillToForm(EMPTY_WIZARD_FORM, prefill, dict);
    expect(form.description).toBe("Hinge at the hips and swing the bell to chest height.");
    expect(form.primary_muscle_region_ids).toEqual(["m-glutes", "m-hams"]);
    expect(form.muscle_region_ids).toEqual(["m-glutes", "m-hams", "m-back"]);
    expect(form.equipment_ids).toEqual(["eq-kb"]);
    expect(form.skill_level).toBe("Intermediate");
  });

  it("de-duplicates muscles across case variants", () => {
    const form = applyPrefillToForm(EMPTY_WIZARD_FORM, {
      ...prefill, primaryMuscles: ["Glutes"], secondaryMuscles: ["glutes", "Lower Back"],
    }, dict);
    expect(form.primary_muscle_region_ids).toEqual(["m-glutes"]);
    expect(form.muscle_region_ids).toEqual(["m-glutes", "m-back"]);
  });

  it("never overwrites a field the form already has", () => {
    const touched = { ...EMPTY_WIZARD_FORM, description: "Mine.", skill_level: "Advanced" as const, equipment_ids: ["eq-db"] };
    const form = applyPrefillToForm(touched, prefill, dict);
    expect(form.description).toBe("Mine.");
    expect(form.skill_level).toBe("Advanced");
    expect(form.equipment_ids).toEqual(["eq-db"]);
    expect(form.primary_muscle_region_ids).toEqual(["m-glutes", "m-hams"]);
  });
});
