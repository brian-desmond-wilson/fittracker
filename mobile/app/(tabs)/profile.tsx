import { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { User, Mail, ShieldCheck } from "lucide-react-native";
import * as SecureStore from "expo-secure-store";
import { SafeAreaView } from "react-native-safe-area-context";
import { DevTaskManager } from "@/src/components/profile/DevTaskManager";

interface Profile {
  full_name: string | null;
  height_cm: number | null;
  target_weight_kg: number | null;
  target_calories: number | null;
  is_admin: boolean;
}

export default function Profile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);

  const [formData, setFormData] = useState({
    full_name: "",
    height_cm: "",
    target_weight_kg: "",
    target_calories: "",
  });

  useEffect(() => {
    loadUserData();
  }, []);

  async function loadUserData() {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/(auth)/sign-in");
        return;
      }

      setUserEmail(user.email || "");
      setUserId(user.id);
      setMemberSince(
        new Date(user.created_at).toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })
      );

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profile) {
        setIsAdmin(profile.is_admin || false);
        setFormData({
          full_name: profile.full_name || "",
          height_cm: profile.height_cm?.toString() || "",
          target_weight_kg: profile.target_weight_kg?.toString() || "",
          target_calories: profile.target_calories?.toString() || "",
        });
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name || null,
          height_cm: formData.height_cm ? parseFloat(formData.height_cm) : null,
          target_weight_kg: formData.target_weight_kg
            ? parseFloat(formData.target_weight_kg)
            : null,
          target_calories: formData.target_calories
            ? parseInt(formData.target_calories)
            : null,
        })
        .eq("id", userId);

      if (error) throw error;

      // Reload data to show updated values
      await loadUserData();
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      const keysToDelete = [
        'supabase.auth.token',
        'sb-tffxvrjvkhpyxsagrjga-auth-token',
        `sb-${process.env.EXPO_PUBLIC_SUPABASE_URL?.split('//')[1]?.split('.')[0]}-auth-token`
      ];

      for (const key of keysToDelete) {
        try {
          await SecureStore.deleteItemAsync(key);
        } catch (e) {
          // Key might not exist, that's OK
        }
      }

      try {
        await supabase.auth.signOut();
      } catch (error) {
        // Ignore sign out errors
      }

      router.replace("/(auth)/sign-in");
    } catch (error) {
      router.replace("/(auth)/sign-in");
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22C55E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* User Profile Card */}
          <View style={styles.card}>
            <View style={styles.userHeader}>
              <View style={styles.avatarCircle}>
                <User size={40} color="#22C55E" strokeWidth={2} />
              </View>
              <View style={styles.userInfo}>
                <Text style={styles.userName}>
                  {formData.full_name || "User"}
                </Text>
                <View style={styles.emailRow}>
                  <Mail size={16} color="#9CA3AF" />
                  <Text style={styles.userEmail}>{userEmail}</Text>
                </View>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.memberSection}>
              <Text style={styles.memberLabel}>Member since</Text>
              <Text style={styles.memberDate}>{memberSince}</Text>
            </View>

            {isAdmin && (
              <View style={styles.adminBadge}>
                <ShieldCheck size={16} color="#22C55E" />
                <Text style={styles.adminBadgeText}>Administrator access</Text>
              </View>
            )}
          </View>

          {/* Personal Information & Goals Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personal Information & Goals</Text>

            <View style={styles.formField}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Brian Wilson"
                placeholderTextColor="#6B7280"
                value={formData.full_name}
                onChangeText={(text) =>
                  setFormData({ ...formData, full_name: text })
                }
                editable={!saving}
              />
            </View>

            <View style={styles.row}>
              <View style={styles.halfField}>
                <Text style={styles.label}>Height (cm)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="175"
                  placeholderTextColor="#6B7280"
                  value={formData.height_cm}
                  onChangeText={(text) =>
                    setFormData({ ...formData, height_cm: text })
                  }
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
              </View>

              <View style={styles.halfField}>
                <Text style={styles.label}>Target Weight (kg)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="70"
                  placeholderTextColor="#6B7280"
                  value={formData.target_weight_kg}
                  onChangeText={(text) =>
                    setFormData({ ...formData, target_weight_kg: text })
                  }
                  keyboardType="decimal-pad"
                  editable={!saving}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Daily Calorie Goal</Text>
              <TextInput
                style={styles.input}
                placeholder="2000"
                placeholderTextColor="#6B7280"
                value={formData.target_calories}
                onChangeText={(text) =>
                  setFormData({ ...formData, target_calories: text })
                }
                keyboardType="number-pad"
                editable={!saving}
              />
            </View>

            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.saveButtonText}>Save Changes</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Dev Notebook - Admin Only */}
          {isAdmin && <DevTaskManager userId={userId} />}

          {/* Sign Out Button */}
          <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
            <Text style={styles.signOutButtonText}>Sign Out</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#0A0F1E",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0F1E",
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },
  card: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#1F2937",
  },
  userHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginBottom: 24,
  },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(34, 197, 94, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginBottom: 4,
  },
  emailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  userEmail: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  divider: {
    height: 1,
    backgroundColor: "#1F2937",
    marginBottom: 16,
  },
  memberSection: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  memberLabel: {
    fontSize: 14,
    color: "#9CA3AF",
  },
  memberDate: {
    fontSize: 14,
    fontWeight: "500",
    color: "#FFFFFF",
  },
  adminBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(34, 197, 94, 0.3)",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 16,
  },
  adminBadgeText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#22C55E",
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#FFFFFF",
    marginBottom: 16,
  },
  formField: {
    marginBottom: 16,
  },
  row: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 16,
  },
  halfField: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    color: "#D1D5DB",
    marginBottom: 8,
  },
  input: {
    backgroundColor: "#1F2937",
    borderWidth: 1,
    borderColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#FFFFFF",
  },
  saveButton: {
    backgroundColor: "#22C55E",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  signOutButton: {
    backgroundColor: "#7F1D1D",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 16,
  },
  signOutButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
});
