// Canonical form of a shared post link.
//
// Instagram mints a fresh `igsh` every time you hit Share, and TikTok appends
// its own share telemetry — so the same post arrives as a different string
// each time. Since "already captured?" is answered by comparing this string
// (and the DB's unique index enforces it), the raw link would let one post be
// captured over and over. Normalizing here makes re-shares collapse onto one
// capture. It matters more in Phase 3, where every share carries a fresh tag.
//
// What is NOT touched: the path. Post shortcodes are case-sensitive, and
// parameters that select WHICH post is shown (a carousel's img_index) are
// meaning, not tracking.

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

const isTracking = (key: string): boolean =>
  TRACKING_PARAMS.has(key) || key.startsWith("utm_");

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
  const path = url.pathname.replace(/\/+$/, "");
  const query = kept.toString();

  return `${url.protocol}//${host}${path}${query ? `?${query}` : ""}`;
}
