# FitTracker

A personal, all-in-one fitness tracking app for iOS/Android, built with React Native (Expo) and Supabase.

## Features

- 💪 **Training** — program templates, workout logging (sets/reps/weight/difficulty), exercise & movement library, and CrossFit WODs/classes
- 🍎 **Meals** — meal logging with macros, barcode scanning (Open Food Facts), saved foods, templates, and insights (streaks, charts)
- 💧 **Water** — intake tracking with goals, pacing, and reminders
- ⚖️ **Body** — weight (with trend chart + reminders), measurements, and progress photos
- 🥫 **Food inventory** — multi-location pantry/fridge/freezer tracking with a shopping list
- 📅 **Schedule** — a day-view calendar with categories, templates, and notifications
- 🌅 **Morning routines** — checklist-driven daily routines
- 🔒 Supabase auth, with data synced live to Postgres

## Repository layout

| Path | What it is |
|------|-----------|
| [`mobile/`](mobile/) | **The app** — Expo / React Native (expo-router). Active development lives here. See [`mobile/README.md`](mobile/README.md) for setup. |
| [`supabase/`](supabase/) | Database schema, migrations, and edge functions (exercise/movement/WOD image generation, notification dispatch). |
| [`scripts/`](scripts/) | One-off tooling (e.g. bulk program import) and manually-run migrations. |

> **Note:** This repo previously contained a Next.js web app served at `/app2`. It has been removed — the mobile app is the single client and talks to Supabase directly.

## Getting started

The app is the Expo project in [`mobile/`](mobile/):

```bash
cd mobile
npm install
npx expo start          # dev server (use a dev client build for native modules)
```

See [`mobile/README.md`](mobile/README.md) for the full setup, and [`mobile/CLAUDE.md`](mobile/CLAUDE.md) for development conventions (safe areas, navigation, Supabase/RLS troubleshooting).

## Backend

Supabase provides Postgres, Auth, Storage, and Edge Functions. Database changes live in [`supabase/migrations/`](supabase/migrations/); manage them with the Supabase CLI (`npx supabase db push`, `npx supabase migration list`).
