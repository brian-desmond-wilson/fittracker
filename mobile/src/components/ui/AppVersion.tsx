// The one answer to "which build am I running?" (owner decision 2026-08-26).
//
// Reads the NATIVE version and build number via expo-application rather than
// the JS config: with EAS managing the build number remotely, the config's
// copy can trail what was actually stamped into the binary, and the native
// values are the ones TestFlight shows. The variant tag comes from the
// runtime config name, so the same component says "· Local" on the dev app
// and nothing on the TestFlight one — no second source of truth to drift.
import React from "react";
import { StyleSheet, Text } from "react-native";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { colors, spacing, typography } from "@/src/theme/tokens";

const isLocal = Constants.expoConfig?.name === "FitTracker Local";

export const APP_VERSION_LABEL = `v${Application.nativeApplicationVersion ?? "?"} (${
  Application.nativeBuildVersion ?? "?"
})${isLocal ? " · Local" : ""}`;

export function AppVersion() {
  return <Text style={styles.text}>{APP_VERSION_LABEL}</Text>;
}

const styles = StyleSheet.create({
  text: {
    ...typography.caption,
    color: colors.textFaint,
    textAlign: "center",
    marginTop: spacing.xl,
  },
});
