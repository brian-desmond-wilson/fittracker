// Captured From, as the page and its full screen want it: post cards newest
// first, creators grouped and ordered by their latest post, and the header
// counts. Spec §4.8. Pure; the reader hands in CaptureSourceV2 rows.
import type { CapturePlatform, CaptureSourceV2 } from "../types/capture";
import { collapseByPost } from "./captureUrl";
import { normaliseHandle } from "./creatorHandle";
import { formatShortDate } from "./exerciseHistory";

export const EXERCISE_DEMO_LABEL = "Exercise demo";

const PLATFORM_LABELS: Record<CapturePlatform, string> = {
  instagram: "Instagram", tiktok: "TikTok", other: "Other",
};

export interface PostCard {
  sourceId: string;
  sourceUrl: string;
  platform: CapturePlatform;
  thumbnailUrl: string | null;
  /** The handle as captured, or the platform name when the post had none. */
  handle: string;
  handleIsPlaceholder: boolean;
  /** The raw handle for the creator filter; null when there is none. */
  posterHandle: string | null;
  avatarUrl: string | null;
  workout: { id: string; name: string } | null;
  /** The workout name, or "Exercise demo". */
  workoutLabel: string;
  capturedAt: string;
  /** "19 Aug", or "25 Dec 2025" outside the current year. */
  dateLabel: string;
  /** "Workout · captured 19 Aug" or "Captured 6 Sep". */
  subline: string;
}

const newestFirst = (a: { capturedAt: string }, b: { capturedAt: string }): number =>
  a.capturedAt < b.capturedAt ? 1 : a.capturedAt > b.capturedAt ? -1 : 0;

function toCard(s: CaptureSourceV2, today: string): PostCard {
  const date = formatShortDate(s.capturedAt.slice(0, 10), today);
  return {
    sourceId: s.sourceId,
    sourceUrl: s.sourceUrl,
    platform: s.platform,
    thumbnailUrl: s.thumbnailUrl,
    handle: s.posterHandle ?? PLATFORM_LABELS[s.platform],
    handleIsPlaceholder: s.posterHandle === null,
    posterHandle: s.posterHandle,
    avatarUrl: s.avatarUrl,
    workout: s.workout,
    workoutLabel: s.workout?.name ?? EXERCISE_DEMO_LABEL,
    capturedAt: s.capturedAt,
    dateLabel: date,
    subline: s.workout ? `Workout · captured ${date}` : `Captured ${date}`,
  };
}

/** Every post, newest capture first. Two rows for one post collapse to one. */
export function postCards(sources: CaptureSourceV2[], today: string): PostCard[] {
  return collapseByPost(sources).sort(newestFirst).map((s) => toCard(s, today));
}

/** The grouping key: the normalised handle, or the platform when there is none. */
const creatorKey = (s: { platform: CapturePlatform; posterHandle: string | null }): string =>
  (s.posterHandle !== null && normaliseHandle(s.posterHandle)) || `platform:${s.platform}`;

export interface CreatorGroup {
  key: string;
  handle: string;
  posterHandle: string | null;
  platform: CapturePlatform;
  avatarUrl: string | null;
  latestCapturedAt: string;
  posts: PostCard[];
  /** "4 posts" */
  countLabel: string;
}

/** Creators ordered by their most recent post; posts within newest first. */
export function creatorGroups(sources: CaptureSourceV2[], today: string): CreatorGroup[] {
  const groups = new Map<string, CreatorGroup>();
  for (const card of postCards(sources, today)) {
    const key = creatorKey(card);
    const held = groups.get(key);
    if (held) {
      held.posts.push(card);
      if (held.avatarUrl === null) held.avatarUrl = card.avatarUrl;
    } else {
      groups.set(key, {
        key, handle: card.handle, posterHandle: card.posterHandle, platform: card.platform,
        avatarUrl: card.avatarUrl, latestCapturedAt: card.capturedAt, posts: [card], countLabel: "",
      });
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, countLabel: `${g.posts.length} ${g.posts.length === 1 ? "post" : "posts"}` }))
    .sort((a, b) => newestFirst({ capturedAt: a.latestCapturedAt }, { capturedAt: b.latestCapturedAt }));
}

export interface SourceCounts {
  posts: number;
  creators: number;
}

export function sourceCounts(sources: CaptureSourceV2[]): SourceCounts {
  const posts = collapseByPost(sources);
  return { posts: posts.length, creators: new Set(posts.map(creatorKey)).size };
}

/** "6 posts · 3 creators" */
export function countLine(c: SourceCounts): string {
  return `${c.posts} ${c.posts === 1 ? "post" : "posts"} · ${c.creators} ${c.creators === 1 ? "creator" : "creators"}`;
}

/** The creator's public profile, for the external-link icon beside a handle
 *  (decision 6). Null when the platform has no profile page we know. */
export function creatorProfileUrl(platform: CapturePlatform, rawHandle: string): string | null {
  const handle = normaliseHandle(rawHandle);
  if (!handle) return null;
  if (platform === "instagram") return `https://www.instagram.com/${handle}/`;
  if (platform === "tiktok") return `https://www.tiktok.com/@${handle}`;
  return null;
}
