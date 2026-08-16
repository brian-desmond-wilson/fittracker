import { normalizeSourceUrl } from "../captureUrl";

describe("normalizeSourceUrl", () => {
  it("strips Instagram's per-share tracking parameter", () => {
    expect(
      normalizeSourceUrl("https://www.instagram.com/reel/DWrabBkjhfI/?igsh=NTc4MTIwNjQ2YQ=="),
    ).toBe("https://instagram.com/reel/DWrabBkjhfI");
  });

  it("treats two shares of the same reel as the same capture", () => {
    const a = normalizeSourceUrl("https://www.instagram.com/reel/DWrabBkjhfI/?igsh=AAAA");
    const b = normalizeSourceUrl("https://instagram.com/reel/DWrabBkjhfI/?igsh=BBBB");
    expect(a).toBe(b);
  });

  it("strips the older igshid parameter too", () => {
    expect(normalizeSourceUrl("https://instagram.com/p/ABC123/?igshid=xyz")).toBe(
      "https://instagram.com/p/ABC123",
    );
  });

  it("strips TikTok's share parameters", () => {
    expect(
      normalizeSourceUrl(
        "https://www.tiktok.com/@coach/video/7172939297124027694?is_from_webapp=1&sender_device=pc&web_id=999&_r=1&_t=abc",
      ),
    ).toBe("https://tiktok.com/@coach/video/7172939297124027694");
  });

  it("strips utm and click-id parameters", () => {
    expect(
      normalizeSourceUrl("https://tiktok.com/@c/video/1?utm_source=ig&utm_medium=x&fbclid=q&gclid=z"),
    ).toBe("https://tiktok.com/@c/video/1");
  });

  it("keeps parameters that change which post is shown", () => {
    expect(normalizeSourceUrl("https://instagram.com/p/ABC/?img_index=2&igsh=zz")).toBe(
      "https://instagram.com/p/ABC?img_index=2",
    );
  });

  it("preserves case in the path — post shortcodes are case-sensitive", () => {
    expect(normalizeSourceUrl("https://INSTAGRAM.com/reel/DWrabBkjhfI/")).toBe(
      "https://instagram.com/reel/DWrabBkjhfI",
    );
  });

  it("drops the fragment", () => {
    expect(normalizeSourceUrl("https://tiktok.com/@c/video/1#comments")).toBe(
      "https://tiktok.com/@c/video/1",
    );
  });

  it("returns the trimmed input when it is not a parseable url", () => {
    expect(normalizeSourceUrl("  not a url  ")).toBe("not a url");
  });
});
