// Reads of the shared creators table and the one edge action that refreshes
// a row. The table is a cache of public profile pictures: a miss is a letter
// in the UI, never an error.
import { supabase } from "../supabase";
import { normaliseHandle } from "../creatorHandle";

export type CreatorPlatform = "instagram" | "tiktok";

export interface CreatorAvatar {
  platform: CreatorPlatform;
  /** Normalised (no @). */
  handle: string;
  avatarUrl: string | null;
  fetchedAt: string | null;
}

/** Keyed by normalised handle. A handle captured on both platforms keeps
 *  whichever row sorts last; the picker only knows handles, not platforms. */
export type CreatorAvatarMap = Record<string, CreatorAvatar>;

interface CreatorRow {
  platform: CreatorPlatform;
  handle: string;
  avatar_url: string | null;
  avatar_fetched_at: string | null;
}

const toAvatar = (r: CreatorRow): CreatorAvatar => ({
  platform: r.platform, handle: r.handle, avatarUrl: r.avatar_url, fetchedAt: r.avatar_fetched_at,
});

export async function fetchCreators(): Promise<CreatorAvatarMap> {
  const { data, error } = await supabase
    .from("creators")
    .select("platform, handle, avatar_url, avatar_fetched_at")
    .order("platform");
  if (error) {
    console.error("creators fetch failed:", error);
    return {};
  }
  const map: CreatorAvatarMap = {};
  for (const r of (data ?? []) as CreatorRow[]) map[r.handle] = toAvatar(r);
  return map;
}

export async function fetchCreator(platform: CreatorPlatform, rawHandle: string): Promise<CreatorAvatar | null> {
  const handle = normaliseHandle(rawHandle);
  if (!handle) return null;
  const { data, error } = await supabase
    .from("creators")
    .select("platform, handle, avatar_url, avatar_fetched_at")
    .eq("platform", platform)
    .eq("handle", handle)
    .maybeSingle();
  if (error || !data) return null;
  return toAvatar(data as CreatorRow);
}

/** Ask the edge function to (re)fetch one creator. `candidates` are picture
 *  links this phone found on the creator's Instagram page (empty for
 *  TikTok, which the server reads itself). Resolves to the fresh row, or
 *  null when it could not. Screens call refreshCreatorFromPhone, not this. */
export async function refreshCreator(
  platform: CreatorPlatform, rawHandle: string, candidates: string[],
): Promise<CreatorAvatar | null> {
  try {
    const { data, error } = await supabase.functions.invoke("capture-post", {
      body: { action: "refresh-creator", platform, handle: rawHandle, candidates },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return {
      platform, handle: String(data.handle ?? normaliseHandle(rawHandle)),
      avatarUrl: (data.avatarUrl as string | null) ?? null,
      fetchedAt: (data.avatarFetchedAt as string | null) ?? null,
    };
  } catch (e) {
    console.error("creator refresh failed:", e);
    return null;
  }
}
