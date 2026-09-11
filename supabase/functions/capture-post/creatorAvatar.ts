// Pure helpers behind creator avatars: how a handle is keyed, when a stored
// avatar is due a refresh, and where each platform's profile page hides the
// picture. No Deno globals, so `deno test` reaches every branch without a
// network. Fetching and rehosting stay in index.ts.

/** The key form of a handle: no @, lowercased, trimmed — and only if the
 *  result is a handle either platform would issue (letters, digits, dots,
 *  underscores, at most 30). Anything else is "", which every caller treats
 *  as nothing to do: no fetch, no row, no object in the bucket. */
export function normaliseHandle(raw: string): string {
  const h = raw.trim().replace(/^@+/, '').trim().toLowerCase();
  return /^[a-z0-9._]{1,30}$/.test(h) ? h : '';
}

export const AVATAR_MAX_AGE_DAYS = 30;
/** A row with no avatar is retried after a day, not a month: "we were
 *  walled off" must not read as "this profile is dead". */
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
 *  URL as given. Empty when the page has no og:image — or when the og:image
 *  is a static asset: the login wall Instagram serves instead of a profile
 *  answers 200 with its own logo under /rsrc.php/, and a logo is not a face. */
export function instagramAvatarCandidates(html: string): string[] {
  const url = ogImage(html);
  if (!url || isStaticAsset(url)) return [];
  const upgraded = url.replace(/_s100x100/, '_s150x150');
  return upgraded === url ? [url] : [upgraded, url];
}

function isStaticAsset(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().startsWith('static.') || u.pathname.includes('/rsrc.php/');
  } catch {
    return true;
  }
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

const AVATAR_HOSTS: Record<'instagram' | 'tiktok', string[]> = {
  instagram: ['cdninstagram.com', 'fbcdn.net'],
  tiktok: ['tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com'],
};

/** A caller-supplied avatar link may only point at the platform's own
 *  image CDN, over https. The function fetches whatever passes this, so
 *  the check is the whole difference between "rehost a profile picture"
 *  and "fetch any URL a signed-in user names". Exact domain or a true
 *  subdomain, never a bare suffix match. */
export function isAllowedAvatarHost(platform: 'instagram' | 'tiktok', url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    // Profile pictures live on scontent-*.cdninstagram.com and *.fbcdn.net;
    // static.cdninstagram.com serves Instagram's own chrome.
    if (host.startsWith('static.')) return false;
    return AVATAR_HOSTS[platform].some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
}
