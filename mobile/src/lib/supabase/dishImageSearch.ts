// The client half of dish-image-search.
//
// Search returns suggestions; pick turns the chosen suggestion into a URL the
// app owns. The split matters to callers: candidates can be fetched eagerly
// and thrown away for free, but pick costs a download and a write, so it runs
// exactly once, for the image somebody actually chose.
import { supabase } from "../supabase";

export interface DishImageCandidate {
  /** Small and fast — what the picker strip renders. */
  thumbUrl: string;
  /** Full-size — what pick() will download and keep. */
  imageUrl: string;
  /** Where it came from. Shown, never followed programmatically. */
  sourcePage: string | null;
}

/**
 * Candidate images for a dish, scoped by vendor.
 *
 * Empty on any failure, INCLUDING search-not-configured: candidates are an
 * accelerator, and the sheet's camera and library sources are unaffected. The
 * one distinction callers get is `configured`, so the sheet can say "set up
 * image search" instead of showing an empty strip that looks like a bug.
 */
export async function searchDishImages(
  query: string,
  vendorName: string | null,
): Promise<{ candidates: DishImageCandidate[]; configured: boolean }> {
  try {
    const { data, error } = await supabase.functions.invoke("dish-image-search", {
      body: { action: "search", query, vendor: vendorName ?? "" },
    });
    if (error) throw error;
    if (data?.configured === false) return { candidates: [], configured: false };
    const raw = (data?.candidates ?? []) as DishImageCandidate[];
    return {
      candidates: raw.filter((c) => !!c?.thumbUrl && !!c?.imageUrl),
      configured: true,
    };
  } catch (e) {
    console.error("dish image search failed:", e);
    return { candidates: [], configured: true };
  }
}

/**
 * What the server said when a pick failed.
 *
 * `functions.invoke` rejects with a FunctionsHttpError whose message is only
 * "non-2xx status code" — the actual reason ("source image fetch failed: 403")
 * is in the response body, which the error carries but does not read. Without
 * this the app could only ever say "couldn't fetch that image", which names
 * the symptom and hides every cause: a site refusing robots, an address that
 * points at a page, an image too big.
 */
async function serverReason(e: unknown): Promise<string | null> {
  const res = (e as { context?: Response })?.context;
  if (!res || typeof res.json !== "function") return null;
  try {
    const body = await res.json();
    return typeof body?.error === "string" ? body.error : null;
  } catch {
    return null;
  }
}

export interface PickResult {
  /** The URL of our own copy, or null when nothing was kept. */
  url: string | null;
  /** Why not, in the server's words, for the caller to show. */
  reason?: string | null;
}

/**
 * Keep the chosen candidate: the function downloads it and stores a copy in
 * the app's own bucket.
 *
 * The thumbnail rides along so the server has a second address to try. A
 * search result's full-size link belongs to whoever published it, and plenty
 * of them refuse a fetch that is not a browser on their own page; the
 * thumbnail is Google's copy, and it always answers.
 */
export async function pickDishImage(
  candidate: DishImageCandidate,
  dishName: string,
): Promise<PickResult> {
  try {
    const { data, error } = await supabase.functions.invoke("dish-image-search", {
      body: {
        action: "pick",
        imageUrl: candidate.imageUrl,
        fallbackUrl: candidate.thumbUrl || null,
        name: dishName,
      },
    });
    if (error) throw error;
    return { url: typeof data?.imageUrl === "string" ? data.imageUrl : null };
  } catch (e) {
    const reason = await serverReason(e);
    console.error("dish image pick failed:", reason ?? e);
    return { url: null, reason };
  }
}
