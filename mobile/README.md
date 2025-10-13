# FitTracker Mobile App

Native mobile application for FitTracker built with Expo, React Native, and TypeScript.

## Tech Stack

- **Expo SDK 54** - React Native framework
- **Expo Router** - File-based navigation
- **NativeWind v2** - Tailwind CSS for React Native
- **Supabase** - Authentication and database
- **Lucide React Native** - Icon library
- **TypeScript** - Type safety

## Project Structure

```
mobile/
├── app/                    # Expo Router file-based routing
│   ├── _layout.tsx        # Root layout with auth logic
│   ├── index.tsx          # Entry point (redirects)
│   ├── (auth)/            # Authentication screens
│   │   ├── _layout.tsx
│   │   └── sign-in.tsx
│   └── (tabs)/            # Bottom tab navigation
│       ├── _layout.tsx
│       ├── home.tsx
│       ├── schedule.tsx
│       ├── track.tsx
│       ├── progress.tsx
│       └── profile.tsx
├── src/
│   ├── lib/
│   │   ├── supabase.ts    # Supabase client config
│   │   └── cn.ts          # className utility
│   └── components/
│       ├── TabBarIcon.tsx
│       └── ThemedScreen.tsx
├── tailwind.config.js     # Tailwind theme (matches web app)
├── babel.config.js        # Babel config with NativeWind
├── global.css             # Tailwind directives
└── .env                   # Environment variables
```

## Setup Instructions

### Prerequisites

- Node.js 20+
- iOS Simulator (for iOS development)
- Xcode (for iOS development)
- Android Studio (for Android development)

### Installation

1. Install dependencies:
```bash
cd mobile
npm install
```

2. Environment variables are already configured in `.env`:
   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

### Running the App

#### Start Expo Dev Server
```bash
npm run mobile:start
# or from mobile directory:
npm start
```

This will start the Metro bundler and show a QR code. You can:
- Press `i` to open iOS Simulator
- Press `a` to open Android Emulator
- Scan QR code with Expo Go app on physical device

#### Run on iOS Simulator
```bash
npm run mobile:ios
# or from mobile directory:
npm run ios
```

#### Run on Android Emulator
```bash
npm run mobile:android
# or from mobile directory:
npm run android
```

#### Run on Physical iPhone

**Option 1: Expo Go (Easiest)**
1. Install Expo Go app from App Store
2. Start dev server: `npm run mobile:start`
3. Scan QR code with iPhone camera
4. Opens in Expo Go automatically

**Option 2: Development Build (Full Features)**
1. Ensure you have an Apple Developer account
2. Build and install development build:
```bash
cd mobile
npx expo run:ios --device
```
3. Follow prompts to sign and install on your device

## Features

### Authentication
- Email/password sign-in via Supabase
- Secure token storage using Expo SecureStore
- Protected routes with automatic redirects
- Sign-out functionality

### Navigation
- 5 bottom tabs: Home, Schedule, Track, Progress, Profile
- Lucide icons matching web app
- Active state styling (#22C55E green)
- Native tab bar feel

### Styling
- Dark mode by default
- Color palette matches web app
- NativeWind/Tailwind classes
- Safe area insets handled

## Development Notes

### Supabase Integration
- Same Supabase project as web app
- Auth state synced via SecureStore
- Auto-refresh tokens
- Session persistence across app restarts

### Color Palette
- Primary: `#22C55E` (green)
- Background: `hsl(222.2, 84%, 4.9%)` (gray-950)
- Foreground: `hsl(210, 40%, 98%)` (gray-50)
- All colors defined in `tailwind.config.js`

### TypeScript
- Strict mode enabled
- Type-safe navigation with Expo Router
- Supabase types auto-generated

## Troubleshooting

### iOS Simulator Issues
- Reset Metro bundler: Press `R` in terminal
- Clear cache: `npx expo start --clear`
- Reset iOS Simulator: Device > Erase All Content and Settings

### Android Emulator Issues
- Ensure emulator is running before starting dev server
- Check Android SDK is properly installed
- Clear Metro cache: `npx expo start --clear`

### Build Errors
- Delete `node_modules` and reinstall: `rm -rf node_modules && npm install`
- Clear Expo cache: `npx expo start --clear`
- Check Node version: Should be 20+

### Auth Issues
- Verify `.env` file exists and has correct Supabase credentials
- Check Supabase dashboard for auth logs
- Clear SecureStore: Uninstall and reinstall app

## Next Steps

### Planned Features
1. Home dashboard with user stats
2. Schedule timeline with workouts
3. Track workout functionality
4. Progress charts and analytics
5. User profile editing
6. Push notifications
7. Offline support
8. Data sync with web app

### To Implement a New Screen
1. Create file in `app/` directory (e.g., `app/workout.tsx`)
2. Use `ThemedScreen` component for consistent styling
3. Import Supabase client from `@/src/lib/supabase`
4. Add navigation links using `expo-router`'s `Link` or `router.push()`

## Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)
- [NativeWind Documentation](https://www.nativewind.dev/)
- [Supabase React Native Documentation](https://supabase.com/docs/guides/getting-started/tutorials/with-expo-react-native)
