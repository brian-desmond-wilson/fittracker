import { View, ScrollView, StyleSheet, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors } from "@/src/lib/colors";

interface ThemedScreenProps {
  children: React.ReactNode;
  scrollable?: boolean;
  style?: ViewStyle;
}

export function ThemedScreen({
  children,
  scrollable = true,
  style,
}: ThemedScreenProps) {
  return (
    <SafeAreaView style={[styles.container, style]}>
      {scrollable ? (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {children}
        </ScrollView>
      ) : (
        <View style={styles.content}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
});
