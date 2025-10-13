import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { supabase } from "@/src/lib/supabase";
import type { Session } from "@supabase/supabase-js";

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0A0F1E",
  },
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === "(auth)";
    const inTabsGroup = segments[0] === "(tabs)";

    // Re-check session from storage when navigating to auth group
    if (inAuthGroup && session) {
      // Double-check if session is really valid by checking storage
      supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
        if (currentSession) {
          // Session is valid, redirect to tabs
          router.replace("/(tabs)/home");
        } else {
          // Session is not valid, update state
          setSession(null);
        }
      });
      return;
    }

    if (!session && !inAuthGroup) {
      // Redirect to sign-in if not logged in
      router.replace("/(auth)/sign-in");
    } else if (!session && inTabsGroup) {
      // If session is null but we're in tabs, force redirect to sign-in
      router.replace("/(auth)/sign-in");
    }
  }, [session, segments, loading]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
      </Stack>
    </GestureHandlerRootView>
  );
}
