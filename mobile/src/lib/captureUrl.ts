// Canonical form of a shared post link.
//
// Instagram mints a fresh `igsh` every time you hit Share, and TikTok appends
// its own share telemetry — so the same post arrives as a different string
// each time. Since "already captured?" is answered by comparing this string
// (and the DB's unique index enforces it), the raw link would let one post be
// captured over and over. Normalizing here makes re-shares collapse onto one
// capture. It matters more in Phase 3, where every share carries a fresh tag.
//
// Identity is the POST, not the view of it. One Instagram post is served under
// several path shapes (/p/, /reel/, /reels/, /tv/, and profile-scoped
// /<user>/reel/), and a carousel adds img_index to say which slide you were
// looking at when you hit Share. None of that changes the post or its caption,
// and the caption is the only thing extraction reads — so sharing slide 2 of a
// carousel you already captured from slide 1 used to arrive as a second
// workout under a second AI-written name. Shortcode case is still preserved:
// that genuinely does select the post.

/** Per-share telemetry: identifies the sharer/session, never the post. */
const TRACKING_PARAMS = new Set([
  // Instagram
  "igsh", "igshid", "img_index_do_not_use",
  // TikTok
  "is_from_webapp", "sender_device", "sender_web_id", "web_id",
  "_r", "_t", "_d", "u_code", "share_app_id", "share_item_id",
  "share_link_id", "timestamp", "tt_from", "source", "refer",
  "share_iid", "social_sharing", "enter_method",
  // Generic
  "fbclid", "gclid", "mc_cid", "mc_eid", "si", "ref", "ref_src",
]);

/**
 * Which slide of a carousel was on screen when the link was shared. It is real
 * information — just not information about WHICH post, which is all identity
 * cares about. Dropping it costs only that a tap-back opens the carousel at
 * its first slide instead of the shared one.
 */
const VIEW_PARAMS = new Set(["img_index", "img_index_do_not_use"]);

const isTracking = (key: string): boolean =>
  TRACKING_PARAMS.has(key) || VIEW_PARAMS.has(key) || key.startsWith("utm_");

/**
 * Instagram's several doors onto one post. The shortcode is the identity, so
 * every shape collapses to /p/<shortcode> — including the profile-scoped form
 * a reel gets when shared from someone's grid.
 */
const IG_POST_PATH = /^(?:\/[^/]+)?\/(?:p|reel|reels|tv)\/([^/]+)/;

/** Canonical path for a post on `host`, or null to keep the path as-is. */
function canonicalPath(host: string, path: string): string | null {
  if (host !== "instagram.com") return null;
  const match = IG_POST_PATH.exec(path);
  return match ? `/p/${match[1]}` : null;
}

/** Stable identity for a post link. Falls back to the trimmed input when the
 *  string isn't a URL at all — the caller's own validation reports that. */
export function normalizeSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return trimmed;
  }

  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (!isTracking(key.toLowerCase())) kept.append(key, value);
  }

  // Trailing slashes are cosmetic on both platforms; dropping one more way for
  // the same post to look like two.
  const trimmedPath = url.pathname.replace(/\/+$/, "");
  const path = canonicalPath(host, trimmedPath) ?? trimmedPath;
  const query = kept.toString();

  return `${url.protocol}//${host}${path}${query ? `?${query}` : ""}`;
}

/**
 * One entry per post, newest capture first.
 *
 * A post captured twice before the identity rule tightened leaves two source
 * rows, and provenance built from them lists the same post twice — the same
 * handle, the same link, side by side. Collapsing on canonical identity keeps
 * the earliest capture of each post, since that is when it actually entered the
 * library, and hands back the canonical link so the survivor points at the post
 * rather than at whichever carousel slide happened to be shared.
 *
 * Structural on purpose: anything carrying a link and a capture time can use
 * it, without this module learning the capture types.
 */
export function collapseByPost<T extends { sourceUrl: string; capturedAt: string }>(
  sources: T[],
): T[] {
  const earliestByPost = new Map<string, T>();
  for (const source of sources) {
    const key = normalizeSourceUrl(source.sourceUrl);
    const held = earliestByPost.get(key);
    if (!held || source.capturedAt < held.capturedAt) {
      earliestByPost.set(key, { ...source, sourceUrl: key });
    }
  }
  return [...earliestByPost.values()]
    .sort((a, b) => (a.capturedAt < b.capturedAt ? 1 : -1));
}
