import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StatusBar,
  Alert,
  Platform,
  Image,
  ActionSheetIOS,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ChevronLeft, Plus, Camera as CameraIcon, Trash2, Calendar } from "lucide-react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { colors } from "@/src/lib/colors";
import { ProgressPhoto, ViewType } from "@/src/types/track";
import { supabase } from "@/src/lib/supabase";

interface ProgressPhotosScreenProps {
  onClose: () => void;
}

export function ProgressPhotosScreen({ onClose }: ProgressPhotosScreenProps) {
  const insets = useSafeAreaInsets();
  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);

  // Form fields
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [viewType, setViewType] = useState<ViewType>("front");
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, []);

  const fetchPhotos = async () => {
    try {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to view progress photos");
        return;
      }

      // Fetch photos from last 180 days (6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setDate(sixMonthsAgo.getDate() - 180);
      const startDate = sixMonthsAgo.toISOString().split("T")[0];

      const { data, error } = await supabase
        .from("progress_photos")
        .select("*")
        .eq("user_id", user.id)
        .gte("date", startDate)
        .order("date", { ascending: false })
        .order("created_at", { ascending: false});

      if (error) throw error;

      setPhotos(data || []);
    } catch (error: any) {
      console.error("Error fetching progress photos:", error);
      Alert.alert("Error", "Failed to load progress photos");
    } finally {
      setLoading(false);
    }
  };

  const requestPermissions = async () => {
    const cameraPermission = await ImagePicker.requestCameraPermissionsAsync();
    const mediaLibraryPermission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!cameraPermission.granted || !mediaLibraryPermission.granted) {
      Alert.alert(
        "Permissions Required",
        "Camera and photo library access are required to upload photos."
      );
      return false;
    }
    return true;
  };

  const pickPhoto = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

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
              aspect: [3, 4],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
            }
          } else if (buttonIndex === 2) {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [3, 4],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
            }
          }
        }
      );
    } else {
      Alert.alert("Select Photo", "Choose an option", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Take Photo",
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [3, 4],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
            }
          },
        },
        {
          text: "Choose from Library",
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [3, 4],
              quality: 0.8,
            });
            if (!result.canceled && result.assets[0]) {
              setPhotoUri(result.assets[0].uri);
            }
          },
        },
      ]);
    }
  };

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return null;

      // Create unique filename
      const fileExt = uri.split(".").pop()?.split("?")[0] || "jpg";
      const timestamp = Date.now();
      const fileName = `${user.id}/${timestamp}_${viewType}.${fileExt}`;
      const filePath = `progress-photos/${fileName}`;

      // Use FormData to upload the file
      const formData = new FormData();
      formData.append("file", {
        uri: uri,
        type: "image/jpeg",
        name: `${viewType}.jpg`,
      } as any);

      // Get Supabase storage upload URL
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        console.error("No session available");
        return null;
      }

      // Upload using fetch with FormData
      const uploadUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/progress-photos/${filePath}`;

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

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from("progress-photos").getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error("Photo upload failed:", error);
      return null;
    }
  };

  const resetForm = () => {
    setSelectedDate(new Date());
    setViewType("front");
    setPhotoUri(null);
    setNotes("");
  };

  const handleAddPhoto = async () => {
    if (!photoUri) {
      Alert.alert("No Photo", "Please select a photo first");
      return;
    }

    try {
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        Alert.alert("Error", "You must be logged in to add photos");
        return;
      }

      // Upload photo
      const photoUrl = await uploadPhoto(photoUri);

      if (!photoUrl) {
        Alert.alert("Upload Error", "Failed to upload photo");
        return;
      }

      // Save to database
      const { error } = await supabase.from("progress_photos").insert([
        {
          user_id: user.id,
          date: selectedDate.toISOString().split("T")[0],
          photo_url: photoUrl,
          view_type: viewType,
          notes: notes.trim() || null,
          created_at: new Date().toISOString(),
        },
      ]);

      if (error) throw error;

      resetForm();
      setShowAddForm(false);
      await fetchPhotos();
      Alert.alert("Success", "Progress photo added successfully");
    } catch (error: any) {
      console.error("Error adding photo:", error);
      Alert.alert("Error", "Failed to add progress photo");
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    Alert.alert("Delete Photo", "Are you sure you want to delete this progress photo?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            const { error } = await supabase.from("progress_photos").delete().eq("id", photoId);

            if (error) throw error;

            await fetchPhotos();
          } catch (error: any) {
            console.error("Error deleting photo:", error);
            Alert.alert("Error", "Failed to delete progress photo");
          }
        },
      },
    ]);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const getViewTypeLabel = (type: ViewType | null) => {
    if (!type) return "";
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  // Group photos by date
  const groupedPhotos: Record<string, ProgressPhoto[]> = {};
  photos.forEach((photo) => {
    if (!groupedPhotos[photo.date]) {
      groupedPhotos[photo.date] = [];
    }
    groupedPhotos[photo.date].push(photo);
  });

  const sortedDates = Object.keys(groupedPhotos).sort((a, b) => b.localeCompare(a));

  return (
    <>
      <StatusBar barStyle="light-content" />
      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ChevronLeft size={24} color="#FFFFFF" />
            <Text style={styles.backText}>Track</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Title */}
          <View style={styles.titleContainer}>
            <CameraIcon size={32} color="#F59E0B" strokeWidth={2} />
            <Text style={styles.pageTitle}>Progress Photos</Text>
          </View>

          {/* Add Button */}
          {!showAddForm && (
            <View style={styles.addButtonContainer}>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.7}
              >
                <Plus size={20} color="#FFFFFF" />
                <Text style={styles.addButtonText}>Add Progress Photo</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Add Form */}
          {showAddForm && (
            <View style={styles.addSection}>
              <Text style={styles.sectionTitle}>Add Progress Photo</Text>

              {/* Date Selector */}
              <View style={styles.field}>
                <Text style={styles.label}>Date</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowDatePicker(true)}
                >
                  <Calendar size={16} color={colors.foreground} />
                  <Text style={styles.dateButtonText}>
                    {selectedDate.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </Text>
                </TouchableOpacity>
              </View>

              {showDatePicker && (
                <DateTimePicker
                  value={selectedDate}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={(event, date) => {
                    setShowDatePicker(Platform.OS === "ios");
                    if (date) {
                      setSelectedDate(date);
                    }
                  }}
                  maximumDate={new Date()}
                />
              )}

              {/* View Type Selector */}
              <View style={styles.field}>
                <Text style={styles.label}>View Type</Text>
                <View style={styles.viewTypeButtons}>
                  {(["front", "side", "back"] as ViewType[]).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.viewTypeButton,
                        viewType === type && styles.viewTypeButtonActive,
                      ]}
                      onPress={() => setViewType(type)}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.viewTypeButtonText,
                          viewType === type && styles.viewTypeButtonTextActive,
                        ]}
                      >
                        {getViewTypeLabel(type)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Photo Picker */}
              <View style={styles.field}>
                <Text style={styles.label}>Photo</Text>
                <TouchableOpacity
                  style={styles.photoPicker}
                  onPress={pickPhoto}
                  activeOpacity={0.7}
                >
                  {photoUri ? (
                    <Image source={{ uri: photoUri }} style={styles.selectedPhoto} />
                  ) : (
                    <View style={styles.photoPlaceholder}>
                      <CameraIcon size={40} color={colors.mutedForeground} />
                      <Text style={styles.photoPlaceholderText}>Tap to select photo</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Notes */}
              <View style={styles.field}>
                <Text style={styles.label}>Notes (optional)</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Add notes about this photo..."
                  placeholderTextColor={colors.mutedForeground}
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Form Buttons */}
              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={() => {
                    resetForm();
                    setShowAddForm(false);
                  }}
                  activeOpacity={0.7}
                  disabled={uploading}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.button, styles.saveButton, uploading && styles.buttonDisabled]}
                  onPress={handleAddPhoto}
                  activeOpacity={0.7}
                  disabled={uploading}
                >
                  <Text style={styles.saveButtonText}>
                    {uploading ? "Uploading..." : "Save Photo"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Photo Gallery */}
          <View style={styles.gallerySection}>
            <Text style={styles.sectionTitle}>Gallery</Text>
            {loading ? (
              <Text style={styles.loadingText}>Loading...</Text>
            ) : sortedDates.length === 0 ? (
              <Text style={styles.emptyText}>No progress photos yet. Add your first photo!</Text>
            ) : (
              sortedDates.map((date) => {
                const dayPhotos = groupedPhotos[date];

                return (
                  <View key={date} style={styles.dayGroup}>
                    <Text style={styles.dayDate}>{formatDate(date)}</Text>
                    <View style={styles.photoGrid}>
                      {dayPhotos.map((photo) => (
                        <View key={photo.id} style={styles.photoCard}>
                          <Image source={{ uri: photo.photo_url }} style={styles.photoImage} />
                          <View style={styles.photoOverlay}>
                            <Text style={styles.photoViewType}>
                              {getViewTypeLabel(photo.view_type)}
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleDeletePhoto(photo.id)}
                              style={styles.deletePhotoButton}
                              activeOpacity={0.7}
                            >
                              <Trash2 size={16} color="#FFFFFF" />
                            </TouchableOpacity>
                          </View>
                          {photo.notes && <Text style={styles.photoNotes}>{photo.notes}</Text>}
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Bottom Spacing */}
          <View style={{ height: 40 }} />
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 17,
    color: colors.foreground,
  },
  content: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: colors.foreground,
  },
  addButtonContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: "#F59E0B",
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  addSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 16,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 8,
  },
  dateButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 16,
    color: colors.foreground,
  },
  viewTypeButtons: {
    flexDirection: "row",
    gap: 8,
  },
  viewTypeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  viewTypeButtonActive: {
    backgroundColor: "#F59E0B",
    borderColor: "#F59E0B",
  },
  viewTypeButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.foreground,
  },
  viewTypeButtonTextActive: {
    color: "#FFFFFF",
  },
  photoPicker: {
    backgroundColor: colors.card,
    borderWidth: 2,
    borderColor: colors.border,
    borderRadius: 12,
    borderStyle: "dashed",
    overflow: "hidden",
    aspectRatio: 3 / 4,
  },
  selectedPhoto: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  photoPlaceholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  photoPlaceholderText: {
    marginTop: 12,
    fontSize: 14,
    color: colors.mutedForeground,
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
    height: 80,
    paddingTop: 12,
  },
  formButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 8,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
  },
  saveButton: {
    backgroundColor: "#F59E0B",
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  gallerySection: {
    paddingHorizontal: 20,
  },
  loadingText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 16,
    color: colors.mutedForeground,
    textAlign: "center",
    paddingVertical: 24,
  },
  dayGroup: {
    marginBottom: 24,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.foreground,
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  photoCard: {
    width: "48%",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: "hidden",
  },
  photoImage: {
    width: "100%",
    aspectRatio: 3 / 4,
    resizeMode: "cover",
  },
  photoOverlay: {
    position: "absolute",
    top: 8,
    left: 8,
    right: 8,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  photoViewType: {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#FFFFFF",
  },
  deletePhotoButton: {
    backgroundColor: "rgba(239, 68, 68, 0.9)",
    padding: 6,
    borderRadius: 16,
  },
  photoNotes: {
    padding: 8,
    fontSize: 12,
    color: colors.mutedForeground,
    lineHeight: 16,
  },
});
