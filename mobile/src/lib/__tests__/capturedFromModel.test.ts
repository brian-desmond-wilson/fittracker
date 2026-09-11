import {
  postCards, creatorGroups, sourceCounts, countLine, creatorProfileUrl, EXERCISE_DEMO_LABEL,
} from "../capturedFromModel";
import type { CaptureSourceV2 } from "../../types/capture";

const today = "2026-09-11";
// Local-constructed instants, so the calendar-day labels hold in whatever
// timezone Jest runs (a bare "T10:00:00Z" rolls to the next day at UTC+14).
const at = (y: number, m: number, d: number, h = 10, min = 0): string =>
  new Date(y, m - 1, d, h, min).toISOString();
const src = (o: Partial<CaptureSourceV2> & { sourceId: string; capturedAt: string }): CaptureSourceV2 => ({
  platform: "instagram", sourceUrl: `https://www.instagram.com/p/${o.sourceId}/`,
  posterHandle: "@coach", thumbnailUrl: null, avatarUrl: null, workout: null, ...o,
});

const six: CaptureSourceV2[] = [
  src({ sourceId: "a", capturedAt: at(2026, 8, 19), posterHandle: "@coach", workout: { id: "w1", name: "Leg Day Burner" } }),
  src({ sourceId: "b", capturedAt: at(2026, 9, 6), posterHandle: "@coach" }),
  src({ sourceId: "c", capturedAt: at(2026, 7, 1), posterHandle: "@kb_guy", workout: { id: "w2", name: "KB Flow" } }),
  src({ sourceId: "d", capturedAt: at(2026, 9, 1), posterHandle: "@kb_guy" }),
  src({ sourceId: "e", capturedAt: at(2026, 8, 30), posterHandle: "@Coach" }),
  src({ sourceId: "f", capturedAt: at(2025, 12, 25), posterHandle: null, platform: "tiktok" }),
];

describe("postCards", () => {
  it("newest capture first", () => {
    expect(postCards(six, today).map((c) => c.sourceId)).toEqual(["b", "d", "e", "a", "c", "f"]);
  });

  it("workout name, or the Exercise demo fallback, and the dated sub-line", () => {
    const cards = postCards(six, today);
    const a = cards.find((c) => c.sourceId === "a")!;
    const b = cards.find((c) => c.sourceId === "b")!;
    expect(a.workoutLabel).toBe("Leg Day Burner");
    expect(a.subline).toBe("Workout · captured 19 Aug");
    expect(b.workoutLabel).toBe(EXERCISE_DEMO_LABEL);
    expect(b.subline).toBe("Captured 6 Sep");
    expect(b.dateLabel).toBe("6 Sep");
    expect(cards.find((c) => c.sourceId === "f")!.subline).toBe("Captured 25 Dec 2025");
  });

  it("dates a late-evening capture on its local day, not the UTC one", () => {
    const late = [src({ sourceId: "late", capturedAt: at(2026, 9, 5, 23, 30) })];
    const card = postCards(late, today)[0];
    expect(card.dateLabel).toBe("5 Sep");
    expect(card.subline).toBe("Captured 5 Sep");
    expect(card.capturedAt).toBe(at(2026, 9, 5, 23, 30));
  });

  it("a missing handle shows the platform", () => {
    const f = postCards(six, today).find((c) => c.sourceId === "f")!;
    expect(f.handle).toBe("TikTok");
    expect(f.handleIsPlaceholder).toBe(true);
  });

  it("collapses a post captured twice", () => {
    const twice = [
      src({ sourceId: "x1", capturedAt: "2026-09-01T10:00:00Z", sourceUrl: "https://www.instagram.com/p/SAME/" }),
      src({ sourceId: "x2", capturedAt: "2026-09-03T10:00:00Z", sourceUrl: "https://instagram.com/p/SAME" }),
    ];
    expect(postCards(twice, today)).toHaveLength(1);
  });
});

describe("creatorGroups", () => {
  it("groups case-insensitively, orders creators by latest post, posts newest first", () => {
    const groups = creatorGroups(six, today);
    expect(groups.map((g) => g.handle)).toEqual(["@coach", "@kb_guy", "TikTok"]);
    expect(groups[0].posts.map((p) => p.sourceId)).toEqual(["b", "e", "a"]);
    expect(groups[0].countLabel).toBe("3 posts");
    expect(groups[2].countLabel).toBe("1 post");
  });
});

describe("counts", () => {
  it("posts and distinct creators", () => {
    expect(sourceCounts(six)).toEqual({ posts: 6, creators: 3 });
    expect(countLine({ posts: 6, creators: 3 })).toBe("6 posts · 3 creators");
    expect(countLine({ posts: 1, creators: 1 })).toBe("1 post · 1 creator");
  });
});

describe("creatorProfileUrl", () => {
  it("per platform, without the @", () => {
    expect(creatorProfileUrl("instagram", "@coach")).toBe("https://www.instagram.com/coach/");
    expect(creatorProfileUrl("tiktok", "kb_guy")).toBe("https://www.tiktok.com/@kb_guy");
    expect(creatorProfileUrl("other", "@x")).toBeNull();
    expect(creatorProfileUrl("instagram", "not a handle")).toBeNull();
  });
});
