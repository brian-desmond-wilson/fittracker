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
 * Keep the chosen candidate: the function downloads it and stores a copy in
 * the app's own bucket. Returns the copy's URL, or null — null leaves the
 * dish exactly as it was, which is the correct cost of a failed decoration.
 */
export async function pickDishImage(
  candidate: DishImageCandidate,
  dishName: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabase.functions.invoke("dish-image-search", {
      body: { action: "pick", imageUrl: candidate.imageUrl, name: dishName },
    });
    if (error) throw error;
    return typeof data?.imageUrl === "string" ? data.imageUrl : null;
  } catch (e) {
    console.error("dish image pick failed:", e);
    return null;
  }
}
