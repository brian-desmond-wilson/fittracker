import React, { useState, useEffect, useRef } from "react";
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
  Animated,
  LayoutAnimation,
  StatusBar,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Camera, Barcode, Trash2, Plus, ChevronDown, Circle, CheckCircle } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { FoodInventoryItemWithCategories, FoodLocation, StorageType, FoodCategory, FoodSubcategory } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { getProductByBarcode } from "@/src/services/openFoodFactsApi";

interface LocationEntry {
  id: string;
  location: FoodLocation;
  quantity: string;
  isReadyToConsume: boolean;
  notes: string;
}

interface EditFoodScreenProps {
  item: FoodInventoryItemWithCategories;
  onClose: () => void;
  onSave: (newItemId?: string) => void;  // Changed to accept optional newItemId
  isNew?: boolean;  // NEW prop to indicate if this is a new item
}

type SectionKey = "basic" | "storage" | "nutrition" | "expiration" | "images" | "notes";

const UNITS = ["oz", "lbs", "g", "kg", "ml", "L", "count", "servings"];

// Section Header Component
interface SectionHeaderProps {
  title: string;
  sectionKey: SectionKey;
  isExpanded: boolean;
  hasError: boolean;
  onPress: () => void;
}

function SectionHeader({ title, sectionKey, isExpanded, hasError, onPress }: SectionHeaderProps) {
  const rotateAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(rotateAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [isExpanded]);

  const rotate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "180deg"],
  });

  return (
    <TouchableOpacity
      style={[styles.sectionHeader, hasError && styles.sectionHeaderError]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.sectionTitle, hasError && styles.sectionTitleError]}>{title}</Text>
      <Animated.View style={{ transform: [{ rotate }] }}>
        <ChevronDown size={20} color={hasError ? "#EF4444" : "#111827"} />
      </Animated.View>
    </TouchableOpacity>
  );
}

export function EditFoodScreen({ item, onClose, onSave, isNew = false }: EditFoodScreenProps) {
  const insets = useSafeAreaInsets();

  // Categories & Subcategories Data
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const [subcategories, setSubcategories] = useState<FoodSubcategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>(
    item.categories.map(cat => cat.id)
  );
  const [selectedSubcategoryIds, setSelectedSubcategoryIds] = useState<string[]>(
    item.subcategories.map(sub => sub.id)
  );
  const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(
    new Set(item.categories.map(cat => cat.id))
  );

  // Basic Info
  const [name, setName] = useState(item.name);
  const [brand, setBrand] = useState(item.brand || "");
  const [flavor, setFlavor] = useState(item.flavor || "");
  const [barcode, setBarcode] = useState(item.barcode || "");

  // Quantity & Storage
  const [storageType, setStorageType] = useState<StorageType>(item.storage_type);
  const [quantity, setQuantity] = useState(item.quantity.toString());
  const [unit, setUnit] = useState(item.unit);
  const [location, setLocation] = useState<FoodLocation | null>(item.location);
  const [restockThreshold, setRestockThreshold] = useState(item.restock_threshold.toString());
  const [requiresRefrigeration, setRequiresRefrigeration] = useState(item.requires_refrigeration);
  const [fridgeRestockThreshold, setFridgeRestockThreshold] = useState(
    item.fridge_restock_threshold?.toString() || ""
  );
  const [totalRestockThreshold, setTotalRestockThreshold] = useState(
    item.total_restock_threshold?.toString() || ""
  );

  // Multi-location entries
  const [locationEntries, setLocationEntries] = useState<LocationEntry[]>([]);

  // Nutritional Info
  const [calories, setCalories] = useState(item.calories?.toString() || "");
  const [protein, setProtein] = useState(item.protein?.toString() || "");
  const [carbs, setCarbs] = useState(item.carbs?.toString() || "");
  const [fats, setFats] = useState(item.fats?.toString() || "");
  const [sugars, setSugars] = useState(item.sugars?.toString() || "");
  const [servingSize, setServingSize] = useState(item.serving_size || "");

  // Expiration
  const [expirationDate, setExpirationDate] = useState<Date | null>(
    item.expiration_date ? new Date(item.expiration_date) : null
  );
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Notes
  const [notes, setNotes] = useState(item.notes || "");

  // Images
  const [imagePrimary, setImagePrimary] = useState<string | null>(item.image_primary_url);
  const [imageFront, setImageFront] = useState<string | null>(item.image_front_url);
  const [imageBack, setImageBack] = useState<string | null>(item.image_back_url);
  const [imageSide, setImageSide] = useState<string | null>(item.image_side_url);

  // UI State
  const [showUnitPicker, setShowUnitPicker] = useState(false);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProductData, setLoadingProductData] = useState(false);

  // Accordion state
  const [expandedSection, setExpandedSection] = useState<SectionKey>("basic");
  const [validationErrors, setValidationErrors] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Fetch categories and subcategories
    fetchCategoriesAndSubcategories();

    // For multi-location items, fetch location entries
    if (item.storage_type === 'multi-location') {
      fetchLocationEntries(item.id);
    }
  }, [item.id]);

  const fetchCategoriesAndSubcategories = async () => {
    try {
      const [categoriesResult, subcategoriesResult] = await Promise.all([
        supabase
          .from("food_categories")
          .select("*")
          .not("slug", "in", '("all-products","out-of-stock")')
          .order("display_order"),
        supabase
          .from("food_subcategories")
          .select("*")
          .order("display_order"),
      ]);

      if (categoriesResult.error) throw categoriesResult.error;
      if (subcategoriesResult.error) throw subcategoriesResult.error;

      setCategories(categoriesResult.data || []);
      setSubcategories(subcategoriesResult.data || []);
    } catch (error) {
      console.error("Error fetching categories:", error);
      Alert.alert("Error", "Failed to load categories");
    }
  };

  const fetchLocationEntries = async (itemId: string) => {
    try {
      const { data, error } = await supabase
        .from("food_inventory_locations")
        .select("*")
        .eq("food_inventory_id", itemId)
        .order("is_ready_to_consume", { ascending: false });

      if (error) throw error;

      const entries: LocationEntry[] = (data || []).map(loc => ({
        id: loc.id,
        location: loc.location,
        quantity: loc.quantity.toString(),
        isReadyToConsume: loc.is_ready_to_consume,
        notes: loc.notes || "",
      }));

      setLocationEntries(entries);
    } catch (error) {
      console.error("Error fetching location entries:", error);
    }
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

  const addLocationEntry = () => {
    const newEntry: LocationEntry = {
      id: Date.now().toString(),
      location: "fridge",
      quantity: "",
      isReadyToConsume: true,
      notes: "",
    };
    setLocationEntries([...locationEntries, newEntry]);
  };

  const updateLocationEntry = (id: string, updates: Partial<LocationEntry>) => {
    setLocationEntries(locationEntries.map(entry =>
      entry.id === id ? { ...entry, ...updates } : entry
    ));
  };

  const removeLocationEntry = (id: string) => {
    setLocationEntries(locationEntries.filter(entry => entry.id !== id));
  };

  const toggleSection = (section: SectionKey) => {
    if (Platform.OS === 'ios') {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setExpandedSection(expandedSection === section ? expandedSection : section);
  };

  const toggleCategory = (categoryId: string) => {
    const newExpandedIds = new Set(expandedCategoryIds);
    if (newExpandedIds.has(categoryId)) {
      newExpandedIds.delete(categoryId);
    } else {
      newExpandedIds.add(categoryId);
    }
    setExpandedCategoryIds(newExpandedIds);
  };

  const toggleCategorySelection = (categoryId: string) => {
    setSelectedCategoryIds(prev => {
      if (prev.includes(categoryId)) {
        // Deselect category and all its subcategories
        const categorySubcategoryIds = subcategories
          .filter(sub => sub.category_id === categoryId)
          .map(sub => sub.id);

        setSelectedSubcategoryIds(prevSubs =>
          prevSubs.filter(id => !categorySubcategoryIds.includes(id))
        );

        return prev.filter(id => id !== categoryId);
      } else {
        // Select category and expand it
        setExpandedCategoryIds(prev => new Set([...prev, categoryId]));
        return [...prev, categoryId];
      }
    });
  };

  const toggleSubcategorySelection = (subcategoryId: string, categoryId: string) => {
    setSelectedSubcategoryIds(prev => {
      if (prev.includes(subcategoryId)) {
        return prev.filter(id => id !== subcategoryId);
      } else {
        // Ensure parent category is selected
        if (!selectedCategoryIds.includes(categoryId)) {
          setSelectedCategoryIds(prevCats => [...prevCats, categoryId]);
        }
        return [...prev, subcategoryId];
      }
    });
  };

  const handleSave = async () => {
    // Clear previous validation errors
    const errors = new Set<string>();

    // Validation
    if (!name.trim()) {
      errors.add("name");
      setValidationErrors(errors);
      setExpandedSection("basic");
      Alert.alert("Validation Error", "Product name is required");
      return;
    }

    // Validate categories and subcategories
    if (selectedCategoryIds.length === 0) {
      errors.add("categories");
      setValidationErrors(errors);
      setExpandedSection("basic");
      Alert.alert("Validation Error", "Please select at least one category");
      return;
    }

    if (selectedSubcategoryIds.length === 0) {
      errors.add("subcategories");
      setValidationErrors(errors);
      setExpandedSection("basic");
      Alert.alert("Validation Error", "Please select at least one subcategory");
      return;
    }

    // Validate based on storage type
    if (storageType === 'single-location') {
      if (!quantity || isNaN(parseFloat(quantity)) || parseFloat(quantity) < 0) {
        errors.add("quantity");
        setValidationErrors(errors);
        setExpandedSection("storage");
        Alert.alert("Validation Error", "Valid quantity is required");
        return;
      }
    } else {
      // Multi-location validation
      if (locationEntries.length === 0) {
        errors.add("locationEntries");
        setValidationErrors(errors);
        setExpandedSection("storage");
        Alert.alert("Validation Error", "Please add at least one location entry");
        return;
      }

      for (const entry of locationEntries) {
        if (!entry.quantity || isNaN(parseFloat(entry.quantity)) || parseFloat(entry.quantity) < 0) {
          errors.add("locationEntries");
          setValidationErrors(errors);
          setExpandedSection("storage");
          Alert.alert("Validation Error", "All location entries must have valid quantities");
          return;
        }
      }
    }

    setValidationErrors(new Set());

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
        barcode: barcode.trim() || null,
        storage_type: storageType,
        quantity: storageType === 'single-location' ? parseInt(quantity) : 0,
        unit: unit,
        location: storageType === 'single-location' ? location : null,
        restock_threshold: restockThreshold ? parseInt(restockThreshold) : 0,
        requires_refrigeration: requiresRefrigeration,
        fridge_restock_threshold: fridgeRestockThreshold ? parseInt(fridgeRestockThreshold) : null,
        total_restock_threshold: totalRestockThreshold ? parseInt(totalRestockThreshold) : null,
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

      let foodItemId: string;

      if (isNew) {
        // CREATE new item
        const { data: newItem, error: insertError } = await supabase
          .from("food_inventory")
          .insert(itemData)
          .select('id')
          .single();

        if (insertError) throw insertError;
        if (!newItem) throw new Error("Failed to create item");

        foodItemId = newItem.id;

        // For multi-location items, insert location entries
        if (storageType === 'multi-location') {
          const locationsToInsert = locationEntries.map(entry => ({
            food_inventory_id: foodItemId,
            user_id: user.id,
            location: entry.location,
            quantity: parseInt(entry.quantity),
            is_ready_to_consume: entry.isReadyToConsume,
            notes: entry.notes || null,
          }));

          const { error: locationInsertError } = await supabase
            .from("food_inventory_locations")
            .insert(locationsToInsert);

          if (locationInsertError) throw locationInsertError;
        }

        // Insert category mappings
        if (selectedCategoryIds.length > 0) {
          const categoryMappings = selectedCategoryIds.map(categoryId => ({
            food_inventory_id: foodItemId,
            category_id: categoryId,
            user_id: user.id,
          }));

          const { error: categoryInsertError } = await supabase
            .from("food_inventory_category_map")
            .insert(categoryMappings);

          if (categoryInsertError) throw categoryInsertError;
        }

        // Insert subcategory mappings
        if (selectedSubcategoryIds.length > 0) {
          const subcategoryMappings = selectedSubcategoryIds.map(subcategoryId => ({
            food_inventory_id: foodItemId,
            subcategory_id: subcategoryId,
            user_id: user.id,
          }));

          const { error: subcategoryInsertError } = await supabase
            .from("food_inventory_subcategory_map")
            .insert(subcategoryMappings);

          if (subcategoryInsertError) throw subcategoryInsertError;
        }

        Alert.alert("Success", "Item added successfully");
        onSave(foodItemId);
        onClose();
      } else {
        // UPDATE existing item
        const { error } = await supabase
          .from("food_inventory")
          .update(itemData)
          .eq("id", item.id);

        if (error) throw error;

        foodItemId = item.id;

        // For multi-location items, handle location entries
        if (storageType === 'multi-location') {
          // Delete existing locations
          const { error: deleteError } = await supabase
            .from("food_inventory_locations")
            .delete()
            .eq("food_inventory_id", item.id);

          if (deleteError) throw deleteError;

          // Insert new locations
          const locationsToInsert = locationEntries.map(entry => ({
            food_inventory_id: item.id,
            user_id: user.id,
            location: entry.location,
            quantity: parseInt(entry.quantity),
            is_ready_to_consume: entry.isReadyToConsume,
            notes: entry.notes || null,
          }));

          const { error: insertError } = await supabase
            .from("food_inventory_locations")
            .insert(locationsToInsert);

          if (insertError) throw insertError;
        }

        // Handle category and subcategory mappings
        // Delete existing category mappings
        const { error: deleteCategoryError } = await supabase
          .from("food_inventory_category_map")
          .delete()
          .eq("food_inventory_id", item.id);

        if (deleteCategoryError) throw deleteCategoryError;

        // Delete existing subcategory mappings
        const { error: deleteSubcategoryError } = await supabase
          .from("food_inventory_subcategory_map")
          .delete()
          .eq("food_inventory_id", item.id);

        if (deleteSubcategoryError) throw deleteSubcategoryError;

        // Insert new category mappings
        if (selectedCategoryIds.length > 0) {
          const categoryMappings = selectedCategoryIds.map(categoryId => ({
            food_inventory_id: item.id,
            category_id: categoryId,
            user_id: user.id,
          }));

          const { error: categoryInsertError } = await supabase
            .from("food_inventory_category_map")
            .insert(categoryMappings);

          if (categoryInsertError) throw categoryInsertError;
        }

        // Insert new subcategory mappings
        if (selectedSubcategoryIds.length > 0) {
          const subcategoryMappings = selectedSubcategoryIds.map(subcategoryId => ({
            food_inventory_id: item.id,
            subcategory_id: subcategoryId,
            user_id: user.id,
          }));

          const { error: subcategoryInsertError } = await supabase
            .from("food_inventory_subcategory_map")
            .insert(subcategoryMappings);

          if (subcategoryInsertError) throw subcategoryInsertError;
        }

        Alert.alert("Success", "Item updated successfully");
        onSave();
      }
    } catch (error: any) {
      console.error("Error saving item:", error);
      Alert.alert("Error", "Failed to save item");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isNew ? "Add Product" : "Edit Product"}</Text>
          <View style={{ width: 24 }} />
        </View>

        {/* Form */}
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Basic Information Section */}
          <View style={styles.section}>
            <SectionHeader
              title="Basic Information"
              sectionKey="basic"
              isExpanded={expandedSection === "basic"}
              hasError={validationErrors.has("name")}
              onPress={() => toggleSection("basic")}
            />

            {expandedSection === "basic" && (
              <View style={styles.sectionContent}>
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Product Name <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      validationErrors.has("name") && styles.inputError,
                    ]}
                    placeholder="e.g., Greek Yogurt"
                    placeholderTextColor="#9CA3AF"
                    value={name}
                    onChangeText={setName}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Brand</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Chobani"
                    placeholderTextColor="#9CA3AF"
                    value={brand}
                    onChangeText={setBrand}
                  />
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Flavor / Variety</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Vanilla, Strawberry"
                    placeholderTextColor="#9CA3AF"
                    value={flavor}
                    onChangeText={setFlavor}
                  />
                </View>

                {/* Categories & Subcategories */}
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Categories & Subcategories <Text style={styles.required}>*</Text>
                  </Text>
                  <Text style={styles.helpText}>
                    Select at least one category and subcategory
                  </Text>

                  {categories.length === 0 ? (
                    <Text style={styles.emptyText}>Loading categories...</Text>
                  ) : (
                    <View style={styles.categoryList}>
                      {categories.map((category) => {
                        const isCategorySelected = selectedCategoryIds.includes(category.id);
                        const isCategoryExpanded = expandedCategoryIds.has(category.id);
                        const categorySubcategories = subcategories.filter(
                          sub => sub.category_id === category.id
                        );

                        return (
                          <View key={category.id} style={styles.categoryItem}>
                            {/* Category Row */}
                            <View style={styles.categoryRow}>
                              <TouchableOpacity
                                style={styles.categoryCheckbox}
                                onPress={() => toggleCategorySelection(category.id)}
                              >
                                {isCategorySelected ? (
                                  <CheckCircle size={24} color="#8B5CF6" />
                                ) : (
                                  <Circle size={24} color="#9CA3AF" />
                                )}
                                <Text style={[
                                  styles.categoryName,
                                  isCategorySelected && styles.categoryNameSelected
                                ]}>
                                  {category.name}
                                </Text>
                              </TouchableOpacity>

                              {categorySubcategories.length > 0 && (
                                <TouchableOpacity
                                  onPress={() => toggleCategory(category.id)}
                                  style={styles.expandButton}
                                >
                                  <ChevronDown
                                    size={20}
                                    color="#9CA3AF"
                                    style={{
                                      transform: [{ rotate: isCategoryExpanded ? '180deg' : '0deg' }]
                                    }}
                                  />
                                </TouchableOpacity>
                              )}
                            </View>

                            {/* Subcategories (shown when expanded) */}
                            {isCategoryExpanded && categorySubcategories.length > 0 && (
                              <View style={styles.subcategoryList}>
                                {categorySubcategories.map((subcategory) => {
                                  const isSubSelected = selectedSubcategoryIds.includes(subcategory.id);

                                  return (
                                    <TouchableOpacity
                                      key={subcategory.id}
                                      style={styles.subcategoryRow}
                                      onPress={() => toggleSubcategorySelection(subcategory.id, category.id)}
                                    >
                                      {isSubSelected ? (
                                        <CheckCircle size={20} color="#10B981" />
                                      ) : (
                                        <Circle size={20} color="#9CA3AF" />
                                      )}
                                      <Text style={[
                                        styles.subcategoryName,
                                        isSubSelected && styles.subcategoryNameSelected
                                      ]}>
                                        {subcategory.name}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                })}
                              </View>
                            )}
                          </View>
                        );
                      })}
                    </View>
                  )}
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
                        <ActivityIndicator size="small" color="#111827" />
                      ) : (
                        <>
                          <Barcode size={16} color="#111827" />
                          <Text style={styles.scanButtonText}>Scan</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter or scan barcode"
                    placeholderTextColor="#9CA3AF"
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
            )}
          </View>

          {/* Quantity & Storage Section */}
          <View style={styles.section}>
            <SectionHeader
              title="Quantity & Storage"
              sectionKey="storage"
              isExpanded={expandedSection === "storage"}
              hasError={validationErrors.has("quantity") || validationErrors.has("locationEntries")}
              onPress={() => toggleSection("storage")}
            />

            {expandedSection === "storage" && (
              <View style={styles.sectionContent}>
                {/* Storage Type Toggle */}
                <View style={styles.field}>
                  <Text style={styles.label}>Storage Type</Text>
                  <View style={styles.storageTypeButtons}>
                    <TouchableOpacity
                      style={[
                        styles.storageTypeButton,
                        storageType === "single-location" && styles.storageTypeButtonActive,
                      ]}
                      onPress={() => setStorageType("single-location")}
                    >
                      <Text
                        style={[
                          styles.storageTypeButtonText,
                          storageType === "single-location" && styles.storageTypeButtonTextActive,
                        ]}
                      >
                        Single Location
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.storageTypeButton,
                        storageType === "multi-location" && styles.storageTypeButtonActive,
                      ]}
                      onPress={() => setStorageType("multi-location")}
                    >
                      <Text
                        style={[
                          styles.storageTypeButtonText,
                          storageType === "multi-location" && styles.storageTypeButtonTextActive,
                        ]}
                      >
                        Multiple Locations
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Single Location Fields */}
                {storageType === "single-location" && (
                  <>
                    <View style={styles.row}>
                      <View style={[styles.field, styles.fieldHalf]}>
                        <Text style={styles.label}>
                          Quantity <Text style={styles.required}>*</Text>
                        </Text>
                        <TextInput
                          style={[
                            styles.input,
                            validationErrors.has("quantity") && styles.inputError,
                          ]}
                          placeholder="0"
                          placeholderTextColor="#9CA3AF"
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
                        {(["fridge", "freezer", "pantry", "cabinet"] as FoodLocation[]).map((loc) => (
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
                        placeholderTextColor="#9CA3AF"
                        value={restockThreshold}
                        onChangeText={setRestockThreshold}
                        keyboardType="numeric"
                      />
                    </View>
                  </>
                )}

                {/* Multi-Location Fields */}
                {storageType === "multi-location" && (
                  <>
                    <View style={styles.field}>
                      <Text style={styles.label}>Unit</Text>
                      <TouchableOpacity style={styles.pickerButton} onPress={() => setShowUnitPicker(true)}>
                        <Text style={styles.pickerButtonText}>{unit}</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Requires Refrigeration Toggle */}
                    <View style={styles.field}>
                      <View style={styles.toggleRow}>
                        <View>
                          <Text style={styles.label}>Requires Refrigeration</Text>
                          <Text style={styles.helpText}>
                            Does this item need to be kept cold?
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.toggle,
                            requiresRefrigeration && styles.toggleActive,
                          ]}
                          onPress={() => setRequiresRefrigeration(!requiresRefrigeration)}
                        >
                          <View
                            style={[
                              styles.toggleThumb,
                              requiresRefrigeration && styles.toggleThumbActive,
                            ]}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Location Entries */}
                    <View style={styles.field}>
                      <View style={styles.labelRow}>
                        <Text style={styles.label}>
                          Locations <Text style={styles.required}>*</Text>
                        </Text>
                        <TouchableOpacity
                          style={styles.addLocationButton}
                          onPress={addLocationEntry}
                        >
                          <Plus size={16} color="#FFFFFF" />
                          <Text style={styles.addLocationButtonText}>Add</Text>
                        </TouchableOpacity>
                      </View>

                      {locationEntries.length === 0 && (
                        <Text style={styles.emptyText}>
                          No locations added yet. Tap "Add" to create one.
                        </Text>
                      )}

                      {validationErrors.has("locationEntries") && locationEntries.length === 0 && (
                        <View style={styles.errorBox}>
                          <Text style={styles.errorText}>Please add at least one location</Text>
                        </View>
                      )}

                      {locationEntries.map((entry) => (
                        <View key={entry.id} style={styles.locationEntryCard}>
                          <View style={styles.locationEntryHeader}>
                            <View style={styles.locationEntryField}>
                              <Text style={styles.locationEntryLabel}>Location</Text>
                              <View style={styles.locationEntryButtons}>
                                {(["fridge", "freezer", "pantry", "cabinet"] as FoodLocation[]).map((loc) => (
                                  <TouchableOpacity
                                    key={loc}
                                    style={[
                                      styles.locationEntryButton,
                                      entry.location === loc && styles.locationEntryButtonActive,
                                    ]}
                                    onPress={() => updateLocationEntry(entry.id, { location: loc })}
                                  >
                                    <Text
                                      style={[
                                        styles.locationEntryButtonText,
                                        entry.location === loc && styles.locationEntryButtonTextActive,
                                      ]}
                                    >
                                      {loc.charAt(0).toUpperCase() + loc.slice(1)}
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </View>

                            <TouchableOpacity
                              style={styles.removeLocationButton}
                              onPress={() => removeLocationEntry(entry.id)}
                            >
                              <Trash2 size={18} color="#EF4444" />
                            </TouchableOpacity>
                          </View>

                          <View style={styles.locationEntryRow}>
                            <View style={[styles.locationEntryField, { flex: 1 }]}>
                              <Text style={styles.locationEntryLabel}>Quantity</Text>
                              <TextInput
                                style={styles.locationEntryInput}
                                placeholder="0"
                                placeholderTextColor="#9CA3AF"
                                value={entry.quantity}
                                onChangeText={(value) => updateLocationEntry(entry.id, { quantity: value })}
                                keyboardType="numeric"
                              />
                            </View>

                            <View style={[styles.locationEntryField, { flex: 1 }]}>
                              <Text style={styles.locationEntryLabel}>Status</Text>
                              <View style={styles.locationEntryButtons}>
                                <TouchableOpacity
                                  style={[
                                    styles.statusButton,
                                    entry.isReadyToConsume && styles.statusButtonActive,
                                  ]}
                                  onPress={() => updateLocationEntry(entry.id, { isReadyToConsume: true })}
                                >
                                  <Text
                                    style={[
                                      styles.statusButtonText,
                                      entry.isReadyToConsume && styles.statusButtonTextActive,
                                    ]}
                                  >
                                    Ready
                                  </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[
                                    styles.statusButton,
                                    !entry.isReadyToConsume && styles.statusButtonActive,
                                  ]}
                                  onPress={() => updateLocationEntry(entry.id, { isReadyToConsume: false })}
                                >
                                  <Text
                                    style={[
                                      styles.statusButtonText,
                                      !entry.isReadyToConsume && styles.statusButtonTextActive,
                                    ]}
                                  >
                                    Storage
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          </View>

                          <View style={styles.locationEntryField}>
                            <Text style={styles.locationEntryLabel}>Notes (optional)</Text>
                            <TextInput
                              style={styles.locationEntryInput}
                              placeholder="e.g., Bottom shelf, left side"
                              placeholderTextColor="#9CA3AF"
                              value={entry.notes}
                              onChangeText={(value) => updateLocationEntry(entry.id, { notes: value })}
                            />
                          </View>
                        </View>
                      ))}
                    </View>

                    {/* Threshold Fields */}
                    <View style={styles.row}>
                      <View style={[styles.field, styles.fieldHalf]}>
                        <Text style={styles.label}>Ready Threshold</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Min ready qty"
                          placeholderTextColor="#9CA3AF"
                          value={fridgeRestockThreshold}
                          onChangeText={setFridgeRestockThreshold}
                          keyboardType="numeric"
                        />
                        <Text style={styles.helpText}>
                          Move from storage when ready qty is low
                        </Text>
                      </View>

                      <View style={[styles.field, styles.fieldHalf]}>
                        <Text style={styles.label}>Total Threshold</Text>
                        <TextInput
                          style={styles.input}
                          placeholder="Min total qty"
                          placeholderTextColor="#9CA3AF"
                          value={totalRestockThreshold}
                          onChangeText={setTotalRestockThreshold}
                          keyboardType="numeric"
                        />
                        <Text style={styles.helpText}>
                          Add to shopping list when total is low
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>
            )}
          </View>

          {/* Nutritional Information Section */}
          <View style={styles.section}>
            <SectionHeader
              title="Nutritional Information"
              sectionKey="nutrition"
              isExpanded={expandedSection === "nutrition"}
              hasError={false}
              onPress={() => toggleSection("nutrition")}
            />

            {expandedSection === "nutrition" && (
              <View style={styles.sectionContent}>
                <View style={styles.row}>
                  <View style={[styles.field, styles.fieldHalf]}>
                    <Text style={styles.label}>Calories</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="0"
                      placeholderTextColor="#9CA3AF"
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
                      placeholderTextColor="#9CA3AF"
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
                      placeholderTextColor="#9CA3AF"
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
                      placeholderTextColor="#9CA3AF"
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
                      placeholderTextColor="#9CA3AF"
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
                      placeholderTextColor="#9CA3AF"
                      value={sugars}
                      onChangeText={setSugars}
                      keyboardType="decimal-pad"
                    />
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* Expiration Section */}
          <View style={styles.section}>
            <SectionHeader
              title="Expiration"
              sectionKey="expiration"
              isExpanded={expandedSection === "expiration"}
              hasError={false}
              onPress={() => toggleSection("expiration")}
            />

            {expandedSection === "expiration" && (
              <View style={styles.sectionContent}>
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
              </View>
            )}
          </View>

          {/* Images Section */}
          <View style={styles.section}>
            <SectionHeader
              title="Product Images"
              sectionKey="images"
              isExpanded={expandedSection === "images"}
              hasError={false}
              onPress={() => toggleSection("images")}
            />

            {expandedSection === "images" && (
              <View style={styles.sectionContent}>
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
                            <Camera size={32} color="#9CA3AF" />
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
            )}
          </View>

          {/* Notes Section */}
          <View style={styles.section}>
            <SectionHeader
              title="Notes"
              sectionKey="notes"
              isExpanded={expandedSection === "notes"}
              hasError={false}
              onPress={() => toggleSection("notes")}
            />

            {expandedSection === "notes" && (
              <View style={styles.sectionContent}>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Additional notes..."
                  placeholderTextColor="#9CA3AF"
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
              </View>
            )}
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

        {/* Date Picker Modal */}
        {showDatePicker && Platform.OS === "ios" && (
          <Modal transparent visible={showDatePicker} animationType="fade">
            <TouchableOpacity
              style={styles.datePickerModal}
              activeOpacity={1}
              onPress={() => setShowDatePicker(false)}
            >
              <View style={styles.datePickerModalContent}>
                <View style={styles.datePickerHeader}>
                  <Text style={styles.datePickerTitle}>Expiration Date</Text>
                  <TouchableOpacity onPress={() => setShowDatePicker(false)}>
                    <Text style={styles.datePickerDone}>Done</Text>
                  </TouchableOpacity>
                </View>
                <DateTimePicker
                  value={expirationDate || new Date()}
                  mode="date"
                  display="spinner"
                  textColor="#000000"
                  onChange={(event, selectedDate) => {
                    if (selectedDate) {
                      setExpirationDate(selectedDate);
                    }
                  }}
                />
              </View>
            </TouchableOpacity>
          </Modal>
        )}

        {/* Android Date Picker */}
        {showDatePicker && Platform.OS === "android" && (
          <DateTimePicker
            value={expirationDate || new Date()}
            mode="date"
            display="default"
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) {
                setExpirationDate(selectedDate);
              }
            }}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#1F2937",
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: "#FFFFFF",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  content: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  section: {
    backgroundColor: "#FFFFFF",
    marginTop: 8,
    borderRadius: 0,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
  },
  sectionHeaderError: {
    backgroundColor: "#FEF2F2",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  sectionTitleError: {
    color: "#EF4444",
  },
  sectionContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
    backgroundColor: "#FFFFFF",
  },
  sectionSubtitle: {
    fontSize: 14,
    color: "#6B7280",
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
    color: "#111827",
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
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
  },
  inputError: {
    borderColor: "#EF4444",
    borderWidth: 2,
  },
  textArea: {
    height: 100,
    paddingTop: 12,
  },
  pickerButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  pickerButtonText: {
    fontSize: 16,
    color: "#111827",
  },
  placeholder: {
    color: "#9CA3AF",
  },
  scanButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
  },
  scanButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  locationButtons: {
    flexDirection: "row",
    gap: 8,
  },
  locationButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  locationButtonActive: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  locationButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  locationButtonTextActive: {
    color: "#FFFFFF",
  },
  storageTypeButtons: {
    flexDirection: "row",
    gap: 8,
  },
  storageTypeButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  storageTypeButtonActive: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  storageTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  storageTypeButtonTextActive: {
    color: "#FFFFFF",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toggle: {
    width: 51,
    height: 31,
    borderRadius: 15.5,
    backgroundColor: "#E5E7EB",
    padding: 2,
    justifyContent: "center",
  },
  toggleActive: {
    backgroundColor: "#8B5CF6",
  },
  toggleThumb: {
    width: 27,
    height: 27,
    borderRadius: 13.5,
    backgroundColor: "#FFFFFF",
  },
  toggleThumbActive: {
    transform: [{ translateX: 20 }],
  },
  helpText: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  addLocationButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#8B5CF6",
    borderRadius: 6,
  },
  addLocationButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  emptyText: {
    fontSize: 14,
    color: "#6B7280",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 16,
  },
  errorBox: {
    backgroundColor: "#FEE2E2",
    borderWidth: 1,
    borderColor: "#EF4444",
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: "#EF4444",
    fontWeight: "600",
    textAlign: "center",
  },
  locationEntryCard: {
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  locationEntryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  locationEntryRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  locationEntryField: {
    flex: 1,
  },
  locationEntryLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 6,
  },
  locationEntryButtons: {
    flexDirection: "row",
    gap: 6,
  },
  locationEntryButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  locationEntryButtonActive: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  locationEntryButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  locationEntryButtonTextActive: {
    color: "#FFFFFF",
  },
  locationEntryInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: "#111827",
  },
  removeLocationButton: {
    padding: 4,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    alignItems: "center",
  },
  statusButtonActive: {
    backgroundColor: "#10B981",
    borderColor: "#10B981",
  },
  statusButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#111827",
  },
  statusButtonTextActive: {
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
    backgroundColor: "#F9FAFB",
    borderWidth: 2,
    borderColor: "#E5E7EB",
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
    color: "#9CA3AF",
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
    borderTopColor: "#E5E7EB",
    backgroundColor: "#FFFFFF",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  buttonSecondary: {
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  buttonSecondaryText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
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
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    maxHeight: "50%",
  },
  pickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    textAlign: "center",
    marginBottom: 16,
  },
  pickerOption: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  pickerOptionText: {
    fontSize: 16,
    color: "#111827",
  },
  pickerClose: {
    paddingVertical: 16,
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
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
  datePickerModal: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  datePickerModalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: "100%",
    paddingBottom: 34,
  },
  datePickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#000000",
  },
  datePickerDone: {
    fontSize: 16,
    fontWeight: "600",
    color: "#8B5CF6",
  },
  // Category/Subcategory Styles
  categoryList: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    backgroundColor: "#FFFFFF",
  },
  categoryItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: "#FFFFFF",
  },
  categoryCheckbox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
  },
  categoryNameSelected: {
    color: "#8B5CF6",
  },
  expandButton: {
    padding: 4,
  },
  subcategoryList: {
    paddingLeft: 24,
    paddingRight: 12,
    paddingBottom: 8,
    backgroundColor: "#F9FAFB",
  },
  subcategoryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginTop: 6,
    backgroundColor: "#FFFFFF",
  },
  subcategoryName: {
    fontSize: 14,
    color: "#374151",
  },
  subcategoryNameSelected: {
    color: "#10B981",
    fontWeight: "600",
  },
});
