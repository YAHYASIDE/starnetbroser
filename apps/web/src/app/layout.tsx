import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "STAR NET",
  description: "إدارة حسابات وأجهزة Starlink",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f6e6e",
};

// Applies a saved manual light/dark choice (settingsStore.ts's "starnet.theme") before first
// paint, so there's no flash of the wrong theme while React hydrates - kept in sync with
// applyThemePreference's own logic, duplicated here only because this must run as plain JS
// before any module import.
const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("starnet.theme");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t);}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
        <BottomNav />
      </body>
    </html>
  );
}
