// Two apps, one codebase (owner decision 2026-08-26).
//
// The variant decides IDENTITY only — name, bundle id, URL scheme — never
// behavior or data: both apps run the same JS against the same cloud
// Supabase. "Local" means "code comes from the Metro server on the laptop",
// not "local data".
//
// The DEFAULT is the local variant, deliberately: every `expo start`,
// `expo run:ios` and `expo prebuild` on this machine should produce
// FitTracker Local unless a build explicitly claims the production identity
// (eas.json sets APP_VARIANT=production on the profiles that ship). Defaulting
// the other way would let an ordinary dev rebuild silently overwrite the
// TestFlight app on a plugged-in phone — same bundle id, same slot.
const IS_PRODUCTION = process.env.APP_VARIANT === "production";

module.exports = ({ config }) => {
  if (IS_PRODUCTION) return config;
  return {
    ...config,
    name: "FitTracker Local",
    scheme: "fittracker-local",
    ios: {
      ...config.ios,
      bundleIdentifier: "com.bwil0007.fittracker.local",
    },
    android: {
      ...config.android,
      package: "com.bwil0007.fittracker.local",
    },
  };
};
