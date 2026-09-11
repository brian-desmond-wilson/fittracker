// mobile/src/lib/openUrl.ts
// Opens an external URL and swallows the rejection (no handler for the
// scheme, or the OS refusing) so a tap never becomes an unhandled promise.
import { Linking } from "react-native";

export function openExternalUrl(url: string): void {
  Linking.openURL(url).catch((e) => console.warn("openURL failed:", e));
}
