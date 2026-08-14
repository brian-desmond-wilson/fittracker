// mobile/src/lib/imageUpload.ts
//
// One way into the image bucket.
//
// This was written inside the food editor, which is where the only uploader in
// the app happened to live. A meal now has a photograph of its own and needs
// exactly the same thing — a local file URI in, a public URL out — and copying
// forty lines of FormData and bearer-token assembly to get it is how two
// upload paths start disagreeing about which bucket, which folder, or what to
// do when the session is missing.
import { supabase } from "./supabase";

/** The bucket every food and meal photograph lives in. */
const BUCKET = "food-inventory";

/**
 * Upload a local image and return its public URL, or null.
 *
 * Null rather than throwing: a photograph is never the point of the save it
 * accompanies, and failing the whole write because a picture didn't upload
 * would lose the edit as well as the image. Callers log and carry on.
 *
 * `fetch` with FormData rather than the storage client's `upload()`: React
 * Native has no File/Blob for a `file://` URI, so the SDK path uploads an
 * empty object.
 */
export async function uploadImage(uri: string, name: string): Promise<string | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Scoped by user id, so one person's photographs can never collide with
    // another's, and timestamped so re-photographing the same subject does not
    // silently overwrite the picture other rows may still point at.
    const fileExt = uri.split(".").pop()?.split("?")[0] || "jpg";
    const filePath = `food-images/${user.id}/${Date.now()}_${name}.${fileExt}`;

    const formData = new FormData();
    formData.append("file", {
      uri,
      type: "image/jpeg",
      name: `${name}.jpg`,
    } as unknown as Blob);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error("uploadImage: no session");
      return null;
    }

    const response = await fetch(
      `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/${BUCKET}/${filePath}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: formData,
      },
    );
    if (!response.ok) {
      console.error("uploadImage failed:", response.status, await response.text());
      return null;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    return publicUrl;
  } catch (error) {
    console.error("uploadImage failed:", error);
    return null;
  }
}
