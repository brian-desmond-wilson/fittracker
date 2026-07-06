import { useState, useEffect } from "react";
import {
  View,
  Modal,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import * as SecureStore from "expo-secure-store";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProfileMenu } from "@/src/components/profile/ProfileMenu";
import { ProfileScreen } from "@/src/components/profile/ProfileScreen";
import { GoalsScreen } from "@/src/components/profile/GoalsScreen";
import { RoutinesScreen } from "@/src/components/profile/RoutinesScreen";
import { NotificationsScreen } from "@/src/components/profile/NotificationsScreen";
import { AboutScreen } from "@/src/components/profile/AboutScreen";
import { DevTaskManager } from "@/src/components/profile/DevTaskManager";

type ModalScreen =
  | "profile"
  | "goals"
  | "routines"
  | "notifications"
  | "about"
  | "dev-tasks"
  | null;

export default function Profile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState("");
  const [userName, setUserName] = useState("");
  const [memberSince, setMemberSince] = useState("");
  const [userId, setUserId] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalScreen>(null);

  const [formData, setFormData] = useState({
    height_cm: "",
    target_weight_kg: "",
    target_calories: "",
    target_protein_g: "",
    target_carbs_g: "",
    target_sodium_mg: "",
    target_fats_g: "",
    target_sugars_g: "",
    target_fiber_g: "",
    target_water_oz: "",
    water_window_start: "08:00",
    water_window_end: "23:00",
    water_workout_bonus_oz: "0",
    water_display_unit: "oz" as "oz" | "L",
    water_only_counts: false,
    breakfast_time: "08:00",
    lunch_time: "12:00",
    dinner_time: "18:00",
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
        setUserName(profile.full_name || "");
        setFormData({
          height_cm: profile.height_cm?.toString() || "",
          target_weight_kg: profile.target_weight_kg?.toString() || "",
          target_calories: profile.target_calories?.toString() || "",
          target_protein_g: profile.target_protein_g?.toString() || "",
          target_carbs_g: profile.target_carbs_g?.toString() || "",
          target_sodium_mg: profile.target_sodium_mg?.toString() || "",
          target_fats_g: profile.target_fats_g?.toString() || "",
          target_sugars_g: profile.target_sugars_g?.toString() || "",
          target_fiber_g: profile.target_fiber_g?.toString() || "",
          target_water_oz: profile.target_water_oz?.toString() || "",
          water_window_start: (profile.water_window_start || "08:00").slice(0, 5),
          water_window_end: (profile.water_window_end || "23:00").slice(0, 5),
          water_workout_bonus_oz:
            profile.water_workout_bonus_oz != null
              ? profile.water_workout_bonus_oz.toString()
              : "0",
          water_display_unit:
            profile.water_display_unit === "L" ? "L" : "oz",
          water_only_counts: !!profile.water_only_counts,
          breakfast_time: (profile.breakfast_time || "08:00").slice(0, 5),
          lunch_time: (profile.lunch_time || "12:00").slice(0, 5),
          dinner_time: (profile.dinner_time || "18:00").slice(0, 5),
        });
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
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

  const handleGoalsSave = () => {
    loadUserData();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22C55E" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ProfileMenu
        isAdmin={isAdmin}
        onProfilePress={() => setActiveModal("profile")}
        onGoalsPress={() => setActiveModal("goals")}
        onRoutinesPress={() => setActiveModal("routines")}
        onNotificationsPress={() => setActiveModal("notifications")}
        onAboutPress={() => setActiveModal("about")}
        onDevTasksPress={() => setActiveModal("dev-tasks")}
        onSignOut={handleSignOut}
      />

      {/* Profile Modal */}
      <Modal
        visible={activeModal === "profile"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <ProfileScreen
          userName={userName}
          userEmail={userEmail}
          memberSince={memberSince}
          onClose={() => setActiveModal(null)}
        />
      </Modal>

      {/* Goals Modal */}
      <Modal
        visible={activeModal === "goals"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <GoalsScreen
          userId={userId}
          initialData={formData}
          onClose={() => setActiveModal(null)}
          onSave={handleGoalsSave}
        />
      </Modal>

      {/* Routines Modal */}
      <Modal
        visible={activeModal === "routines"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <RoutinesScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Notifications Modal */}
      <Modal
        visible={activeModal === "notifications"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <NotificationsScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* About Modal */}
      <Modal
        visible={activeModal === "about"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <AboutScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Development Tasks Modal */}
      {isAdmin && (
        <Modal
          visible={activeModal === "dev-tasks"}
          animationType="slide"
          presentationStyle="fullScreen"
          statusBarTranslucent={false}
          onRequestClose={() => setActiveModal(null)}
        >
          <DevTaskManager userId={userId} onClose={() => setActiveModal(null)} />
        </Modal>
      )}
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
  devTasksContainer: {
    flex: 1,
    backgroundColor: "#0A0F1E",
    padding: 16,
  },
});
