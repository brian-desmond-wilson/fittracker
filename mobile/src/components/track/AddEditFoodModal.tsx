import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Platform,
  Modal,
  Image,
  ActionSheetIOS,
  ActivityIndicator,
} from "react-native";
import { X, Camera, Barcode, Trash2 } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { colors } from "@/src/lib/colors";
import { FoodInventoryItem, FoodLocation } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { getProductByBarcode } from "@/src/services/openFoodFactsApi";

interface AddEditFoodModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  item?: FoodInventoryItem | null;
}

const PREDEFINED_CATEGORIES = [
  "Produce",
  "Protein",
  "Dairy",
  "Grains",
  "Beverages",
  "Snacks",
  "Condiments",
  "Frozen",
  "Bakery",
];

const UNITS = ["oz", "lbs", "g", "kg", "ml", "L", "count", "servings"];

export function AddEditFoodModal({ visible, onClose, onSave, item }: AddEditFoodModalProps) {
  const isEdit = !!item;

  // Basic Info
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [flavor, setFlavor] = useState("");
  const [category, setCategory] = useState("");
  const [barcode, setBarcode] = useState("");

  // Quantity & Storage
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("count");
  const [location, setLocation] = useState<FoodLocation | null>(null);
  const [restockThreshold, setRestockThreshold] = useState("1");

  // Nutritional Info
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [sugars, setSugars] = useState("");
  const [servingSize, setServingSize] = useState("");

  // Expiration
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Notes
  const [notes, setNotes] = useState("");

  // Images
  const [imagePrimary, setImagePrimary] = useState<string | null>(null);
  const [imageFront, setImageFront] = useState<string | null>(null);
  const [imageBack, setImageBack] = useState<string | null>(null);
  const [imageSide, setImageSide] = useState<string | null>(null);

  // UI State
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProductData, setLoadingProductData] = useState(false);

  useEffect(() => {
    if (item) {
      // Populate form with existing item data
      setName(item.name);
      setBrand(item.brand || "");
      setFlavor(item.flavor || "");
      setCategory(item.category || "");
      setBarcode(item.barcode || "");
      setQuantity(item.quantity.toString());
      setUnit(item.unit);
      setLocation(item.location);
      setRestockThreshold(item.restock_threshold.toString());
      setCalories(item.calories?.toString() || "");
      setProtein(item.protein?.toString() || "");
      setCarbs(item.carbs?.toString() || "");
      setFats(item.fats?.toString() || "");
      setSugars(item.sugars?.toString() || "");
      setServingSize(item.serving_size || "");
      setExpirationDate(item.expiration_date ? new Date(item.expiration_date) : null);
      setNotes(item.notes || "");
      setImagePrimary(item.image_primary_url);
      setImageFront(item.image_front_url);
      setImageBack(item.image_back_url);
      setImageSide(item.image_side_url);
    } else {
      // Reset form for new item
      resetForm();
    }
  }, [item, visible]);

  const resetForm = () => {
    setName("");
    setBrand("");
    setFlavor("");
    setCategory("");
    setBarcode("");
    setQuantity("");
    setUnit("count");
    setLocation(null);
    setRestockThreshold("1");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setSugars("");
    setServingSize("");
    setExpirationDate(null);
    setNotes("");
    setImagePrimary(null);
    setImageFront(null);
    setImageBack(null);
    setImageSide(null);
  };

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

  const pickImage = async (imageType: "primary" | "front" | "back" | "side") => {
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
            // Take Photo
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });

            if (!result.canceled && result.assets[0]) {
              setImageFunction(result.assets[0].uri);
            }
          } else if (buttonIndex === 2) {
            // Choose from Library
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
      // Android - use Alert
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

  const handleBarcodeScanned = async (scannedBarcode: string) => {
    setBarcode(scannedBarcode);
    setLoadingProductData(true);

    try {
      const productData = await getProductByBarcode(scannedBarcode);

      if (productData) {
        // Auto-populate form fields
        if (productData.name && !name) {
          setName(productData.name);
        }
        if (productData.brand && !brand) {
          setBrand(productData.brand);
        }
        if (productData.category && !category) {
          setCategory(productData.category);
        }
        if (productData.servingSize && !servingSize) {
          setServingSize(productData.servingSize);
        }
        if (productData.calories !== null && !calories) {
          setCalories(productData.calories.toString());
        }
        if (productData.protein !== null && !protein) {
          setProtein(productData.protein.toString());
        }
        if (productData.carbs !== null && !carbs) {
          setCarbs(productData.carbs.toString());
        }
        if (productData.fats !== null && !fats) {
          setFats(productData.fats.toString());
        }
        if (productData.sugars !== null && !sugars) {
          setSugars(productData.sugars.toString());
        }
        if (productData.imagePrimaryUrl && !imagePrimary) {
          setImagePrimary(productData.imagePrimaryUrl);
        }
        if (productData.imageFrontUrl && !imageFront) {
          setImageFront(productData.imageFrontUrl);
        }
        if (productData.imageBackUrl && !imageBack) {
          setImageBack(productData.imageBackUrl);
        }

        Alert.alert(
          "Product Found!",
          `${productData.name}${productData.brand ? ` by ${productData.brand}` : ""} has been loaded.`,
          [{ text: "OK" }]
        );
      } else {
        Alert.alert(
          "Product Not Found",
          "No product information found for this barcode. You can enter details manually.",
          [{ text: "OK" }]
        );
      }
    } catch (error) {
      console.error("Error fetching product data:", error);
      Alert.alert("Error", "Failed to fetch product information. Please enter details manually.");
    } finally {
      setLoadingProductData(false);
    }
  };

  const uploadImage = async (uri: string, imageName: string): Promise<string | null> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      // Create unique filename
      const fileExt = uri.split(".").pop()?.split("?")[0] || "jpg";
      const timestamp = Date.now();
      const fileName = `${user.id}/${timestamp}_${imageName}.${fileExt}`;
      const filePath = `food-images/${fileName}`;

      console.log("Uploading image:", { filePath, uri });

      // Use FormData to upload the file from React Native
      const formData = new FormData();
      formData.append("file", {
        uri: uri,
        type: "image/jpeg",
        name: `${imageName}.jpg`,
      } as any);

      // Get Supabase storage upload URL and headers
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        console.error("No session available");
        return null;
      }

      // Upload using fetch with FormData
      const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/food-inventory/${filePath}`;

      const uploadResponse = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.error("Upload failed:", uploadResponse.status, errorText);
        return null;
      }

      console.log("Upload successful");

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("food-inventory").getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error("Image upload failed:", error);
      return null;
    }
  };

  const handleSave = async () => {
    // Validation
    if (!name.trim()) {
      Alert.alert("Validation Error", "Product name is required");
      return;
    }

    if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) < 0) {
      Alert.alert("Validation Error", "Valid quantity is required");
      return;
    }

    try {
      setSaving(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in");
        return;
      }

      // Upload images if they are new (local URIs)
      let primaryUrl = imagePrimary;
      let frontUrl = imageFront;
      let backUrl = imageBack;
      let sideUrl = imageSide;

      if (imagePrimary && imagePrimary.startsWith("file://")) {
        primaryUrl = await uploadImage(imagePrimary, "primary");
      }
      if (imageFront && imageFront.startsWith("file://")) {
        frontUrl = await uploadImage(imageFront, "front");
      }
      if (imageBack && imageBack.startsWith("file://")) {
        backUrl = await uploadImage(imageBack, "back");
      }
      if (imageSide && imageSide.startsWith("file://")) {
        sideUrl = await uploadImage(imageSide, "side");
      }

      const itemData = {
        user_id: user.id,
        name: name.trim(),
        brand: brand.trim() || null,
        flavor: flavor.trim() || null,
        category: category.trim() || null,
        barcode: barcode.trim() || null,
        quantity: parseInt(quantity),
        unit: unit,
        location: location,
        restock_threshold: parseInt(restockThreshold) || 1,
        calories: calories ? parseInt(calories) : null,
        protein: protein ? parseFloat(protein) : null,
        carbs: carbs ? parseFloat(carbs) : null,
        fats: fats ? parseFloat(fats) : null,
        sugars: sugars ? parseFloat(sugars) : null,
        serving_size: servingSize.trim() || null,
        expiration_date: expirationDate ? expirationDate.toISOString().split("T")[0] : null,
        notes: notes.trim() || null,
        image_primary_url: primaryUrl,
        image_front_url: frontUrl,
        image_back_url: backUrl,
        image_side_url: sideUrl,
      };

      if (isEdit && item) {
        // Update existing item
        const { error } = await supabase
          .from("food_inventory")
          .update(itemData)
          .eq("id", item.id);

        if (error) throw error;
        Alert.alert("Success", "Item updated successfully");
      } else {
        // Create new item
        const { error } = await supabase.from("food_inventory").insert([itemData]);

        if (error) throw error;
        Alert.alert("Success", "Item added successfully");
      }

      onSave();
      onClose();
    } catch (error: any) {
      console.error("Error saving item:", error);
      Alert.alert("Error", "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{isEdit ? "Edit Product" : "Add Product"}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <X size={24} color={colors.foreground} />
          </TouchableOpacity>
        </View>

        {/* Form */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Basic Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <View style={styles.field}>
              <Text style={styles.label}>
                Product Name <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Greek Yogurt"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Brand</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Chobani"
                placeholderTextColor={colors.mutedForeground}
                value={brand}
                onChangeText={setBrand}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Flavor / Variety</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Vanilla, Strawberry"
                placeholderTextColor={colors.mutedForeground}
                value={flavor}
                onChangeText={setFlavor}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Category</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowCategoryPicker(true)}
              >
                <Text style={[styles.pickerButtonText, !category && styles.placeholder]}>
                  {category || "Select category"}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Barcode</Text>
                <TouchableOpacity
                  style={styles.scanButton}
                  onPress={() => setShowBarcodeScanner(true)}
                  disabled={loadingProductData}
                >
                  {loadingProductData ? (
                    <ActivityIndicator size="small" color={colors.foreground} />
                  ) : (
                    <>
                      <Barcode size={16} color={colors.foreground} />
                      <Text style={styles.scanButtonText}>Scan</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Enter or scan barcode"
                placeholderTextColor={colors.mutedForeground}
                value={barcode}
                onChangeText={setBarcode}
                keyboardType="numeric"
                editable={!loadingProductData}
              />
              {loadingProductData && (
                <Text style={styles.loadingText}>Loading product information...</Text>
              )}
            </View>
          </View>

          {/* Quantity & Storage Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quantity & Storage</Text>

            <View style={styles.row}>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>
                  Quantity <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  value={quantity}
                  onChangeText={setQuantity}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>Unit</Text>
                <TouchableOpacity style={styles.pickerButton} onPress={() => setShowUnitPicker(true)}>
                  <Text style={styles.pickerButtonText}>{unit}</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Location</Text>
              <View style={styles.locationButtons}>
                {(["fridge", "freezer", "pantry"] as FoodLocation[]).map((loc) => (
                  <TouchableOpacity
                    key={loc}
                    style={[styles.locationButton, location === loc && styles.locationButtonActive]}
                    onPress={() => setLocation(loc)}
                  >
                    <Text
                      style={[
                        styles.locationButtonText,
                        location === loc && styles.locationButtonTextActive,
                      ]}
                    >
                      {loc.charAt(0).toUpperCase() + loc.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Restock Threshold</Text>
              <TextInput
                style={styles.input}
                placeholder="Notify when quantity reaches..."
                placeholderTextColor={colors.mutedForeground}
                value={restockThreshold}
                onChangeText={setRestockThreshold}
                keyboardType="numeric"
              />
            </View>
          </View>

          {/* Nutritional Information Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Nutritional Information</Text>

            <View style={styles.row}>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>Calories</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  value={calories}
                  onChangeText={setCalories}
                  keyboardType="numeric"
                />
              </View>

              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>Serving Size</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 1 cup"
                  placeholderTextColor={colors.mutedForeground}
                  value={servingSize}
                  onChangeText={setServingSize}
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  value={protein}
                  onChangeText={setProtein}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  value={carbs}
                  onChangeText={setCarbs}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>Fats (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  value={fats}
                  onChangeText={setFats}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={[styles.field, styles.fieldHalf]}>
                <Text style={styles.label}>Sugars (g)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.mutedForeground}
                  value={sugars}
                  onChangeText={setSugars}
                  keyboardType="decimal-pad"
                />
              </View>
            </View>
          </View>

          {/* Expiration Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Expiration</Text>

            <View style={styles.field}>
              <Text style={styles.label}>Expiration Date</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={[styles.pickerButtonText, !expirationDate && styles.placeholder]}>
                  {expirationDate
                    ? expirationDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Select date"}
                </Text>
              </TouchableOpacity>
              {expirationDate && (
                <TouchableOpacity
                  style={styles.clearButton}
                  onPress={() => setExpirationDate(null)}
                >
                  <Text style={styles.clearButtonText}>Clear</Text>
                </TouchableOpacity>
              )}
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={expirationDate || new Date()}
                mode="date"
                display={Platform.OS === "ios" ? "spinner" : "default"}
                onChange={(event, selectedDate) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (selectedDate) {
                    setExpirationDate(selectedDate);
                  }
                }}
              />
            )}
          </View>

          {/* Images Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Product Images</Text>
            <Text style={styles.sectionSubtitle}>Add photos to easily identify your products</Text>

            <View style={styles.imageGrid}>
              {[
                { label: "Primary", image: imagePrimary, type: "primary" as const },
                { label: "Front", image: imageFront, type: "front" as const },
                { label: "Back", image: imageBack, type: "back" as const },
                { label: "Side", image: imageSide, type: "side" as const },
              ].map(({ label, image, type }) => (
                <View key={label} style={styles.imageContainer}>
                  <TouchableOpacity
                    style={[styles.imagePlaceholder, image && styles.imageWithPhoto]}
                    onPress={() => pickImage(type)}
                  >
                    {image ? (
                      <Image source={{ uri: image }} style={styles.productImage} />
                    ) : (
                      <>
                        <Camera size={32} color={colors.mutedForeground} />
                        <Text style={styles.imagePlaceholderText}>{label}</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  {image && (
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={() => {
                        if (type === "primary") setImagePrimary(null);
                        else if (type === "front") setImageFront(null);
                        else if (type === "back") setImageBack(null);
                        else if (type === "side") setImageSide(null);
                      }}
                    >
                      <Trash2 size={16} color="#FFFFFF" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
            </View>
          </View>

          {/* Notes Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Notes</Text>

            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Additional notes..."
              placeholderTextColor={colors.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Footer Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.button, styles.buttonSecondary]}
            onPress={onClose}
            disabled={saving}
          >
            <Text style={styles.buttonSecondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, saving && styles.buttonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.buttonPrimaryText}>{saving ? "Saving..." : "Save"}</Text>
          </TouchableOpacity>
        </View>

        {/* Category Picker Modal */}
        <Modal visible={showCategoryPicker} transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Select Category</Text>
              <ScrollView>
                {PREDEFINED_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={styles.pickerOption}
                    onPress={() => {
                      setCategory(cat);
                      setShowCategoryPicker(false);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{cat}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity
                style={styles.pickerClose}
                onPress={() => setShowCategoryPicker(false)}
              >
                <Text style={styles.pickerCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Unit Picker Modal */}
        <Modal visible={showUnitPicker} transparent animationType="slide">
          <View style={styles.pickerModal}>
            <View style={styles.pickerContent}>
              <Text style={styles.pickerTitle}>Select Unit</Text>
              <ScrollView>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={styles.pickerOption}
                    onPress={() => {
                      setUnit(u);
                      setShowUnitPicker(false);
                    }}
                  >
                    <Text style={styles.pickerOptionText}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <TouchableOpacity style={styles.pickerClose} onPress={() => setShowUnitPicker(false)}>
                <Text style={styles.pickerCloseText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* Barcode Scanner Modal */}
        <BarcodeScannerModal
          visible={showBarcodeScanner}
          onClose={() => setShowBarcodeScanner(false)}
          onBarcodeScanned={handleBarcodeScanned}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: colors.foreground,
  },
  closeButton: {
    padding: 4,
  },
  content: {
    flex: 1,
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: colors.mutedForeground,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  fieldHalf: {
    flex: 1,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  required: {
    color: "#EF4444",
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.foreground,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
  },
  pickerButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    color: colors.foreground,
  },
  placeholder: {
    color: colors.mutedForeground,
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  locationButtons: {
    flexDirection: "row",
    gap: 8,
  },
  locationButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  locationButtonActive: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  locationButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  locationButtonTextActive: {
    color: "#FFFFFF",
  },
  clearButton: {
    marginTop: 8,
  },
  clearButtonText: {
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "600",
  },
  imageGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  imageContainer: {
    width: "48%",
    position: "relative",
  },
  imagePlaceholder: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  imageWithPhoto: {
    borderStyle: "solid",
    borderColor: "#8B5CF6",
  },
  productImage: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  imagePlaceholderText: {
    marginTop: 8,
    fontSize: 12,
    color: colors.mutedForeground,
  },
  removeImageButton: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "#EF4444",
    borderRadius: 16,
    padding: 6,
    zIndex: 10,
  },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  buttonPrimary: {
    backgroundColor: "#8B5CF6",
  },
  buttonPrimaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  pickerModal: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  pickerContent: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: "50%",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    textAlign: "center",
    marginBottom: 16,
  },
  pickerOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  pickerOptionText: {
    fontSize: 16,
    color: colors.foreground,
  },
  pickerClose: {
    paddingVertical: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  pickerCloseText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#EF4444",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: "#8B5CF6",
    fontStyle: "italic",
  },
});
