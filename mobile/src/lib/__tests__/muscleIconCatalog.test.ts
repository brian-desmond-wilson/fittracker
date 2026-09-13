import * as fs from "fs";
import * as path from "path";
import { MUSCLE_ICON_SLUGS, muscleIconSlug } from "../muscleIconCatalog";
import { TRAINABLE_MUSCLES } from "../dailyCoverage";

describe("muscleIconCatalog", () => {
  it("every trainable muscle has an icon slug", () => {
    for (const m of TRAINABLE_MUSCLES) {
      expect(muscleIconSlug(m)).not.toBeNull();
    }
  });

  it("slugs are unique — two muscles never share a picture", () => {
    const slugs = Object.values(MUSCLE_ICON_SLUGS);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("slugs are file-safe kebab-case", () => {
    for (const s of Object.values(MUSCLE_ICON_SLUGS)) {
      expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("unknown or non-muscle names return null", () => {
    expect(muscleIconSlug("Full Body")).toBeNull();
    expect(muscleIconSlug("Back")).toBeNull();
    expect(muscleIconSlug("")).toBeNull();
    expect(muscleIconSlug("toString")).toBeNull();
    expect(muscleIconSlug("constructor")).toBeNull();
  });

  it("lookup is exact on muscle_regions.name (no case folding)", () => {
    expect(muscleIconSlug("chest")).toBeNull();
    expect(muscleIconSlug("Chest")).toBe("chest");
  });
});

describe("muscleIconCatalog ⇄ assets/muscles", () => {
  const dir = path.resolve(__dirname, "../../../assets/muscles");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".png")).map((f) => f.replace(/\.png$/, "")).sort();
  const slugs = [...Object.values(MUSCLE_ICON_SLUGS)].sort();

  it("every slug has a picture on disk, and every picture has a slug", () => {
    expect(files).toEqual(slugs);
  });
});
