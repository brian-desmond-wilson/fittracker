// Generated exercise pictures.
//
// The picture is made server-side (generate-exercise-image builds its own
// prompt from the row), so the phone only ever hands over an id. Two callers:
// the workout session's tap-to-generate, which waits for the URL, and the
// catalog front door, which fires and forgets so a freshly created exercise
// shows up in the Exercises tab with a picture instead of a blank square.
import { supabase } from "../supabase";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

/** Generate the picture and return its public URL, or null on any failure. */
export async function generateExerciseImage(
  exerciseId: string,
  userId: string,
): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const response = await fetch(
      `${SUPABASE_URL}/functions/v1/generate-exercise-image`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token || ""}`,
        },
        body: JSON.stringify({ exerciseId, userId }),
      },
    );

    const data = await response.json();
    console.log("Image generation response:", data);

    if (data.success && data.imageUrl) {
      return data.imageUrl;
    }
    console.error("Image generation failed:", data.error || data);
    return null;
  } catch (err) {
    console.error("Image generation error:", err);
    return null;
  }
}

/** A row wants a generated picture only when nobody supplied one. */
export function needsGeneratedImage(row: { image_url: string | null }): boolean {
  return !row.image_url || row.image_url.trim() === "";
}

/**
 * Fire-and-forget: kick off generation for a just-created row and return at
 * once. The save already succeeded; a missing picture is never a reason to
 * fail it or to bother the person with an alert. The tab picks the URL up on
 * its next load (focus or pull-to-refresh).
 */
export function generateExerciseImageInBackground(
  row: { id: string; image_url: string | null },
  userId: string,
): void {
  if (!needsGeneratedImage(row)) return;
  void generateExerciseImage(row.id, userId).catch((err) => {
    console.error("Background exercise image generation failed:", err);
  });
}
