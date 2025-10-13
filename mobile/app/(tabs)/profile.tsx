import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/src/lib/supabase";
import { ThemedScreen } from "@/src/components/ThemedScreen";
import { colors } from "@/src/lib/colors";

export default function Profile() {
  const router = useRouter();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/(auth)/sign-in");
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
