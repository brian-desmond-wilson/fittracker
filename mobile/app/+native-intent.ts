// expo-router resolves every incoming deep link as a route, and the share
// extension's handoff URL (fittracker://dataUrl=<key>) is not one — without
// this rewrite the app opens on the Unmatched Route screen. The share
// payload itself travels through expo-share-intent's native store, not the
// URL, so all the route has to do is land on the training screen; the root
// layout's useShareIntent hook takes it from there.
import { getShareExtensionKey } from "expo-share-intent";

export function redirectSystemPath({
  path,
}: {
  path: string;
  initial: boolean;
}) {
  try {
    if (path.includes(`dataUrl=${getShareExtensionKey()}`)) {
      return "/(tabs)/training";
    }
    return path;
  } catch (e) {
    console.error("[native-intent] redirect failed:", e);
    return "/";
  }
}
