import {
  normaliseHandle, isAvatarStale, avatarLetter, avatarUri, instagramAvatarCandidates,
} from "../creatorHandle";

describe("normaliseHandle", () => {
  it("strips @, lowercases, trims", () => {
    expect(normaliseHandle("@OnlineWOD ")).toBe("onlinewod");
    expect(normaliseHandle("fit___dad")).toBe("fit___dad");
    expect(normaliseHandle("@")).toBe("");
  });
  it("rejects anything that is not a platform handle", () => {
    expect(normaliseHandle("Sam Jones")).toBe("");
    expect(normaliseHandle("a/b")).toBe("");
    expect(normaliseHandle("x".repeat(31))).toBe("");
    expect(normaliseHandle("senada.greca")).toBe("senada.greca");
  });
});

describe("isAvatarStale", () => {
  const now = new Date("2026-09-10T12:00:00Z");
  it("null is stale", () => expect(isAvatarStale(null, true, now)).toBe(true));
  it("with an avatar: 29 days fresh, 31 days stale", () => {
    expect(isAvatarStale("2026-08-12T12:00:00Z", true, now)).toBe(false);
    expect(isAvatarStale("2026-08-10T12:00:00Z", true, now)).toBe(true);
  });
  it("without one: 23 hours fresh, 25 hours stale", () => {
    expect(isAvatarStale("2026-09-09T13:00:00Z", false, now)).toBe(false);
    expect(isAvatarStale("2026-09-09T11:00:00Z", false, now)).toBe(true);
  });
});

describe("avatarLetter", () => {
  it("is the first letter of the bare handle, uppercased", () => {
    expect(avatarLetter("@onlinewod")).toBe("O");
    expect(avatarLetter("_dylanshannon")).toBe("_");
    expect(avatarLetter("")).toBe("?");
  });
});

describe("avatarUri", () => {
  it("is null without a url", () => expect(avatarUri(null, "2026-09-10T00:00:00Z")).toBeNull());
  it("busts the cache with the fetch time", () => {
    expect(avatarUri("https://x/a.jpg", "2026-09-10T00:00:00.000Z"))
      .toBe("https://x/a.jpg?v=1788998400000");
  });
  it("still works with no fetch time", () => expect(avatarUri("https://x/a.jpg", null)).toBe("https://x/a.jpg"));
});

describe("instagramAvatarCandidates", () => {
  it("upgrades og:image to 150 first, then the URL as given", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s100x100_tt6&amp;_nc_cat=107&amp;oh=00_AQJK&amp;oe=6AA95BEF" />
    </head></html>`;
    expect(instagramAvatarCandidates(html)).toEqual([
      "https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s150x150_tt6&_nc_cat=107&oh=00_AQJK&oe=6AA95BEF",
      "https://scontent.cdninstagram.com/v/t51.2885-19/9008.jpg?stp=dst-jpg_s100x100_tt6&_nc_cat=107&oh=00_AQJK&oe=6AA95BEF",
    ]);
  });
  it("gives the one URL without a size token, and nothing without og:image", () => {
    expect(instagramAvatarCandidates(`<meta property="og:image" content="https://x.test/a.jpg" />`)).toEqual(["https://x.test/a.jpg"]);
    expect(instagramAvatarCandidates("<html></html>")).toEqual([]);
  });
});
