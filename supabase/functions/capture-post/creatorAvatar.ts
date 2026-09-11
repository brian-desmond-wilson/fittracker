// Pure helpers behind creator avatars: how a handle is keyed, when a stored
// avatar is due a refresh, and where each platform's profile page hides the
// picture. No Deno globals, so `deno test` reaches every branch without a
// network. Fetching and rehosting stay in index.ts.

/** The key form of a handle: no @, lowercased, trimmed. Display keeps the @. */
export function normaliseHandle(raw: string): string {
  return raw.trim().replace(/^@+/, '').trim().toLowerCase();
}

export const AVATAR_MAX_AGE_DAYS = 30;

/** Null (never fetched) is stale; otherwise stale past 30 days. */
export function isAvatarStale(fetchedAt: string | null, now: Date = new Date()): boolean {
  if (!fetchedAt) return true;
  const then = Date.parse(fetchedAt);
  if (!Number.isFinite(then)) return true;
  return now.getTime() - then > AVATAR_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

/** The handful of entities OG tag content actually contains. Same as
 *  index.ts's decodeEntities, copied so this module stays import-free. */
const decodeEntities = (s: string): string =>
  s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

function ogImage(html: string): string | null {
  const a = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i);
  const b = html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+property=["']og:image["']/i);
  const raw = a?.[1] ?? b?.[1] ?? null;
  return raw ? decodeEntities(raw) : null;
}

/** Instagram's profile page carries the avatar as og:image at 100px. Try the
 *  150px variant first (the CDN's signed hash may reject the edit), then the
 *  URL as given. Empty when the page has no og:image. */
export function instagramAvatarCandidates(html: string): string[] {
  const url = ogImage(html);
  if (!url) return [];
  const upgraded = url.replace(/_s100x100/, '_s150x150');
  return upgraded === url ? [url] : [upgraded, url];
}

/** TikTok's profile page has no og:image; the avatar sits in an embedded JSON
 *  blob as "avatarLarger" with /-escaped slashes. */
export function parseTikTokAvatar(html: string): string | null {
  const m = html.match(/"avatarLarger":"((?:[^"\\]|\\.)*)"/);
  if (!m) return null;
  try {
    const url = JSON.parse(`"${m[1]}"`) as string;
    return /^https?:\/\//.test(url) ? url : null;
  } catch {
    return null;
  }
}
