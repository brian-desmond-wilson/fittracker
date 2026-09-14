import { profileUrl } from "../creatorHandle";

describe("profileUrl (spec §5.4)", () => {
  it("instagram, with and without the @", () => {
    expect(profileUrl("instagram", "@kingdomkettlebells")).toBe("https://www.instagram.com/kingdomkettlebells/");
    expect(profileUrl("instagram", "KingdomKettlebells")).toBe("https://www.instagram.com/kingdomkettlebells/");
  });
  it("tiktok", () => {
    expect(profileUrl("tiktok", "@melt.programming")).toBe("https://www.tiktok.com/@melt.programming");
  });
  it("null for another platform, an empty handle, or junk", () => {
    expect(profileUrl("other", "someone")).toBeNull();
    expect(profileUrl("instagram", null)).toBeNull();
    expect(profileUrl("instagram", "")).toBeNull();
    expect(profileUrl("instagram", "not a handle!")).toBeNull();
  });
});
