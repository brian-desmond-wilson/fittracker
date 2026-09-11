import { useEffect, useState } from "react";
import { Stack, useRouter, useSegments } from "expo-router";
import { useShareIntent } from "expo-share-intent";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { StatusBar } from "expo-status-bar";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { supabase } from "@/src/lib/supabase";
import { AppVersion } from "@/src/components/ui";
import type { Session } from "@supabase/supabase-js";

// Dev-only. Expo Router persists the current URL, so a full reload re-opens
// whatever screen you were on (e.g. an exercise detail page) rather than Home.
// This module-scope flag is reset only when the JS bundle is fully re-evaluated
// — a real reload — and NOT by Fast Refresh of other files, so editing code
// keeps you in place while a reload lands you back on Home.
let didColdBootReset = false;

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

  // A post shared from Instagram/TikTok via the iOS share sheet lands here
  // and is routed straight into the EXISTING capture flow — the training
  // screen opens the capture sheet with the URL prefilled. Signed out, the
  // auth redirect above wins and the share is dropped rather than queued.
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (loading || !hasShareIntent) return;
    const url = shareIntent.webUrl ?? shareIntent.text ?? null;
    resetShareIntent();
    if (url && session) {
      router.push({ pathname: "/(tabs)/training", params: { shareUrl: url } });
    }
    // resetShareIntent/shareIntent identities churn with the intent itself;
    // hasShareIntent is the one signal that matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasShareIntent, loading, session]);

  // On a real reload in dev, start from Home instead of the restored route.
  // Once per bundle evaluation; a shared post still wins, and production is
  // untouched so genuine deep links open where they should.
  useEffect(() => {
    if (loading || !session || hasShareIntent) return;
    if (!__DEV__ || didColdBootReset) return;
    didColdBootReset = true;
    router.replace("/(tabs)/home");
  }, [loading, session, hasShareIntent]);

  if (loading) {
    // The native splash is a static image, so this first rendered frame is
    // where "which build is this" can actually be answered (owner decision
    // 2026-08-26).
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#22C55E" />
        <AppVersion />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <ActionSheetProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
        </Stack>
      </ActionSheetProvider>
    </GestureHandlerRootView>
  );
}
