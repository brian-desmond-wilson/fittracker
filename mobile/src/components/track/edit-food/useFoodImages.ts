import { useState } from "react";
import { Platform, Alert, ActionSheetIOS } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { FoodInventoryItemWithCategories } from "@/src/types/track";

export type FoodImageType = "primary" | "front" | "back" | "side";

// Owns the four food-image URIs and the camera/library picker flow. Values seed
// from the item; the picker updates them (local file:// URIs until save uploads).
export function useFoodImages(item: FoodInventoryItemWithCategories) {
  const [imagePrimary, setImagePrimary] = useState<string | null>(item.image_primary_url);
  const [imageFront, setImageFront] = useState<string | null>(item.image_front_url);
  const [imageBack, setImageBack] = useState<string | null>(item.image_back_url);
  const [imageSide, setImageSide] = useState<string | null>(item.image_side_url);

  const requestPermissions = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const mediaLibraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!cameraPermission.granted || !mediaLibraryPermission.granted) {
      Alert.alert(
        "Permissions Required",
        "Camera and photo library access are required to upload images."
      );
      return false;
    }
    return true;
  };

  const pickImage = async (imageType: FoodImageType) => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const setImageFunction = {
      primary: setImagePrimary,
      front: setImageFront,
      back: setImageBack,
      side: setImageSide,
    }[imageType];

    // Show action sheet on iOS, alert on Android
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Take Photo", "Choose from Library"],
          cancelButtonIndex: 0,
        },
        async (buttonIndex) => {
          if (buttonIndex === 1) {
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              setImageFunction(result.assets[0].uri);
            }
          } else if (buttonIndex === 2) {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              setImageFunction(result.assets[0].uri);
            }
          }
        }
      );
    } else {
      Alert.alert("Select Image", "Choose an option", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Take Photo",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              setImageFunction(result.assets[0].uri);
            }
          },
        },
        {
          text: "Choose from Library",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              setImageFunction(result.assets[0].uri);
            }
          },
        },
      ]);
    }
  };

  return {
    imagePrimary,
    imageFront,
    imageBack,
    imageSide,
    setImagePrimary,
    setImageFront,
    setImageBack,
    setImageSide,
    pickImage,
  };
}
