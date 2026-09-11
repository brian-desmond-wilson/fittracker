// The phone's half of the avatar fetch. Instagram serves its profile page
// to a phone on a home or mobile network and refuses the server's
// datacentre address, so the app reads the page, picks out the picture
// links, and hands them to the server to download and keep. TikTok needs
// none of this: the server reads that page itself. Spec §5.4.
import { instagramAvatarCandidates, normaliseHandle } from "./creatorHandle";
import { refreshCreator } from "./supabase/creators";
import type { CreatorAvatar, CreatorPlatform } from "./supabase/creators";

/** A profile page is decoration; nothing waits six seconds for it. */
const PAGE_TIMEOUT_MS = 6000;

/** True when a fetch ended on the creator's own page. An empty url (a
 *  runtime that does not report the final url) is trusted; the parser's
 *  static-asset check still stands behind it. */
function onProfilePath(finalUrl: string, handle: string): boolean {
  if (!finalUrl) return true;
  try {
    return new URL(finalUrl).pathname.toLowerCase().startsWith(`/${handle}`);
  } catch {
    return false;
  }
}

async function instagramCandidatesFromPhone(handle: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.instagram.com/${handle}/`, { signal: controller.signal });
    if (!res.ok) return [];
    // A wall sends the phone to /accounts/login/ with a 200; only the
    // profile path is worth parsing.
    if (!onProfilePath(res.url, handle)) return [];
    return instagramAvatarCandidates(await res.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/** Refresh one creator's avatar, doing the Instagram page read here. Still
 *  calls the server when the page gave nothing, so the row is stamped and
 *  the one-day retry clock starts. Never throws. */
export async function refreshCreatorFromPhone(
  platform: CreatorPlatform, rawHandle: string,
): Promise<CreatorAvatar | null> {
  const handle = normaliseHandle(rawHandle);
  if (!handle) return null;
  const candidates = platform === "instagram" ? await instagramCandidatesFromPhone(handle) : [];
  return refreshCreator(platform, handle, candidates);
}

/** A small pool: the first open after a long idle can find thirty stale
 *  creators, and thirty Instagram page reads at once from one home address
 *  is how a whole library gets rate-limited into "no avatar" for a day.
 *  Results keep the input order; a null means that one could not be
 *  refreshed. */
export async function refreshCreatorsFromPhone(
  targets: { platform: CreatorPlatform; handle: string }[], concurrency = 4,
): Promise<(CreatorAvatar | null)[]> {
  const results: (CreatorAvatar | null)[] = new Array(targets.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const i = next++;
      results[i] = await refreshCreatorFromPhone(targets[i].platform, targets[i].handle);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return results;
}
