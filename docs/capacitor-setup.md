# FitTracker Mobile Shell (Capacitor)

This document walks through creating the native shell around the existing Next.js app so we can ship a stable bottom navigation experience on iOS.

## 1. Install dependencies

```bash
npm install
```

The repository now includes `@capacitor/core` and the CLI in `package.json`.

## 2. Initialise Capacitor

Run the CLI initialisation **from the project root**:

```bash
npx cap init "FitTracker" com.fittracker.app --web-dir=out
```

We already committed `capacitor.config.ts`, so the `npx cap init` command will simply wire up Capacitor’s metadata. The config points to the deployed app (`https://your-production-domain.example.com/app2`). Update that value to match the live URL before building.

## 3. Add the iOS platform

```bash
npx cap add ios
```

This generates the `ios/` directory that contains the Xcode workspace. Commit this directory so future changes can be tracked in Git.

## 4. Sync web assets

Whenever you update the web app:

```bash
npm run build          # Next.js build (or export, if you create a static bundle)
npx cap sync ios       # or npm run cap:sync
```

While we are still loading the remote `/app2` deployment from Nginx, the sync step mainly ensures Capacitor config stays in sync with the native project.

## 5. Open the project in Xcode

```bash
npm run cap:open:ios
```

In Xcode:

1. Select the `App` target.
2. Set your signing team.
3. Choose a simulator or a connected device.
4. Build and run.

## 6. Local development URL (optional)

When you want to point the shell at a local dev server:

1. Start Next.js locally (`npm run dev`).
2. Update `capacitor.config.ts` locally to:

   ```ts
   server: {
     url: "http://192.168.X.X:3001", // your machine's LAN IP
     cleartext: true,
   }
   ```

3. Run `npm run cap:sync`.
4. Relaunch from Xcode.

Remember to revert the config to the production domain before committing.

## 7. Native bottom navigation

See `docs/native-bottom-nav.md` for the SwiftUI setup that keeps the nav fixed while the WebView scrolls behind it.

---

At this point you’ll have a working Capacitor shell that loads the FitTracker web experience. The next steps live in `docs/native-bottom-nav.md`, where we implement the native tab bar and wire it to the WebView.
