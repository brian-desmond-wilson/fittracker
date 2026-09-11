// mobile/src/lib/__tests__/exerciseEnrichment.test.ts
import { provenanceAfterPatch, withoutProvenance } from "../exerciseEnrichment";
import type { ExerciseEnrichment } from "../exerciseEnrichment";

const AT = "2026-09-11T10:00:00.000Z";
const NOW = "2026-09-11T11:00:00.000Z";
const current = { description: "Model text.", video_url: null, image_url: "https://x/old.png" };
const prov: ExerciseEnrichment = {
  description: { by: "model", at: AT },
  image_url: { by: "model", at: AT },
};

describe("provenanceAfterPatch", () => {
  it("returns null when the patch touches none of the three fields", () => {
    expect(provenanceAfterPatch(prov, current, { skill_level: "Beginner" }, NOW)).toBeNull();
  });

  it("stamps by=user for a field changed to a non-empty value", () => {
    expect(provenanceAfterPatch(prov, current, { description: "My own words." }, NOW)).toEqual({
      description: { by: "user", at: NOW },
      image_url: { by: "model", at: AT },
    });
    expect(provenanceAfterPatch(prov, current, { video_url: "https://youtu.be/1" }, NOW)).toEqual({
      ...prov,
      video_url: { by: "user", at: NOW },
    });
  });

  it("leaves an unchanged echo alone — the wizard round-trips every field on save", () => {
    expect(provenanceAfterPatch(prov, current, { description: "Model text.", image_url: "https://x/old.png" }, NOW)).toBeNull();
  });

  it("clears the key when a field is blanked (blank means fill this again)", () => {
    expect(provenanceAfterPatch(prov, current, { description: null }, NOW)).toEqual({
      image_url: { by: "model", at: AT },
    });
    expect(provenanceAfterPatch(prov, current, { image_url: "" }, NOW)).toEqual({
      description: { by: "model", at: AT },
    });
  });

  it("blanking an already-empty field with no key is a no-op", () => {
    expect(provenanceAfterPatch(prov, current, { video_url: null }, NOW)).toBeNull();
  });
});

describe("withoutProvenance", () => {
  it("drops one key and keeps the rest", () => {
    expect(withoutProvenance(prov, "image_url")).toEqual({ description: { by: "model", at: AT } });
    expect(withoutProvenance({}, "image_url")).toEqual({});
  });
});
