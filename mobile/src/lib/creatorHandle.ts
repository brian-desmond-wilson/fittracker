// The client half of creator identity. Mirrors the edge function's
// creatorAvatar.ts (the two do not share a module graph): the same
// normalisation keys the same row, the same staleness rule decides when
// the picker asks for a refresh, and the same Instagram parser runs on the
// phone, because Instagram serves the profile page to a phone and not to
// the server.

/** The key form of a handle: no @, lowercased, trimmed — and only if the
 *  result is a handle either platform would issue. Anything else is "",
 *  which every caller treats as nothing to do. */
export function normaliseHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, "").trim().toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : "";
}

export const AVATAR_MAX_AGE_DAYS = 30;
/** A row with no avatar is retried after a day, not a month. */
export const AVATAR_RETRY_HOURS = 24;

/** Null (never fetched) is stale; with an avatar, stale past 30 days;
 *  without one, stale past 24 hours. */
export function isAvatarStale(fetchedAt: string | null, hasAvatar: boolean, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return true;
  const maxMs = hasAvatar
    ? AVATAR_MAX_AGE_DAYS * 24 * 60 * 60 * 1000
    : AVATAR_RETRY_HOURS * 60 * 60 * 1000;
  return now.getTime() - then > maxMs;
}

/** The fallback glyph: first character of the bare handle. */
export function avatarLetter(handle: string): string {
  const ch = handle.trim().replace(/^@+/, "").charAt(0);
  return ch ? ch.toUpperCase() : "?";
}

/** The URL to render. The stored path is fixed (a refresh overwrites the
 *  file in place), so the fetch time rides along as a query to defeat the
 *  image cache after a refresh. */
export function avatarUri(url: string | null, fetchedAt: string | null): string | null {
  if (!url) return null;
  const t = fetchedAt ? Date.parse(fetchedAt) : NaN;
  return Number.isFinite(t) ? `${url}?v=${t}` : url;
}

const decodeEntities = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function ogImage(html: string): string | null {
  const a = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
  const b = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const raw = a?.[1] ?? b?.[1] ?? null;
  return raw ? decodeEntities(raw) : null;
}

/** Instagram's profile page carries the avatar as og:image at 100px. The
 *  150px variant first (the CDN's signed hash may reject the edit), then
 *  the URL as given. Empty when the page has no og:image. */
export function instagramAvatarCandidates(html: string): string[] {
  const url = ogImage(html);
  if (!url) return [];
  const upgraded = url.replace(/_s100x100/, "_s150x150");
  return upgraded === url ? [url] : [upgraded, url];
}
