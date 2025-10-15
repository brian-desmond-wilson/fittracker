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
import { PreferencesScreen } from "@/src/components/profile/PreferencesScreen";
import { NotificationsScreen } from "@/src/components/profile/NotificationsScreen";
import { PrivacySecurityScreen } from "@/src/components/profile/PrivacySecurityScreen";
import { HelpSupportScreen } from "@/src/components/profile/HelpSupportScreen";
import { AboutScreen } from "@/src/components/profile/AboutScreen";
import { DevTaskManager } from "@/src/components/profile/DevTaskManager";

type ModalScreen =
  | "profile"
  | "goals"
  | "routines"
  | "preferences"
  | "notifications"
  | "privacy"
  | "help"
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
        onPreferencesPress={() => setActiveModal("preferences")}
        onNotificationsPress={() => setActiveModal("notifications")}
        onPrivacyPress={() => setActiveModal("privacy")}
        onHelpPress={() => setActiveModal("help")}
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

      {/* Preferences Modal */}
      <Modal
        visible={activeModal === "preferences"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <PreferencesScreen onClose={() => setActiveModal(null)} />
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

      {/* Privacy & Security Modal */}
      <Modal
        visible={activeModal === "privacy"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <PrivacySecurityScreen onClose={() => setActiveModal(null)} />
      </Modal>

      {/* Help & Support Modal */}
      <Modal
        visible={activeModal === "help"}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent={false}
        onRequestClose={() => setActiveModal(null)}
      >
        <HelpSupportScreen onClose={() => setActiveModal(null)} />
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
          <SafeAreaView style={styles.devTasksContainer} edges={['top']}>
            <DevTaskManager userId={userId} />
          </SafeAreaView>
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
