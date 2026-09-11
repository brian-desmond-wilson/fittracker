// Generated exercise pictures — now a thin wrapper over enrich-exercise, so
// the workout session's tap-to-generate keeps working while the server owns
// the prompt and the bucket. The session button only shows for an empty
// slot, so this asks for a fill, never the force_image overwrite (that is
// the page's explicit "Regenerate image"). The catalog wizard no longer
// calls this: it fires enrichExerciseInBackground (lib/supabase/enrich.ts),
// which fills the picture with everything else.
import { enrichExercise } from "./enrich";

/** Generate the picture and return its public URL, or null on any failure. */
export async function generateExerciseImage(
  exerciseId: string,
  _userId: string,
): Promise<string | null> {
  const result = await enrichExercise(exerciseId, { images: true });
  if (!result) return null;
  if (result.imageUrl) return result.imageUrl;
  console.error("Image generation failed:", result.skipped.image_url ?? result);
  return null;
}

/** A row wants a generated picture only when nobody supplied one. */
export function needsGeneratedImage(row: { image_url: string | null }): boolean {
  return !row.image_url || row.image_url.trim() === "";
}
