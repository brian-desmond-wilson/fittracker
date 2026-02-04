# React Native Migration Plan

This document tracks the high-level tasks required to deliver the new Expo/React Native client.

## Phase 0 – Foundation

- [ ] Create Expo Router scaffold (`mobile/`)
- [ ] Configure TypeScript, ESLint, NativeWind
- [ ] Wire Supabase client via Expo Secure Store
- [ ] Stub navigation scaffolding (tabs + auth stack)

## Phase 1 – Authentication & Session Shell

- [ ] Implement email/password sign in & registration flows
- [ ] Surface Supabase session state to the tab navigator
- [ ] Sync profile information on launch
- [ ] Graceful sign-out (clear Secure Store token)

## Phase 2 – Feature Porting

| Feature | Tasks |
|---------|-------|
| **Home Dashboard** | Fetch summary metrics, style cards, integrate highlights |
| **Schedule** | Build 24h timeline, drag & drop, event detail sheets |
| **Track** | Quick add forms, Dev Notebook quick entry |
| **Progress** | Charts (victory-native), filters, data caching |
| **Profile / Dev Notebook** | Collapsible sections, admin backlog tools |

## Phase 3 – Native Enhancements

- Expo push notifications (wired to existing Supabase edge job)
- Haptic feedback for interactions
- Deep links into specific schedule days (`fittracker://schedule?date=...`)

## Phase 4 – QA & Release

- Automated testing via `@testing-library/react-native`
- Device QA (iOS + Android)
- EAS build pipelines, TestFlight / Play Store Internal release

## Shared Utilities

We plan to keep shared TypeScript helpers under `packages/shared/` so the web and mobile apps can agree on Supabase row types, constants, and formatting utilities.

## Coordination Notes

- Web app remains at `/app2` and continues to evolve independently.
- Supabase schema changes should consider both clients moving forward.
- Keep the design system consistent across platforms (colors, typography). NativeWind makes it easy to port Tailwind tokens.
