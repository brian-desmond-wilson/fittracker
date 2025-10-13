import { View, Text, StyleSheet } from "react-native";
import { ThemedScreen } from "@/src/components/ThemedScreen";
import { colors } from "@/src/lib/colors";

export default function Home() {
  return (
    <ThemedScreen>
      <View style={styles.container}>
        <Text style={styles.title}>
          Welcome to FitTracker
        </Text>
        <Text style={styles.subtitle}>
          Your fitness journey starts here
        </Text>
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
  },
});
