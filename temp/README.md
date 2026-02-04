# FitTracker Mobile (Expo + React Native)

This directory contains the new React Native client built with Expo Router. It replaces the PWA shell on iOS/Android while the existing Next.js app continues to serve the web experience at `/app2`.

## Getting Started

```bash
cd mobile
npm install
npm run start       # launches Expo Dev Tools
```

Then scan the QR code with Expo Go or run one of:

- `npm run ios`
- `npm run android`
- `npm run web`

Environment variables live in `mobile/.env` (not committed). Create a copy of `.env.example` with:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Project Layout

- `app/` – Expo Router routes. Tabs live under `app/(tabs)`; auth flows under `app/(auth)`.
- `src/lib/supabase.ts` – shared Supabase client configured for Expo Secure Store persistence.
- `src/components/` – shared UI primitives (`ThemedScreen`, `TabBarIcon`, etc.).
- `tailwind.config.js` + `nativewind` – Tailwind-style styling for React Native.

## Next Steps

1. Implement Supabase auth flows (`sign-in`, `sign-up`, `magic link`).
2. Port the Home dashboard metrics.
3. Rebuild the 24-hour schedule view with `react-native-reanimated`.
4. Introduce offline caching / optimistic updates via `@tanstack/react-query` (optional).
5. Configure Expo EAS for TestFlight/Play Store builds.

Refer to `docs/mobile-plan.md` at the repository root for the detailed migration plan and architecture notes.
