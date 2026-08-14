// Asking for the camera and the photo library, once.
//
// Four screens had typed out the same pair of requests and the same alert:
// progress photos, the food-image picker, and both program-cover modals. The
// only thing that differed was whether the sentence said "photos" or
// "images", which is why the noun is a parameter rather than a reason to keep
// four copies.
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";

/**
 * Ask for both, and say so plainly if either is refused.
 *
 * Returns whether the caller may proceed. Both are requested because every
 * caller offers both paths — take a photo, or choose an existing one — and
 * finding out halfway through which one is missing is worse than asking for
 * the pair up front.
 */
export async function requestCameraAndLibrary(noun = "images"): Promise<boolean> {
  const camera = await ImagePicker.requestCameraPermissionsAsync();
  const library = await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!camera.granted || !library.granted) {
    Alert.alert(
      "Permissions Required",
      `Camera and photo library access are required to upload ${noun}.`,
    );
    return false;
  }
  return true;
}
