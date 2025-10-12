import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.fittracker.app",
  appName: "FitTracker",
  webDir: "out",
  bundledWebRuntime: false,
  server: {
    url: "https://your-production-domain.example.com/app2",
    cleartext: false,
  },
};

export default config;
