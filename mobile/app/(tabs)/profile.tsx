import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { ThemedScreen } from "@/src/components/ThemedScreen";
import { colors } from "@/src/lib/colors";
import * as SecureStore from "expo-secure-store";
import { AppState } from "react-native";

export default function Profile() {
  const router = useRouter();

  async function handleSignOut() {
    try {
      // First, manually clear all storage to ensure clean state
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

      // Try to sign out from Supabase (ignore errors since session might be gone)
      try {
        await supabase.auth.signOut();
      } catch (error) {
        // Ignore sign out errors - session might already be invalid
      }

      // Force redirect to sign-in
      router.replace("/(auth)/sign-in");
    } catch (error) {
      // Still redirect even if there's an error
      router.replace("/(auth)/sign-in");
    }
  }

  return (
    <ThemedScreen>
      <View style={styles.container}>
        <Text style={styles.title}>
          User Profile
        </Text>
        <Text style={styles.subtitle}>
          Coming Soon
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={handleSignOut}
        >
          <Text style={styles.buttonText}>
            Sign Out
          </Text>
        </TouchableOpacity>
      </View>
    </ThemedScreen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: colors.foreground,
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  subtitle: {
    color: colors.mutedForeground,
    textAlign: "center",
    marginBottom: 32,
  },
  button: {
    backgroundColor: colors.destructive,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  buttonText: {
    color: colors.destructiveForeground,
    fontWeight: "600",
  },
});
