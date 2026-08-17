import { collapseByPost, normalizeSourceUrl } from "../captureUrl";

describe("normalizeSourceUrl", () => {
  it("strips Instagram's per-share tracking parameter", () => {
    expect(
      normalizeSourceUrl("https://www.instagram.com/reel/DWrabBkjhfI/?igsh=NTc4MTIwNjQ2YQ=="),
    ).toBe("https://instagram.com/p/DWrabBkjhfI");
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

  it("preserves case in the path — post shortcodes are case-sensitive", () => {
    expect(normalizeSourceUrl("https://INSTAGRAM.com/reel/DWrabBkjhfI/")).toBe(
      "https://instagram.com/p/DWrabBkjhfI",
    );
  });

  // The bug this pair exists for: one carousel post captured twice, once from
  // each slide, arriving as two workouts under two AI-written names.
  it("treats two slides of one carousel as the same post", () => {
    const first = normalizeSourceUrl("https://instagram.com/p/C6JUm5JhrX2?img_index=1");
    const second = normalizeSourceUrl("https://instagram.com/p/C6JUm5JhrX2?img_index=2");
    expect(first).toBe(second);
    expect(first).toBe("https://instagram.com/p/C6JUm5JhrX2");
  });

  it("treats the reel and post doors onto one Instagram post as the same", () => {
    const shapes = [
      "https://instagram.com/p/C6JUm5JhrX2",
      "https://instagram.com/reel/C6JUm5JhrX2/",
      "https://www.instagram.com/reels/C6JUm5JhrX2?igsh=z",
      "https://instagram.com/tv/C6JUm5JhrX2",
      "https://instagram.com/senada.greca/reel/C6JUm5JhrX2/",
    ].map(normalizeSourceUrl);
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).toBe("https://instagram.com/p/C6JUm5JhrX2");
  });

  it("leaves an Instagram link that is not a post alone", () => {
    expect(normalizeSourceUrl("https://instagram.com/senada.greca/")).toBe(
      "https://instagram.com/senada.greca",
    );
  });

  it("leaves other platforms' paths untouched", () => {
    expect(normalizeSourceUrl("https://tiktok.com/@coach/video/7172939297124027694")).toBe(
      "https://tiktok.com/@coach/video/7172939297124027694",
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

describe("collapseByPost", () => {
  const src = (sourceUrl: string, capturedAt: string, sourceId = sourceUrl) => ({
    sourceId, sourceUrl, capturedAt,
  });

  it("keeps one entry per post, and the earliest capture of it", () => {
    const collapsed = collapseByPost([
      src("https://instagram.com/p/C6JUm5JhrX2?img_index=2", "2026-08-17T16:03:00Z", "later"),
      src("https://instagram.com/p/C6JUm5JhrX2", "2026-08-17T07:32:00Z", "earlier"),
    ]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].sourceId).toBe("earlier");
  });

  it("hands back the canonical link, not the slide that was shared", () => {
    const collapsed = collapseByPost([
      src("https://www.instagram.com/reel/ABC/?igsh=zz&img_index=3", "2026-08-01T00:00:00Z"),
    ]);
    expect(collapsed[0].sourceUrl).toBe("https://instagram.com/p/ABC");
  });

  it("leaves genuinely different posts alone, newest first", () => {
    const collapsed = collapseByPost([
      src("https://instagram.com/p/AAA", "2026-08-01T00:00:00Z"),
      src("https://instagram.com/p/BBB", "2026-08-09T00:00:00Z"),
      src("https://tiktok.com/@c/video/1", "2026-08-05T00:00:00Z"),
    ]);
    expect(collapsed.map((s) => s.sourceUrl)).toEqual([
      "https://instagram.com/p/BBB",
      "https://tiktok.com/@c/video/1",
      "https://instagram.com/p/AAA",
    ]);
  });

  it("does not mutate what it was given", () => {
    const original = src("https://instagram.com/reel/ABC/", "2026-08-01T00:00:00Z");
    collapseByPost([original]);
    expect(original.sourceUrl).toBe("https://instagram.com/reel/ABC/");
  });

  it("handles an empty list", () => {
    expect(collapseByPost([])).toEqual([]);
  });
});
