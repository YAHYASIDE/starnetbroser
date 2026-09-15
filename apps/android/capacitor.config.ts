import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.starnetbroser.app",
  appName: "STAR NET",
  webDir: "www",
  // The static export always ships with demo data until a real API is
  // deployed (see apps/web/.env.example) - this is intentional, matching
  // the same "no real accounts before production" safety rule as the
  // GitHub Pages preview.
  server: {
    androidScheme: "https",
  },
};

export default config;
