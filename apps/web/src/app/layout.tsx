import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans-arabic/400.css";
import "@fontsource/ibm-plex-sans-arabic/500.css";
import "@fontsource/ibm-plex-sans-arabic/600.css";
import "@fontsource/ibm-plex-sans-arabic/700.css";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";
import { AppLockGate } from "@/components/AppLockGate";
import { StorageFullBanner } from "@/components/StorageFullBanner";

export const metadata: Metadata = {
  title: "STAR NET",
  description: "إدارة حسابات وأجهزة Starlink",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#060A14",
};

// Applies a saved manual light/dark choice (settingsStore.ts's "starnet.theme") before first
// paint, so there's no flash of the wrong theme while React hydrates - kept in sync with
// applyThemePreference's own logic, duplicated here only because this must run as plain JS
// before any module import.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("starnet.theme");document.documentElement.setAttribute("data-theme",t==="light"||t==="system"?t:"dark");}catch(e){document.documentElement.setAttribute("data-theme","dark");}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // suppressHydrationWarning: the inline theme script sets data-theme on <html> before React
    // hydrates (to avoid a flash of the wrong theme), which React would otherwise flag.
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <AppLockGate>
          {children}
          <BottomNav />
        </AppLockGate>
        <StorageFullBanner />
      </body>
    </html>
  );
}
