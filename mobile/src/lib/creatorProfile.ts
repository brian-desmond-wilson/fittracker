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

async function instagramCandidatesFromPhone(handle: string): Promise<string[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.instagram.com/${handle}/`, { signal: controller.signal });
    if (!res.ok) return [];
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
